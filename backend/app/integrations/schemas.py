"""
Pydantic schemas for the integrations layer.

Enforces strict input validation on all webhook ingresses, provider connections,
and tenant-scoped requests (Q3, Q10).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class WebhookEventResponse(BaseModel):
    """Standard response model for webhook deliveries."""

    id: uuid.UUID
    provider: str
    event_id: str
    event_type: str
    status: str
    received_at: datetime
    processed_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class DashboardMetrics(BaseModel):
    """Aggregated dashboard metrics for a single workspace (tenant-isolated)."""

    payments_received_this_month_cents: int = Field(
        default=0, description="Cents received from successful payments this month"
    )
    upcoming_appointments: int = Field(
        default=0, description="Count of appointments scheduled in the future"
    )
    integration_health: List[Dict[str, Any]] = Field(
        default_factory=list, description="Per-provider integration status"
    )
    recent_errors_24h: int = Field(
        default=0, description="Count of error audit logs in the last 24 hours"
    )
    failed_notifications: int = Field(
        default=0, description="Count of failed notification audit logs"
    )


class CurrentUser(BaseModel):
    """Authenticated user resolved from the request session / bearer token."""

    id: uuid.UUID
    email: Optional[str] = None
    role: Optional[str] = "member"


# ---------------------------------------------------------------------------
# Integration Connection & Management Schemas (I5.1, I5.6, I5.7)
# ---------------------------------------------------------------------------


class IntegrationConnectRequest(BaseModel):
    """Payload to connect or update integration credentials."""

    workspace_id: uuid.UUID
    provider: str = Field(..., description="Provider name: twilio, stripe, google_calendar, telegram")
    credentials: Dict[str, Any] = Field(..., description="Provider API keys/tokens to be encrypted")
    config: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Optional provider configuration")


class IntegrationStatusResponse(BaseModel):
    """Detailed health and status of an integration connection with masked secrets."""

    provider: str
    status: str  # 'connected', 'disconnected', 'error', 'revoked'
    last_success_at: Optional[datetime] = None
    last_error: Optional[str] = None
    masked_credentials: Dict[str, Any] = Field(default_factory=dict)
    limits: Optional[str] = None
    details: Dict[str, Any] = Field(default_factory=dict)


class IntegrationListItem(BaseModel):
    """Summary of an integration for workspace settings list."""

    provider: str
    name: str
    status: str
    last_success_at: Optional[datetime] = None
    last_error: Optional[str] = None
    limits: str


# ---------------------------------------------------------------------------
# Real Stripe Checkout Schemas (I2.1)
# ---------------------------------------------------------------------------


class CreateCheckoutSessionRequest(BaseModel):
    """Request payload to create a real Stripe Checkout Session."""

    workspace_id: uuid.UUID
    amount_cents: int = Field(gt=0, description="Amount in cents (e.g. 5000 for $50.00)")
    currency: str = Field(default="USD", max_length=3)
    opportunity_id: Optional[uuid.UUID] = None
    contact_id: Optional[uuid.UUID] = None
    customer_email: Optional[str] = None
    success_url: Optional[str] = None
    cancel_url: Optional[str] = None


class CheckoutSessionResponse(BaseModel):
    """Response payload for a real Stripe Checkout Session."""

    checkout_session_id: str
    url: str
    amount_cents: int
    currency: str
    status: str


# ---------------------------------------------------------------------------
# Calendar & Booking Schemas (I3.5, I3.6)
# ---------------------------------------------------------------------------


class BookAppointmentRequest(BaseModel):
    """Request payload to schedule an appointment with FreeBusy check and Google Meet."""

    workspace_id: uuid.UUID
    title: str = Field(min_length=1, max_length=255)
    start_at: datetime
    end_at: datetime
    timezone: str = Field(default="UTC", description="IANA timezone identifier")
    assigned_user_id: Optional[uuid.UUID] = None
    contact_id: Optional[uuid.UUID] = None


class AppointmentResponse(BaseModel):
    """Response payload for scheduled appointment."""

    id: uuid.UUID
    workspace_id: uuid.UUID
    title: str
    start_at: datetime
    end_at: datetime
    timezone: str = "UTC"
    meet_url: Optional[str] = None
    status: str
    google_calendar_event_id: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Telegram Alert Schemas (I4.1)
# ---------------------------------------------------------------------------


class TelegramAlertRequest(BaseModel):
    """Request payload to dispatch an escalation alert via Telegram Bot."""

    workspace_id: uuid.UUID
    chat_id: Optional[str] = Field(None, description="Target chat ID or channel (defaults to configured)")
    lead_name: str
    source: str
    reason: str
    lead_id: Optional[uuid.UUID] = None
    assigned_to: Optional[str] = "Unassigned"
