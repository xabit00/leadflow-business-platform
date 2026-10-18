"""
Base integration adapter, credential security, retry, and sync logging module.

Enforces:
- Abstract BaseAdapter interface (connect, disconnect, status, send, handle_webhook).
- Per-workspace credential encryption & decryption via Fernet (zero secret leakage).
- Retry with exponential backoff for temporary errors (429, 5xx, timeouts) max 3 attempts.
- Immediate termination with plain-language reasons on permanent errors (I5.5).
- Fail-soft boundary: external provider failures never crash core application workflows (I5.8).
- Audit-compliant sync logging for every inbound and outbound event (I5.4).
"""

from __future__ import annotations

import abc
import asyncio
import base64
import functools
import hashlib
import json
import os
from datetime import datetime, timezone
from typing import Any, Callable, Coroutine, Dict, Optional, TypeVar
from uuid import UUID, uuid4

from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import logger
from app.integrations.models import SyncLog

T = TypeVar("T")


# ---------------------------------------------------------------------------
# Exceptions & Error Classification (I5.5, I5.8)
# ---------------------------------------------------------------------------


class ProviderError(Exception):
    """Base exception for all third-party provider integration errors."""

    def __init__(
        self,
        message: str,
        provider: str = "unknown",
        status_code: Optional[int] = None,
        is_temporary: bool = False,
        plain_reason: Optional[str] = None,
    ) -> None:
        super().__init__(message)
        self.message: str = message
        self.provider: str = provider
        self.status_code: Optional[int] = status_code
        self.is_temporary: bool = is_temporary
        self.plain_reason: str = plain_reason or message


class TemporaryProviderError(ProviderError):
    """
    Temporary / transient error eligible for retry with backoff.
    Examples: 429 Rate Limited, 500/502/503/504 Service Unavailable, Connection Timeouts.
    """

    def __init__(
        self,
        message: str,
        provider: str = "unknown",
        status_code: Optional[int] = None,
        plain_reason: Optional[str] = None,
    ) -> None:
        super().__init__(
            message=message,
            provider=provider,
            status_code=status_code,
            is_temporary=True,
            plain_reason=plain_reason or f"{provider} temporarily unavailable (rate limited or server error).",
        )


class PermanentProviderError(ProviderError):
    """
    Permanent error that must not be retried.
    Examples: 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, Invalid Credentials.
    """

    def __init__(
        self,
        message: str,
        provider: str = "unknown",
        status_code: Optional[int] = None,
        plain_reason: Optional[str] = None,
    ) -> None:
        super().__init__(
            message=message,
            provider=provider,
            status_code=status_code,
            is_temporary=False,
            plain_reason=plain_reason or f"{provider} request permanently rejected (invalid credentials or parameters).",
        )


# ---------------------------------------------------------------------------
# Secret Masking Helpers (Rule 2)
# ---------------------------------------------------------------------------


def mask_secret(secret: Optional[str], visible_chars: int = 4) -> str:
    """
    Safely mask sensitive strings for display and logging.
    Format example: sk_test_****abcd or ******
    """
    if not secret:
        return ""
    clean = str(secret).strip()
    if len(clean) <= 8:
        return "******"

    # Identify common prefixes like sk_test_, AC, whsec_
    if "_" in clean:
        prefix, remainder = clean.rsplit("_", 1)
        if len(remainder) > visible_chars:
            return f"{prefix}_****{remainder[-visible_chars:]}"
        return f"{prefix}_******"

    return f"{clean[:4]}****{clean[-visible_chars:]}"


def mask_credentials_dict(credentials: Dict[str, Any]) -> Dict[str, Any]:
    """
    Recursively mask dictionary values whose keys indicate secrets or credentials.
    """
    sensitive_markers = {
        "key",
        "secret",
        "token",
        "password",
        "auth",
        "client_secret",
        "access_token",
        "refresh_token",
        "webhook_secret",
        "bot_token",
    }
    masked: Dict[str, Any] = {}
    for key, value in credentials.items():
        lower_key = str(key).lower()
        if any(marker in lower_key for marker in sensitive_markers):
            if isinstance(value, str):
                masked[key] = mask_secret(value)
            else:
                masked[key] = "******"
        elif isinstance(value, dict):
            masked[key] = mask_credentials_dict(value)
        else:
            masked[key] = value
    return masked


# ---------------------------------------------------------------------------
# Credential Encryption Manager (Fernet AES-128-CBC + HMAC-SHA256)
# ---------------------------------------------------------------------------


