"""
Unit tests for BaseAdapter, CredentialManager, retry_with_backoff, and log_sync_event.
"""

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.integrations.audit import log_integration_audit
from app.integrations.base import (
    BaseAdapter,
    BaseIntegrationAdapter,
    CredentialManager,
    PermanentProviderError,
    TemporaryProviderError,
    log_sync_event,
    mask_credentials_dict,
    mask_secret,
    retry_with_backoff,
)


class ConcreteTestAdapter(BaseAdapter):
    """Concrete implementation of BaseAdapter for verifying lifecycle contract."""

    provider = "test_provider"

    async def connect(self) -> bool:
        self.is_connected = True
        return True

    async def disconnect(self) -> bool:
        self.is_connected = False
        return True

    async def status(self) -> dict:
        return {
            "provider": self.provider,
            "status": "connected" if self.is_connected else "not_connected",
            "last_sync_at": None,
            "details": {"healthy": True},
        }

    async def send(self, *args, **kwargs) -> dict:
        return {"delivered": True, "args": args}

    async def handle_webhook(self, *args, **kwargs) -> dict:
        return {"parsed": True, "payload": args}


def test_credential_manager_roundtrip():
    """Ensure dictionary credentials can be encrypted and cleanly decrypted."""
    cm = CredentialManager(key="test-secret-key-32chars-for-unit-test")
    original_creds = {
        "api_key": "sk_live_1234567890abcdef",
        "account_sid": "AC1234567890abcdef",
        "webhook_secret": "whsec_abcdef123456",
    }

    encrypted_token = cm.encrypt_credentials(original_creds)
    assert isinstance(encrypted_token, str)
    assert "sk_live_1234567890abcdef" not in encrypted_token

    decrypted = cm.decrypt_credentials(encrypted_token)
    assert decrypted == original_creds


def test_credential_manager_tampered_token():
    """Tampered token must raise an HTTPException 400 without leaking errors."""
    cm = CredentialManager(key="test-secret-key-32chars-for-unit-test")
    with pytest.raises(HTTPException) as exc_info:
        cm.decrypt_credentials("invalid-tampered-token-bytes")
    assert exc_info.value.status_code == 400
    assert "Invalid or corrupted" in exc_info.value.detail


def test_credential_manager_empty_token():
    """Empty token must raise HTTPException 400."""
    cm = CredentialManager()
    with pytest.raises(HTTPException) as exc_info:
        cm.decrypt_credentials("")
    assert exc_info.value.status_code == 400


def test_mask_secret():
    """Verify secrets are masked to prevent leaks in logs (format: prefix_****abcd)."""
    assert mask_secret("sk_test_1234567890abcd") == "sk_test_****abcd"
    assert mask_secret("AC123456789012345678") == "AC12****5678"
    assert mask_secret("short") == "******"
    assert mask_secret("") == ""
    assert mask_secret(None) == ""


def test_mask_credentials_dict():
    """Verify sensitive keys are masked in dictionaries."""
    creds = {
        "api_key": "super_secret_token_1234",
        "username": "leadflow_admin",
        "nested": {"client_secret": "sensitive_nested_value_5678", "version": "v1"},
    }
    masked = mask_credentials_dict(creds)
    assert masked["username"] == "leadflow_admin"
    assert "super_secret_token_1234" not in str(masked)
    assert "sensitive_nested_value_5678" not in str(masked)
    assert masked["nested"]["version"] == "v1"


@pytest.mark.anyio
async def test_base_adapter_contract():
    """Test standard BaseAdapter lifecycle, send, handle_webhook, and repr masking."""
    raw_creds = {"api_key": "super_secret_token_9999", "bot_token": "12345:bot_secret"}
    adapter = ConcreteTestAdapter(workspace_id=str(uuid4()), credentials=raw_creds)

    # Repr must NEVER leak secrets
    assert "super_secret_token_9999" not in repr(adapter)
    assert "12345:bot_secret" not in str(adapter)

    # Check connection lifecycle
    assert not adapter.is_connected
    assert await adapter.connect() is True
    assert adapter.is_connected is True

    status_data = await adapter.status()
    assert status_data["status"] == "connected"

    send_res = await adapter.send("outbound_alert", priority="high")
    assert send_res["delivered"] is True

    webhook_res = await adapter.handle_webhook({"event": "ping"})
    assert webhook_res["parsed"] is True

    assert await adapter.disconnect() is True
    assert adapter.is_connected is False


@pytest.mark.anyio
async def test_retry_with_backoff_temporary_error_recovers():
    """Temporary errors (429, timeouts) retry and succeed on subsequent attempt."""
    attempts = 0

    async def flaky_call():
        nonlocal attempts
        attempts += 1
        if attempts < 2:
            raise TemporaryProviderError("Rate limit exceeded (429)", provider="test_api")
        return {"success": True}

    res = await retry_with_backoff(flaky_call, max_retries=3, base_delay=0.01, provider="test_api")
    assert res == {"success": True}
    assert attempts == 2


@pytest.mark.anyio
async def test_retry_with_backoff_permanent_error_stops_immediately():
    """Permanent errors (400, 401, 403) must not be retried (attempt count == 1)."""
    attempts = 0

    async def unauthorized_call():
        nonlocal attempts
        attempts += 1
        raise PermanentProviderError("Unauthorized (401): Bad API token", provider="test_api")

    with pytest.raises(PermanentProviderError) as exc_info:
        await retry_with_backoff(unauthorized_call, max_retries=3, base_delay=0.01, provider="test_api")

    assert attempts == 1
    assert "Unauthorized (401)" in exc_info.value.message


@pytest.mark.anyio
async def test_retry_with_backoff_exhausts_retries():
    """Exhausting temporary retries raises TemporaryProviderError with plain reason."""
    attempts = 0

    async def always_failing():
        nonlocal attempts
        attempts += 1
        raise TemporaryProviderError("Server down (503)", provider="test_api")

    with pytest.raises(TemporaryProviderError):
        await retry_with_backoff(always_failing, max_retries=3, base_delay=0.01, provider="test_api")

    assert attempts == 3


@pytest.mark.anyio
async def test_log_sync_event_persistence():
    """Ensure log_sync_event creates and commits SyncLog record."""
    mock_db = MagicMock()
    mock_db.add = MagicMock()
    mock_db.commit = AsyncMock()
    mock_db.rollback = AsyncMock()

    workspace_id = uuid4()
    await log_sync_event(
        db=mock_db,
        workspace_id=workspace_id,
        direction="outbound",
        provider="telegram",
        result="success",
        external_reference="msg_98765",
        details={"chat_id": 123456},
    )

    mock_db.add.assert_called_once()
    mock_db.commit.assert_awaited_once()
    mock_db.rollback.assert_not_called()
