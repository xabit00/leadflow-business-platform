"""
Pydantic schemas for the integrations layer.
"""

import uuid
from datetime import datetime
from typing import Any, List

from pydantic import BaseModel, Field


class WebhookEventResponse(BaseModel):
    id: uuid.UUID
    provider: str
    event_id: str
    event_type: str
    status: str
    received_at: datetime
    processed_at: datetime | None = None

    model_config = {"from_attributes": True}


class DashboardMetrics(BaseModel):
    """Aggregated dashboard metrics for a single workspace (tenant-isolated)."""

    payments_received_this_month_cents: int = Field(
        default=0, description="Cents received from successful payments this month"
    )
    upcoming_appointments: int = Field(
        default=0, description="Count of appointments scheduled in the future"
    )
    integration_health: List[dict] = Field(
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
    email: str | None = None
