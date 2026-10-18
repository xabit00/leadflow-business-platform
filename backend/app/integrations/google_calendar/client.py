"""
Google Calendar API Client.

Provides real Google Calendar v3 integration via HTTP REST endpoints (httpx):
  - FreeBusy conflict checks (calendar/v3/freeBusy)
  - Event creation with Google Meet provisioning (calendar/v3/calendars/primary/events?conferenceDataVersion=1)
  - Event rescheduling (PATCH) and cancellation (DELETE)
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import logger
from app.integrations.audit import log_integration_audit
from app.integrations.base import (
    BaseAdapter,
    PermanentProviderError,
    TemporaryProviderError,
    log_sync_event,
    retry_with_backoff,
)
from app.integrations.models import Appointment

GOOGLE_CALENDAR_BASE_URL = "https://www.googleapis.com/calendar/v3"


class GoogleCalendarClient(BaseAdapter):
    """
    Google Calendar v3 API Client.
    Manages genuine calendar synchronization, FreeBusy analysis, and Google Meet generation.
    """

    provider = "google_calendar"

    def __init__(
        self,
        workspace_id: str | UUID,
        credentials: Optional[Dict[str, Any]] = None,
    ) -> None:
        creds = credentials or {}
        super().__init__(workspace_id=str(workspace_id), credentials=creds)
        self.access_token: str = creds.get("access_token") or ""
        self.refresh_token: str = creds.get("refresh_token") or ""

    @property
    def _headers(self) -> Dict[str, str]:
        if not self.access_token:
            raise PermanentProviderError(
                message="Google Calendar access token is missing",
                provider=self.provider,
                status_code=401,
                plain_reason="Google Calendar is not connected or requires re-authentication.",
            )
        return {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json",
        }

    async def connect(self, db: Optional[AsyncSession] = None) -> bool:
        """Verify access token validity against Google Calendar API."""
        if not self.access_token:
            raise PermanentProviderError(
                message="Google Calendar access token is missing",
                provider=self.provider,
                status_code=401,
                plain_reason="No Google Calendar token connected for this workspace.",
            )

        async def _check_api() -> bool:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.get(
                    f"{GOOGLE_CALENDAR_BASE_URL}/users/me/calendarList/primary",
                    headers=self._headers,
                )
                if res.status_code == 200:
                    return True
                if res.status_code == 401:
                    raise PermanentProviderError(
                        message="Google Calendar token unauthorized",
                        provider=self.provider,
                        status_code=401,
                        plain_reason="Google Calendar token expired or invalid.",
                    )
                if res.status_code == 429:
                    raise TemporaryProviderError(
                        message="Google Calendar rate limited",
                        provider=self.provider,
                        status_code=429,
                    )
                raise TemporaryProviderError(
                    message=f"Google Calendar error: {res.status_code}",
                    provider=self.provider,
                    status_code=res.status_code,
                )

        try:
            self.is_connected = await retry_with_backoff(_check_api, max_retries=3, provider=self.provider)
            await log_sync_event(
                db=db,
                workspace_id=self.workspace_id,
                direction="outbound",
                provider=self.provider,
                result="success",
                external_reference="calendar.get",
            )
            return True
        except Exception as exc:
            await log_sync_event(
                db=db,
                workspace_id=self.workspace_id,
                direction="outbound",
                provider=self.provider,
                result="failure",
                external_reference="calendar.get",
                error_reason=str(exc),
            )
            raise

    async def disconnect(self) -> bool:
        self.is_connected = False
        return True

    async def status(self) -> Dict[str, Any]:
        return {
            "provider": self.provider,
            "status": "connected" if self.is_connected else "disconnected",
            "last_sync_at": self.last_sync_at.isoformat() if self.last_sync_at else None,
            "details": {
                "has_access_token": bool(self.access_token),
                "has_refresh_token": bool(self.refresh_token),
                "conference_type": "google_meet",
            },
            "limits": "Google Cloud OAuth consent screen test user limits apply until app verification.",
        }

    async def send(self, *args: Any, **kwargs: Any) -> Any:
        return await self.book_appointment(*args, **kwargs)

    async def handle_webhook(self, *args: Any, **kwargs: Any) -> Any:
        return {"acknowledged": True}

    async def check_freebusy(
        self,
        start_time: datetime,
        end_time: datetime,
        calendar_id: str = "primary",
    ) -> bool:
        """
        Query real Google Calendar FreeBusy API to determine slot availability.
        Returns True if the time slot is free, False if occupied.
        """
        payload = {
            "timeMin": start_time.isoformat(),
            "timeMax": end_time.isoformat(),
            "items": [{"id": calendar_id}],
        }

        async def _query() -> bool:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(
                    f"{GOOGLE_CALENDAR_BASE_URL}/freeBusy",
                    headers=self._headers,
                    json=payload,
                )
                if res.status_code == 200:
                    data = res.json()
                    busy_slots = data.get("calendars", {}).get(calendar_id, {}).get("busy", [])
                    return len(busy_slots) == 0
                if res.status_code == 401:
                    raise PermanentProviderError(
                        message="Google token invalid during FreeBusy query",
                        provider=self.provider,
                        status_code=401,
                        plain_reason="Google token invalid.",
                    )
                if res.status_code == 429:
                    raise TemporaryProviderError(
                        message="Google FreeBusy rate limited",
                        provider=self.provider,
                        status_code=429,
                    )
                raise TemporaryProviderError(
                    message=f"Google FreeBusy error: {res.status_code}",
                    provider=self.provider,
                    status_code=res.status_code,
                )

        return await retry_with_backoff(_query, max_retries=3, provider=self.provider)

    async def book_appointment(
        self,
        title: str,
        start_at: datetime,
        end_at: datetime,
        timezone_str: str = "UTC",
        description: Optional[str] = None,
        attendees: Optional[List[str]] = None,
        calendar_id: str = "primary",
        db: Optional[AsyncSession] = None,
    ) -> Dict[str, Any]:
        """
        Create a genuine Google Calendar event with Google Meet video conference provisioning.
        """
        event_body = {
            "summary": title,
            "description": description or f"Scheduled demo via LeadFlow for workspace {self.workspace_id}",
            "start": {
                "dateTime": start_at.isoformat(),
                "timeZone": timezone_str,
            },
            "end": {
                "dateTime": end_at.isoformat(),
                "timeZone": timezone_str,
            },
            "conferenceData": {
                "createRequest": {
                    "requestId": str(uuid4()),
                    "conferenceSolutionKey": {"type": "hangoutsMeet"},
                }
            },
            "attendees": [{"email": email} for email in (attendees or [])],
        }

        async def _insert() -> Dict[str, Any]:
            async with httpx.AsyncClient(timeout=15.0) as client:
                res = await client.post(
                    f"{GOOGLE_CALENDAR_BASE_URL}/calendars/{calendar_id}/events?conferenceDataVersion=1",
                    headers=self._headers,
                    json=event_body,
                )
                if res.status_code in (200, 201):
                    return res.json()
                if res.status_code == 401:
                    raise PermanentProviderError(
                        message="Google Calendar token unauthorized",
                        provider=self.provider,
                        status_code=401,
                    )
                if res.status_code == 429:
                    raise TemporaryProviderError(
                        message="Google Calendar rate limited",
                        provider=self.provider,
                        status_code=429,
                    )
                raise TemporaryProviderError(
                    message=f"Google Calendar event creation failed: {res.status_code} - {res.text}",
                    provider=self.provider,
                    status_code=res.status_code,
                )

        event = await retry_with_backoff(_insert, max_retries=3, provider=self.provider)

        meet_url = None
        for entry in event.get("conferenceData", {}).get("entryPoints", []):
            if entry.get("entryPointType") == "video":
                meet_url = entry.get("uri")
                break

        await log_sync_event(
            db=db,
            workspace_id=self.workspace_id,
            direction="outbound",
            provider=self.provider,
            result="success",
            external_reference=event.get("id"),
            details={"title": title, "meet_url": meet_url},
        )

        return {
            "google_calendar_event_id": event.get("id"),
            "meet_url": meet_url,
            "html_link": event.get("htmlLink"),
            "start_at": start_at,
            "end_at": end_at,
            "title": title,
        }

    async def reschedule_appointment(
        self,
        event_id: str,
        start_at: datetime,
        end_at: datetime,
        timezone_str: str = "UTC",
        calendar_id: str = "primary",
        db: Optional[AsyncSession] = None,
    ) -> Dict[str, Any]:
        """Reschedule existing Google Calendar event."""
        patch_body = {
            "start": {"dateTime": start_at.isoformat(), "timeZone": timezone_str},
            "end": {"dateTime": end_at.isoformat(), "timeZone": timezone_str},
        }

        async def _patch() -> Dict[str, Any]:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.patch(
                    f"{GOOGLE_CALENDAR_BASE_URL}/calendars/{calendar_id}/events/{event_id}",
                    headers=self._headers,
                    json=patch_body,
                )
                if res.status_code == 200:
                    return res.json()
                if res.status_code == 404:
                    raise PermanentProviderError(
                        message=f"Google Calendar event {event_id} not found",
                        provider=self.provider,
                        status_code=404,
                    )
                raise TemporaryProviderError(
                    message=f"Google Calendar patch failed: {res.status_code}",
                    provider=self.provider,
                    status_code=res.status_code,
                )

        updated_event = await retry_with_backoff(_patch, max_retries=3, provider=self.provider)

        await log_sync_event(
            db=db,
            workspace_id=self.workspace_id,
            direction="outbound",
            provider=self.provider,
            result="success",
            external_reference=event_id,
            details={"action": "reschedule", "start_at": start_at.isoformat()},
        )
        return updated_event

    async def cancel_appointment(
        self,
        event_id: str,
        calendar_id: str = "primary",
        db: Optional[AsyncSession] = None,
    ) -> bool:
        """Delete event from Google Calendar."""
        async def _delete() -> bool:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.delete(
                    f"{GOOGLE_CALENDAR_BASE_URL}/calendars/{calendar_id}/events/{event_id}",
                    headers=self._headers,
                )
                if res.status_code in (200, 204):
                    return True
                if res.status_code == 404:
                    return True  # Already deleted
                raise TemporaryProviderError(
                    message=f"Google Calendar delete failed: {res.status_code}",
                    provider=self.provider,
                    status_code=res.status_code,
                )

        success = await retry_with_backoff(_delete, max_retries=3, provider=self.provider)

        await log_sync_event(
            db=db,
            workspace_id=self.workspace_id,
            direction="outbound",
            provider=self.provider,
            result="success",
            external_reference=event_id,
            details={"action": "cancel"},
        )
        return success
