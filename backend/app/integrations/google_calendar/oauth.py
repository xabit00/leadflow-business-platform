"""
Google Calendar OAuth 2.0 Flow and Token Management.

Manages real Google OAuth 2.0 authorization URL construction, code exchange,
and token refresh using Google's OAuth endpoints via httpx.
"""

from __future__ import annotations

import secrets
import urllib.parse
from typing import Any, Dict, Optional
from uuid import UUID

import httpx

from app.core.config import settings
from app.core.logging import logger
from app.integrations.base import PermanentProviderError, TemporaryProviderError

GOOGLE_AUTH_BASE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"

CALENDAR_SCOPES = [
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/userinfo.email",
]


class GoogleCalendarOAuthManager:
    """
    Manages genuine Google Calendar OAuth 2.0 authorization flow and tokens.
    """

    def __init__(
        self,
        client_id: Optional[str] = None,
        client_secret: Optional[str] = None,
        redirect_uri: Optional[str] = None,
    ) -> None:
        self.client_id: str = client_id or settings.GOOGLE_CLIENT_ID or ""
        self.client_secret: str = client_secret or settings.GOOGLE_CLIENT_SECRET or ""
        self.redirect_uri: str = (
            redirect_uri
            or settings.GOOGLE_REDIRECT_URI
            or "http://localhost:8000/api/v1/integrations/google-calendar/callback"
        )

    def get_authorization_url(
        self,
        workspace_id: UUID,
        state: Optional[str] = None,
    ) -> Dict[str, str]:
        """
        Generate a Google OAuth 2.0 consent URL for the requested workspace.
        """
        if not self.client_id:
            raise PermanentProviderError(
                message="Google Client ID is not configured",
                provider="google_calendar",
                status_code=400,
                plain_reason="GOOGLE_CLIENT_ID is not set in environment or workspace config.",
            )

        csrf_token = state or secrets.token_urlsafe(16)
        combined_state = f"{workspace_id}:{csrf_token}"

        params = {
            "client_id": self.client_id,
            "redirect_uri": self.redirect_uri,
            "response_type": "code",
            "scope": " ".join(CALENDAR_SCOPES),
            "access_type": "offline",
            "prompt": "consent",
            "state": combined_state,
        }

        auth_url = f"{GOOGLE_AUTH_BASE_URL}?{urllib.parse.urlencode(params)}"
        return {
            "auth_url": auth_url,
            "state": combined_state,
            "workspace_id": str(workspace_id),
        }

    async def exchange_code_for_tokens(
        self,
        code: str,
        redirect_uri: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Exchange an authorization code for real Google OAuth tokens via Google Token API.
        """
        if not code:
            raise PermanentProviderError(
                message="Missing authorization code",
                provider="google_calendar",
                status_code=400,
                plain_reason="Authorization code is missing from OAuth callback.",
            )

        if not self.client_id or not self.client_secret:
            raise PermanentProviderError(
                message="Google OAuth credentials are not configured",
                provider="google_calendar",
                status_code=400,
                plain_reason="Google Client ID or Client Secret is missing.",
            )

        payload = {
            "code": code,
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "redirect_uri": redirect_uri or self.redirect_uri,
            "grant_type": "authorization_code",
        }

        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                response = await client.post(GOOGLE_TOKEN_URL, data=payload)
            except httpx.RequestError as exc:
                raise TemporaryProviderError(
                    message=f"Network error during Google token exchange: {exc}",
                    provider="google_calendar",
                    status_code=503,
                    plain_reason="Unable to connect to Google OAuth service.",
                ) from exc

        if response.status_code == 200:
            data = response.json()
            return {
                "access_token": data["access_token"],
                "refresh_token": data.get("refresh_token"),
                "expires_in": data.get("expires_in", 3600),
                "token_type": data.get("token_type", "Bearer"),
                "scope": data.get("scope", " ".join(CALENDAR_SCOPES)),
            }

        error_data = response.json() if "application/json" in response.headers.get("content-type", "") else {}
        error_desc = error_data.get("error_description", response.text)
        logger.error("Google token exchange rejected: %s %s", response.status_code, error_desc)

        if response.status_code in (400, 401):
            raise PermanentProviderError(
                message=f"Google rejected authorization code: {error_desc}",
                provider="google_calendar",
                status_code=response.status_code,
                plain_reason=f"Google OAuth authorization code is invalid or expired: {error_desc}",
            )

        raise TemporaryProviderError(
            message=f"Google token endpoint returned error: {response.status_code} - {error_desc}",
            provider="google_calendar",
            status_code=response.status_code,
            plain_reason="Google OAuth service encountered an unexpected error. Retrying...",
        )

    async def refresh_access_token(
        self,
        refresh_token: str,
        workspace_id: Optional[UUID | str] = None,
        db: Optional[Any] = None,
        connection: Optional[Any] = None,
    ) -> Dict[str, Any]:
        """
        Exchange a valid refresh token for a fresh Google access token.
        Detects invalid_grant when tokens are revoked or expired, marking
        the connection as 'needs_reconnect'.
        """
        if not refresh_token:
            raise PermanentProviderError(
                message="Missing refresh token",
                provider="google_calendar",
                status_code=400,
                plain_reason="No refresh token available to refresh access.",
            )

        payload = {
            "refresh_token": refresh_token,
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "grant_type": "refresh_token",
        }

        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                response = await client.post(GOOGLE_TOKEN_URL, data=payload)
            except httpx.RequestError as exc:
                raise TemporaryProviderError(
                    message=f"Network error refreshing Google token: {exc}",
                    provider="google_calendar",
                    status_code=503,
                    plain_reason="Unable to connect to Google OAuth servers.",
                ) from exc

        if response.status_code == 200:
            data = response.json()
            return {
                "access_token": data["access_token"],
                "expires_in": data.get("expires_in", 3600),
                "token_type": data.get("token_type", "Bearer"),
            }

        error_data = response.json() if "application/json" in response.headers.get("content-type", "") else {}
        error_code = error_data.get("error")
        error_desc = error_data.get("error_description", response.text)

        if error_code == "invalid_grant" or response.status_code in (400, 401):
            # Mark connection as needs_reconnect when tokens are revoked or expired
            if connection is not None:
                connection.status = "needs_reconnect"
                connection.last_error = f"Token revoked or expired: {error_desc}"
            elif db is not None and workspace_id is not None:
                try:
                    from app.integrations.base import get_workspace_integration
                    conn = await get_workspace_integration(db, workspace_id, "google_calendar")
                    if conn:
                        conn.status = "needs_reconnect"
                        conn.last_error = f"Token revoked or expired: {error_desc}"
                        await db.commit()
                except Exception as db_exc:
                    logger.error("Failed to mark Google Calendar connection needs_reconnect: %s", db_exc)

            raise PermanentProviderError(
                message=f"Google refresh token revoked or expired: {error_desc}",
                provider="google_calendar",
                status_code=401,
                plain_reason="Google Calendar access was revoked or expired. Please reconnect Google Calendar.",
            )

        raise TemporaryProviderError(
            message=f"Google token refresh failed: {response.status_code} - {error_desc}",
            provider="google_calendar",
            status_code=response.status_code,
            plain_reason="Google token refresh failed temporarily. Retrying...",
        )
