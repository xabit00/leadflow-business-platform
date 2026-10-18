"""
Unit tests for GoogleCalendarClient and GoogleCalendarOAuthManager.
Mocks all HTTP layer calls (httpx) inside tests/.
Verifies OAuth token exchange, refresh, invalid_grant handling, FreeBusy conflict detection,
and retry behaviors (429/5xx retried, 4xx permanent).
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import httpx
import pytest

from app.integrations.base import (
    PermanentProviderError,
    TemporaryProviderError,
)
from app.integrations.google_calendar.client import GoogleCalendarClient
from app.integrations.google_calendar.oauth import GoogleCalendarOAuthManager


@pytest.fixture
def oauth_manager():
    return GoogleCalendarOAuthManager(
        client_id="mock-client-id.apps.googleusercontent.com",
        client_secret="mock-client-secret-12345",
        redirect_uri="http://localhost:8000/api/v1/integrations/google-calendar/callback",
    )


@pytest.fixture
def calendar_client():
    return GoogleCalendarClient(
        workspace_id=uuid4(),
        credentials={
            "access_token": "ya29.mock-google-access-token",
            "refresh_token": "1//mock-google-refresh-token",
        },
    )


@pytest.mark.anyio
async def test_token_exchange_success(oauth_manager):
    """Verify authorization code is exchanged for real tokens via Google Token endpoint."""
    mock_response = MagicMock(spec=httpx.Response)
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "access_token": "ya29.mock_exchanged_token",
        "refresh_token": "1//mock_refresh_token",
        "expires_in": 3600,
        "token_type": "Bearer",
        "scope": "https://www.googleapis.com/auth/calendar.events",
    }

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_response
        tokens = await oauth_manager.exchange_code_for_tokens(code="mock_auth_code_123")

        mock_post.assert_called_once()
        call_kwargs = mock_post.call_args[1]
        assert call_kwargs["data"]["code"] == "mock_auth_code_123"
        assert call_kwargs["data"]["client_id"] == "mock-client-id.apps.googleusercontent.com"
        assert tokens["access_token"] == "ya29.mock_exchanged_token"
        assert tokens["refresh_token"] == "1//mock_refresh_token"


@pytest.mark.anyio
async def test_token_refresh_success(oauth_manager):
    """Verify refresh token exchanges for a fresh access token."""
    mock_response = MagicMock(spec=httpx.Response)
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "access_token": "ya29.mock_refreshed_access_token",
        "expires_in": 3600,
        "token_type": "Bearer",
    }

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_response
        result = await oauth_manager.refresh_access_token(refresh_token="1//mock_refresh_token")

        mock_post.assert_called_once()
        assert result["access_token"] == "ya29.mock_refreshed_access_token"


@pytest.mark.anyio
async def test_invalid_grant_marks_connection_needs_reconnect(oauth_manager):
    """When Google returns invalid_grant, connection must be marked 'needs_reconnect'."""
    mock_response = MagicMock(spec=httpx.Response)
    mock_response.status_code = 400
    mock_response.headers = {"content-type": "application/json"}
    mock_response.json.return_value = {
        "error": "invalid_grant",
        "error_description": "Token has been expired or revoked.",
    }

    mock_connection = MagicMock()
    mock_connection.status = "connected"

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_response

        with pytest.raises(PermanentProviderError) as exc_info:
            await oauth_manager.refresh_access_token(
                refresh_token="1//revoked_token",
                connection=mock_connection,
            )

        assert exc_info.value.status_code == 401
        assert "revoked or expired" in exc_info.value.message
        assert mock_connection.status == "needs_reconnect"
        assert "invalid_grant" in mock_connection.last_error or "revoked" in mock_connection.last_error


@pytest.mark.anyio
async def test_freebusy_conflict_detected(calendar_client):
    """check_freebusy returns False when conflicts exist and True when open."""
    now = datetime.now(timezone.utc)
    start = now + timedelta(days=1, hours=10)
    end = start + timedelta(hours=1)

    # 1. Conflict case: calendar returns busy interval
    conflict_response = MagicMock(spec=httpx.Response)
    conflict_response.status_code = 200
    conflict_response.json.return_value = {
        "calendars": {
            "primary": {
                "busy": [
                    {
                        "start": start.isoformat(),
                        "end": end.isoformat(),
                    }
                ]
            }
        }
    }

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = conflict_response
        is_free = await calendar_client.check_freebusy(start_time=start, end_time=end)
        assert is_free is False  # Conflict detected

    # 2. Available case: calendar returns empty busy list
    free_response = MagicMock(spec=httpx.Response)
    free_response.status_code = 200
    free_response.json.return_value = {
        "calendars": {"primary": {"busy": []}}
    }

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = free_response
        is_free = await calendar_client.check_freebusy(start_time=start, end_time=end)
        assert is_free is True  # Slot is open


@pytest.mark.anyio
async def test_google_calendar_429_5xx_retried(calendar_client):
    """429 and 5xx responses must be retried with backoff and succeed."""
    now = datetime.now(timezone.utc)
    start = now + timedelta(days=1)
    end = start + timedelta(minutes=30)

    rate_limit_resp = MagicMock(spec=httpx.Response)
    rate_limit_resp.status_code = 429

    server_error_resp = MagicMock(spec=httpx.Response)
    server_error_resp.status_code = 503

    ok_resp = MagicMock(spec=httpx.Response)
    ok_resp.status_code = 200
    ok_resp.json.return_value = {"calendars": {"primary": {"busy": []}}}

    with patch(
        "httpx.AsyncClient.post",
        new_callable=AsyncMock,
        side_effect=[rate_limit_resp, server_error_resp, ok_resp],
    ) as mock_post:
        with patch("asyncio.sleep", return_value=None):
            result = await calendar_client.check_freebusy(start, end)

        assert mock_post.call_count == 3
        assert result is True


@pytest.mark.anyio
async def test_google_calendar_4xx_not_retried(calendar_client):
    """401 unauthorized must immediately fail without retry."""
    now = datetime.now(timezone.utc)
    start = now + timedelta(days=1)
    end = start + timedelta(minutes=30)

    unauth_resp = MagicMock(spec=httpx.Response)
    unauth_resp.status_code = 401

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = unauth_resp
        with pytest.raises(PermanentProviderError) as exc_info:
            await calendar_client.check_freebusy(start, end)

        assert exc_info.value.status_code == 401
        assert mock_post.call_count == 1