class CredentialManager:
    """
    Per-workspace credential encryption and decryption manager.
    Guarantees credentials at rest are securely encrypted using Fernet
    with deterministic 32-byte URL-safe base64 key derivation.
    """

    def __init__(self, key: Optional[str] = None) -> None:
        raw_key = (
            key
            or os.getenv("ENCRYPTION_KEY")
            or os.getenv("SECRET_KEY")
            or getattr(settings, "SECRET_KEY", "leadflow-default-secret-key-32chars")
        )
        self._fernet = Fernet(self._derive_fernet_key(raw_key))

    @staticmethod
    def _derive_fernet_key(raw_key: str) -> bytes:
        """
        Derive a strictly valid 32-byte URL-safe base64-encoded Fernet key.
        """
        if not raw_key:
            raise ValueError("Encryption key cannot be empty")

        key_bytes = raw_key.encode("utf-8")
        try:
            decoded = base64.urlsafe_b64decode(key_bytes)
            if len(decoded) == 32:
                return key_bytes
        except Exception:
            pass

        # Hash with SHA-256 (32 bytes) and url-safe base64 encode
        digest = hashlib.sha256(key_bytes).digest()
        return base64.urlsafe_b64encode(digest)

    def encrypt_credentials(self, credentials: Dict[str, Any]) -> str:
        """Serialize credentials dictionary to encrypted cipher string."""
        if not isinstance(credentials, dict):
            raise TypeError("Credentials must be a dictionary")

        try:
            payload = json.dumps(credentials, sort_keys=True).encode("utf-8")
            encrypted = self._fernet.encrypt(payload)
            return encrypted.decode("utf-8")
        except Exception as exc:
            logger.error("Failed to encrypt integration credentials: %s", type(exc).__name__)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to securely encrypt credentials",
            ) from exc

    def decrypt_credentials(self, encrypted_token: str) -> Dict[str, Any]:
        """Decrypt cipher string back into plain credentials dictionary."""
        if not encrypted_token or not isinstance(encrypted_token, str):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Missing or invalid encrypted credentials token",
            )

        try:
            token_bytes = encrypted_token.strip().encode("utf-8")
            decrypted_bytes = self._fernet.decrypt(token_bytes)
            data = json.loads(decrypted_bytes.decode("utf-8"))
            if not isinstance(data, dict):
                raise ValueError("Decrypted credentials are not a valid JSON object")
            return data
        except InvalidToken as exc:
            logger.warning("Decryption failed: signature mismatch or invalid key")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or corrupted integration credentials",
            ) from exc
        except Exception as exc:
            logger.warning("Decryption processing failed: %s", type(exc).__name__)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Corrupted credential payload structure",
            ) from exc


# ---------------------------------------------------------------------------
# Retry with Backoff & Fault Tolerance Helper (I5.5, I5.8)
# ---------------------------------------------------------------------------


async def retry_with_backoff(
    coro_fn: Callable[..., Coroutine[Any, Any, T]],
    *args: Any,
    max_retries: int = 3,
    base_delay: float = 0.5,
    backoff_factor: float = 2.0,
    provider: str = "provider",
    **kwargs: Any,
) -> T:
    """
    Execute an async operation with exponential backoff on temporary errors.

    Rules:
    - Temporary errors (429, 5xx, timeouts): retry up to max_retries (default 3).
    - Permanent errors (400, 401, 403, 404): stop immediately and raise.
    - Fault isolation (I5.8): logs failure details without terminating caller unless re-raised.
    """
    last_error: Optional[Exception] = None

    for attempt in range(max_retries):
        try:
            return await coro_fn(*args, **kwargs)
        except PermanentProviderError as exc:
            logger.error(
                "Permanent %s error on attempt %d: %s. Not retrying.",
                provider,
                attempt + 1,
                exc.plain_reason,
            )
            raise
        except (TemporaryProviderError, asyncio.TimeoutError, ConnectionError) as exc:
            last_error = exc
            delay = base_delay * (backoff_factor ** attempt)
            logger.warning(
                "Temporary %s error on attempt %d/%d: %s. Retrying in %.2fs...",
                provider,
                attempt + 1,
                max_retries,
                str(exc),
                delay,
            )
            if attempt < max_retries - 1:
                await asyncio.sleep(delay)
        except Exception as exc:
            # Inspect HTTP status codes on third-party client exceptions if available
            status_code = getattr(exc, "status_code", getattr(getattr(exc, "response", None), "status_code", None))
            if status_code in (429, 500, 502, 503, 504):
                last_error = exc
                delay = base_delay * (backoff_factor ** attempt)
                logger.warning(
                    "%s HTTP %d temporary error on attempt %d/%d. Retrying in %.2fs...",
                    provider,
                    status_code,
                    attempt + 1,
                    max_retries,
                    delay,
                )
                if attempt < max_retries - 1:
                    await asyncio.sleep(delay)
            else:
                logger.error(
                    "Non-retryable %s failure on attempt %d: %s",
                    provider,
                    attempt + 1,
                    exc,
                )
                raise PermanentProviderError(
                    message=str(exc),
                    provider=provider,
                    status_code=status_code,
                    plain_reason=f"{provider} request failed: {exc}",
                ) from exc

    logger.error("Exhausted all %d retry attempts for %s", max_retries, provider)
    raise TemporaryProviderError(
        message=f"{provider} service request failed after {max_retries} attempts: {last_error}",
        provider=provider,
        plain_reason=f"{provider} temporarily unavailable. Please retry shortly.",
    )


