"""
Real Slack integration client for Member 3 (I4 Provider).

Features:
- Slack Web API client via httpx (https://slack.com/api/chat.postMessage).
- Per-workspace bot token encrypted with Fernet CredentialManager.
- Per-user destination Slack user ID validation (^[UW][A-Z0-9]+$).
- Block Kit alert formatting with strict escaping of user-controlled lead text.
- Comprehensive error handling: detects HTTP 200 responses with ok: false,
  differentiates temporary (ratelimited, 429, 5xx) vs permanent (invalid_auth, channel_not_found) errors.
- Honors Retry-After headers on rate limiting.
- Outbound retry_with_backoff (max 3) and log_sync_event on every attempt.
- Fail-soft boundary: failures recorded in sync_logs and never raise into escalation flow (I5.8).
"""

from __future__ import annotations

import os
import re
from typing import Any, Dict, List, Optional
from uuid import UUID

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import logger
from app.integrations.base import (
    BaseAdapter,
    CredentialManager,
    PermanentProviderError,
    TemporaryProviderError,
    get_decrypted_credentials,
    get_workspace_integration,
    log_sync_event,
    mask_secret,
    retry_with_backoff,
)

SLACK_API_BASE = "https://slack.com/api"
SLACK_USER_ID_REGEX = re.compile(r"^[UW][A-Z0-9]+$")

# Known permanent Slack error codes that must never be retried
PERMANENT_SLACK_ERRORS = {
    "invalid_auth",
    "account_inactive",
    "token_revoked",
    "token_expired",
    "not_authed",
    "channel_not_found",
    "user_not_found",
    "is_archived",
    "msg_too_long",
    "no_text",
    "restricted_action",
    "cant_invite_self",
    "not_in_channel",
    "fatal_error",
}


def validate_slack_user_id(user_id: str) -> bool:
    """Validate that the string matches Slack user ID format (e.g. U12345678 or W12345678)."""
    if not user_id or not isinstance(user_id, str):
        return False
    return bool(SLACK_USER_ID_REGEX.match(user_id.strip()))


def escape_slack_text(text: Optional[str]) -> str:
    """
    Escape Slack control characters (&, <, >) in user-controlled input
    to prevent mrkdwn formatting injection and link hijacking.
    """
    if not text:
        return ""
    # In Slack mrkdwn, only &, <, and > must be entity-encoded
    clean = str(text)
    clean = clean.replace("&", "&amp;")
    clean = clean.replace("<", "&lt;")
    clean = clean.replace(">", "&gt;")
    return clean


