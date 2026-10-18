"""
Google Calendar Integration Package.

Provides OAuth 2.0 flow, token management, FreeBusy conflict detection,
and Google Meet conference link provisioning.
"""

from app.integrations.google_calendar.client import GoogleCalendarClient
from app.integrations.google_calendar.oauth import GoogleCalendarOAuthManager

__all__ = ["GoogleCalendarClient", "GoogleCalendarOAuthManager"]