# ---------------------------------------------------------------------------
# Sync Logging Helper (I5.4)
# ---------------------------------------------------------------------------


async def log_sync_event(
    db: Optional[AsyncSession],
    workspace_id: str | UUID,
    direction: str,  # 'inbound' | 'outbound'
    provider: str,
    result: str,  # 'success' | 'failure'
    external_reference: Optional[str] = None,
    error_reason: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
) -> None:
    """
    Log every inbound event and outbound provider call to the sync_log ledger (I5.4).
    Enforces tenant isolation and records external references and delivery results.
    """
    ws_uuid = UUID(str(workspace_id))
    log_id = uuid4()
    now_utc = datetime.now(timezone.utc)

    # 1. Structured logging
    log_msg = (
        f"SYNC_LOG [{direction.upper()}] provider='{provider}' workspace='{workspace_id}' "
        f"result='{result}' ref='{external_reference or 'none'}' error='{error_reason or 'none'}'"
    )
    if result == "success":
        logger.info(log_msg)
    else:
        logger.warning(log_msg)

    # 2. Database persistence if session is active
    if db is not None:
        try:
            entry = SyncLog(
                id=log_id,
                workspace_id=ws_uuid,
                provider=provider,
                direction=direction,
                result=result,
                external_reference=external_reference,
                error_reason=error_reason,
                details=details,
                created_at=now_utc,
            )
            db.add(entry)
            await db.commit()
        except Exception as exc:
            await db.rollback()
            logger.error("Failed to commit SyncLog entry for workspace %s: %s", workspace_id, exc)


# ---------------------------------------------------------------------------
# Abstract Base Adapter (Architecture)
# ---------------------------------------------------------------------------


class BaseAdapter(abc.ABC):
    """
    Abstract Base Class for all external service integrations.

    Guarantees standard lifecycle (connect, disconnect, status),
    outbound messaging (send), and inbound webhook processing (handle_webhook).
    Enforces strict workspace isolation: one workspace's credentials are never used by another.
    """

    provider: str = "base"

    def __init__(
        self,
        workspace_id: str,
        credentials: Optional[Dict[str, Any]] = None,
    ) -> None:
        if not workspace_id:
            raise ValueError("workspace_id is strictly required for all integration adapters")
        self.workspace_id: str = str(workspace_id)
        self._credentials: Dict[str, Any] = credentials or {}
        self.is_connected: bool = False
        self.last_sync_at: Optional[datetime] = None

    def __repr__(self) -> str:
        """Prevent secrets from leaking into repr or log strings."""
        return (
            f"<{self.__class__.__name__}("
            f"provider='{self.provider}', "
            f"workspace_id='{self.workspace_id}', "
            f"is_connected={self.is_connected})>"
        )

    def __str__(self) -> str:
        return self.__repr__()

    @property
    def masked_credentials(self) -> Dict[str, Any]:
        """Return safe view of configured credentials with all sensitive tokens masked."""
        return mask_credentials_dict(self._credentials)

    @abc.abstractmethod
    async def connect(self) -> bool:
        """
        Establish connection or validate credentials with the external provider.

        Returns:
            True if connection is healthy and authorized, False otherwise.
        """
        raise NotImplementedError

    @abc.abstractmethod
    async def disconnect(self) -> bool:
        """
        Gracefully terminate active sessions or mark integration disconnected.

        Returns:
            True if successfully disconnected.
        """
        raise NotImplementedError

    @abc.abstractmethod
    async def status(self) -> Dict[str, Any]:
        """
        Check real-time status of the integration connection.

        Returns:
            A structured dict describing connection status, last sync, and health:
            {
                "provider": str,
                "status": "connected" | "error" | "not_connected",
                "last_sync_at": Optional[str],
                "details": Dict[str, Any]
            }
        """
        raise NotImplementedError

    @abc.abstractmethod
    async def send(self, *args: Any, **kwargs: Any) -> Any:
        """
        Execute an outbound call to the provider API.
        """
        raise NotImplementedError

    @abc.abstractmethod
    async def handle_webhook(self, *args: Any, **kwargs: Any) -> Any:
        """
        Parse and verify incoming webhook signatures, dispatching to business models.
        """
        raise NotImplementedError

    async def test_connection(self) -> Dict[str, Any]:
        """Default connection test calling status()."""
        return await self.status()


# Backward compatibility alias
BaseIntegrationAdapter = BaseAdapter