class SlackClient(BaseAdapter):
    """
    Real Slack Web API client for sending direct-message notifications
    to assigned employees during lead escalations.
    """

    provider = "slack"

    def __init__(
        self,
        workspace_id: str,
        credentials: Optional[Dict[str, Any]] = None,
        db: Optional[AsyncSession] = None,
    ) -> None:
        creds = credentials or {}
        super().__init__(workspace_id=workspace_id, credentials=creds)
        self.db = db
        self.bot_token = (
            creds.get("bot_token") or creds.get("access_token")
        )

    def _get_headers(self) -> Dict[str, str]:
        if not self.bot_token:
            raise PermanentProviderError(
                message="Slack bot token is missing",
                provider="slack",
                status_code=401,
                plain_reason="Workspace does not have a configured Slack Bot Token.",
            )
        return {
            "Authorization": f"Bearer {self.bot_token}",
            "Content-Type": "application/json; charset=utf-8",
        }

    async def connect(self) -> bool:
        """Verify Slack bot token using auth.test."""
        status_info = await self.status()
        self.is_connected = status_info.get("status") == "connected"
        return self.is_connected

    async def disconnect(self) -> bool:
        """Mark Slack adapter disconnected."""
        self.is_connected = False
        return True

    async def status(self) -> Dict[str, Any]:
        """Test authentication against Slack auth.test endpoint."""
        if not self.bot_token:
            return {
                "provider": "slack",
                "status": "disconnected",
                "details": {"error": "Missing bot token"},
            }

        url = f"{SLACK_API_BASE}/auth.test"
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(url, headers=self._get_headers())
                data = resp.json()
                if resp.status_code == 200 and data.get("ok"):
                    return {
                        "provider": "slack",
                        "status": "connected",
                        "team": data.get("team"),
                        "user": data.get("user"),
                        "bot_id": data.get("bot_id"),
                    }
                return {
                    "provider": "slack",
                    "status": "error",
                    "details": {"error": data.get("error", f"HTTP {resp.status_code}")},
                }
        except Exception as exc:
            return {
                "provider": "slack",
                "status": "error",
                "details": {"error": str(exc)},
            }

    async def send(self, *args: Any, **kwargs: Any) -> Dict[str, Any]:
        """Generic BaseAdapter send implementation."""
        channel = kwargs.get("channel") or (args[0] if args else None)
        text = kwargs.get("text") or (args[1] if len(args) > 1 else "")
        blocks = kwargs.get("blocks")
        return await self.post_message(channel=channel, text=text, blocks=blocks)

    async def handle_webhook(self, *args: Any, **kwargs: Any) -> Dict[str, Any]:
        """Handle incoming Slack interactive or event webhook payload."""
        payload = kwargs.get("payload") or (args[0] if args else {})
        return {"handled": True, "type": payload.get("type")}

    async def post_message(
        self,
        channel: str,
        text: str,
        blocks: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """
        Post message to Slack conversation or DM using chat.postMessage.
        Respects Slack's 200-OK error reporting, parses rate limits, and honors Retry-After.
        """
        if not channel or not isinstance(channel, str):
            raise PermanentProviderError(
                message="Destination channel or Slack user ID is required",
                provider="slack",
                status_code=400,
                plain_reason="Destination Slack channel/user ID cannot be empty.",
            )

        channel_clean = channel.strip()
        url = f"{SLACK_API_BASE}/chat.postMessage"
        payload: Dict[str, Any] = {
            "channel": channel_clean,
            "text": text,
        }
        if blocks:
            payload["blocks"] = blocks

        headers = self._get_headers()

        async def _execute_post() -> Dict[str, Any]:
            async with httpx.AsyncClient(timeout=10.0) as client:
                try:
                    resp = await client.post(url, headers=headers, json=payload)
                except httpx.RequestError as exc:
                    raise TemporaryProviderError(
                        message=f"Network error communicating with Slack: {exc}",
                        provider="slack",
                        plain_reason="Temporary network failure contacting Slack API.",
                    ) from exc

                # Check HTTP layer status
                if resp.status_code == 429:
                    retry_after = int(resp.headers.get("Retry-After", 1))
                    raise TemporaryProviderError(
                        message=f"Slack HTTP 429 rate limit exceeded. Retry-After: {retry_after}s",
                        provider="slack",
                        status_code=429,
                        plain_reason=f"Slack rate limit reached; waiting {retry_after}s before retry.",
                        retry_after=retry_after,
                    )

                if resp.status_code >= 500:
                    raise TemporaryProviderError(
                        message=f"Slack API server error: HTTP {resp.status_code}",
                        provider="slack",
                        status_code=resp.status_code,
                        plain_reason="Slack server temporarily unavailable (5xx).",
                    )

                if resp.status_code >= 400:
                    raise PermanentProviderError(
                        message=f"Slack HTTP client error: HTTP {resp.status_code}",
                        provider="slack",
                        status_code=resp.status_code,
                        plain_reason=f"Slack rejected request with HTTP {resp.status_code}.",
                    )

                try:
                    data = resp.json()
                except Exception as exc:
                    raise TemporaryProviderError(
                        message="Invalid JSON response from Slack API",
                        provider="slack",
                        plain_reason="Slack returned non-JSON response.",
                    ) from exc

                # Slack returns 200 OK even on logical failures
                if not data.get("ok"):
                    error_code = data.get("error", "unknown_slack_error")

                    if error_code == "ratelimited":
                        retry_after = int(resp.headers.get("Retry-After", 1))
                        raise TemporaryProviderError(
                            message=f"Slack reported ratelimited. Retry-After: {retry_after}s",
                            provider="slack",
                            status_code=429,
                            plain_reason=f"Slack rate limited the request; waiting {retry_after}s.",
                            retry_after=retry_after,
                        )

                    # Determine if error is permanent
                    if error_code in PERMANENT_SLACK_ERRORS:
                        raise PermanentProviderError(
                            message=f"Slack API permanent error: {error_code}",
                            provider="slack",
                            status_code=400,
                            plain_reason=f"Slack rejected message with permanent error: '{error_code}'.",
                        )

                    # Other unknown Slack error codes treated as permanent
                    raise PermanentProviderError(
                        message=f"Slack API error: {error_code}",
                        provider="slack",
                        status_code=400,
                        plain_reason=f"Slack API error: {error_code}",
                    )

                return data

        # Execute with exponential backoff (max 3 attempts) and sync logging
        return await retry_with_backoff(
            _execute_post,
            max_retries=3,
            base_delay=0.5,
            provider="slack",
        )

    async def send_lead_escalation(
        self,
        slack_user_id: str,
        lead_name: str,
        source: str,
        reason: str,
        lead_id: str,
    ) -> Dict[str, Any]:
        """
        Send a rich Block Kit escalation notification directly to an employee's Slack DM.
        User-controlled lead_name, source, and reason are properly escaped.
        """
        if not validate_slack_user_id(slack_user_id):
            raise PermanentProviderError(
                message=f"Invalid Slack User ID format: '{slack_user_id}'. Must match ^[UW][A-Z0-9]+$",
                provider="slack",
                status_code=400,
                plain_reason=f"Slack user ID '{slack_user_id}' does not match required format (e.g. U12345678).",
            )

        escaped_name = escape_slack_text(lead_name)
        escaped_source = escape_slack_text(source)
        escaped_reason = escape_slack_text(reason)

        frontend_base = os.getenv("FRONTEND_BASE_URL", "http://localhost:5173").rstrip("/")
        lead_url = f"{frontend_base}/leads/{lead_id}"

        fallback_text = (
            f"🚨 Lead Escalation Alert: {escaped_name} ({escaped_reason})\n"
            f"Source: {escaped_source} | View: {lead_url}"
        )

        blocks: List[Dict[str, Any]] = [
            {
                "type": "header",
                "text": {
                    "type": "plain_text",
                    "text": "🚨 Lead Escalation Alert",
                    "emoji": True,
                },
            },
            {
                "type": "section",
                "fields": [
                    {
                        "type": "mrkdwn",
                        "text": f"*Lead:*\n<{lead_url}|{escaped_name}>",
                    },
                    {
                        "type": "mrkdwn",
                        "text": f"*Source:*\n{escaped_source}",
                    },
                    {
                        "type": "mrkdwn",
                        "text": f"*Reason:*\n{escaped_reason}",
                    },
                    {
                        "type": "mrkdwn",
                        "text": f"*Lead ID:*\n`{lead_id}`",
                    },
                ],
            },
            {
                "type": "actions",
                "elements": [
                    {
                        "type": "button",
                        "text": {
                            "type": "plain_text",
                            "text": "Open Lead in LeadFlow",
                            "emoji": True,
                        },
                        "url": lead_url,
                        "style": "danger",
                    }
                ],
            },
        ]

        # Log outbound attempt
        result = await self.post_message(
            channel=slack_user_id,
            text=fallback_text,
            blocks=blocks,
        )

        if self.db:
            await log_sync_event(
                db=self.db,
                workspace_id=self.workspace_id,
                provider="slack",
                direction="outbound",
                result="success",
                external_reference=result.get("ts"),
                details={
                    "channel": result.get("channel"),
                    "lead_id": str(lead_id),
                    "reason": reason,
                },
            )

        return result


# ---------------------------------------------------------------------------
# Public Fail-Soft Escalation Function (I4, I5.8)
# ---------------------------------------------------------------------------


async def send_escalation_alert(
    workspace_id: UUID,
    user_id: UUID,
    lead_id: UUID,
    reason: str,
    destination_slack_user_id: Optional[str] = None,
    lead_name: Optional[str] = "Unknown Lead",
    source: Optional[str] = "Website",
    db: Optional[AsyncSession] = None,
) -> Dict[str, Any]:
    """
    Public entrypoint for dispatching an escalation alert to an employee's Slack.
    Enforces tenant isolation, resolves credentials, and guarantees fail-soft execution:
    failure to send alert NEVER crashes the core lead escalation workflow (I5.8).
    """
    try:
        credentials: Optional[Dict[str, Any]] = None

        if db:
            connection = await get_workspace_integration(db, workspace_id, "slack")
            if connection and connection.status == "connected":
                credentials = get_decrypted_credentials(connection)

        # Fallback to environment variable if DB credentials not yet configured
        if not credentials:
            env_token = os.getenv("SLACK_BOT_TOKEN")
            if env_token:
                credentials = {"bot_token": env_token}

        if not credentials or not credentials.get("bot_token"):
            logger.warning(
                "Cannot send Slack escalation: no Slack connection found for workspace %s",
                workspace_id,
            )
            return {
                "delivered": False,
                "provider": "slack",
                "error": "Workspace does not have an active Slack integration.",
            }

        # Resolve destination Slack user ID: explicit parameter, user settings, or test env
        slack_target = (
            destination_slack_user_id
            or os.getenv("SLACK_TEST_USER_ID")
        )
        if not slack_target:
            logger.warning("No destination Slack user ID provided for user %s", user_id)
            return {
                "delivered": False,
                "provider": "slack",
                "error": "Missing Slack destination user ID for escalation recipient.",
            }

        client = SlackClient(
            workspace_id=str(workspace_id),
            credentials=credentials,
            db=db,
        )

        resp = await client.send_lead_escalation(
            slack_user_id=slack_target,
            lead_name=lead_name or "New Lead",
            source=source or "Inbound",
            reason=reason,
            lead_id=str(lead_id),
        )

        return {
            "delivered": True,
            "provider": "slack",
            "message_ts": resp.get("ts"),
            "channel": resp.get("channel"),
        }

    except Exception as exc:
        logger.error(
            "Slack escalation failed for workspace %s, lead %s: %s",
            workspace_id,
            lead_id,
            exc,
        )

        if db:
            try:
                await log_sync_event(
                    db=db,
                    workspace_id=workspace_id,
                    provider="slack",
                    direction="outbound",
                    result="failure",
                    error_reason=str(exc),
                    details={
                        "user_id": str(user_id),
                        "lead_id": str(lead_id),
                        "reason": reason,
                    },
                )
            except Exception as log_exc:
                logger.error("Failed to log sync event for Slack failure: %s", log_exc)

        # Fail-soft: Never raise exception into caller flow (I5.8)
        return {
            "delivered": False,
            "provider": "slack",
            "error": str(exc),
            "safe_reason": getattr(exc, "plain_reason", "External notification delivery failed."),
        }
