"""
SQLAlchemy ORM models for the integrations layer.

Maps to tables defined in the database schema:
  - workspace_integrations (IntegrationConnection): Per-workspace encrypted provider credentials & status.
  - webhook_events: Replay-protected idempotency ledger for third-party webhooks.
  - payments: Tenant-partitioned payment ledger for Stripe test-mode settlements.
  - appointments: Tenant-partitioned calendar bookings with Google Meet links.
  - sync_logs: Audit ledger tracking every inbound and outbound provider call.
  - conversations & messages: Bi-directional communication ledger for Twilio WhatsApp / SMS.
  - contacts & leads: Customer entities for automatic inbound WhatsApp lead intake.
  - workspace_members & audit_logs: Multi-tenant BOLA authorization and immutable audit trail.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.database.base import Base


class IntegrationConnection(Base):
    """
    Per-workspace integration connection and encrypted credential store.
    Guarantees strict tenant isolation: credentials for one workspace
    are never accessible to another.
    """

    __tablename__ = "workspace_integrations"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    workspace_id = Column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    provider = Column(String(50), nullable=False, index=True)
    status = Column(
        String(50),
        nullable=False,
        default="disconnected",
        server_default=text("'disconnected'"),
        index=True,
    )
    encrypted_credentials = Column(Text, nullable=True)
    config = Column(JSONB, nullable=True, default=dict)
    last_success_at = Column(DateTime(timezone=True), nullable=True)
    last_error = Column(Text, nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=text("now()"),
        nullable=False,
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=text("now()"),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint(
            "workspace_id", "provider", name="uq_workspace_integrations_ws_provider"
        ),
        CheckConstraint(
            "provider IN ('stripe', 'twilio', 'google_calendar', 'telegram', 'slack')",
            name="ck_workspace_integrations_provider",
        ),
        CheckConstraint(
            "status IN ('connected', 'disconnected', 'error', 'revoked', 'needs_reconnect')",
            name="ck_workspace_integrations_status",
        ),
    )


class WebhookEvent(Base):
    """Idempotency ledger for incoming third-party webhook events."""

    __tablename__ = "webhook_events"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    workspace_id = Column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    provider = Column(String(50), nullable=False, index=True)
    event_id = Column(String(255), nullable=False, index=True)
    event_type = Column(String(100), nullable=False)
    payload = Column(JSONB, nullable=False)
    status = Column(
        String(50),
        nullable=False,
        default="received",
        server_default=text("'received'"),
        index=True,
    )
    received_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=text("now()"),
        nullable=False,
    )
    processed_at = Column(DateTime(timezone=True), nullable=True)
    error = Column(Text, nullable=True)

    __table_args__ = (
        UniqueConstraint("provider", "event_id", name="uq_webhook_events_provider_event_id"),
        CheckConstraint(
            "status IN ('received','processing','processed','failed','ignored')",
            name="ck_webhook_events_status",
        ),
    )


class WorkspaceMember(Base):
    """Workspace membership (tenant isolation) used for BOLA prevention."""

    __tablename__ = "workspace_members"

    workspace_id = Column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        primary_key=True,
        index=True,
    )
    user_id = Column(
        UUID(as_uuid=True),
        nullable=False,
        primary_key=True,
        index=True,
    )
    role = Column(String(50), nullable=False, default="member")
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=text("now()"),
        nullable=False,
    )


class AuditLog(Base):
    """
    Immutable audit log entry for tenant and integration actions.
    Append-only ledger: records who did what, when, and state changes.
    """

    __tablename__ = "audit_logs"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    workspace_id = Column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    actor_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    action = Column(String(100), nullable=False, index=True)
    entity_type = Column(String(50), nullable=False)
    entity_id = Column(UUID(as_uuid=True), nullable=False)
    before_state = Column(JSONB, nullable=True)
    after_state = Column(JSONB, nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=text("now()"),
        nullable=False,
    )


class Payment(Base):
    """
    Tenant-partitioned payment transaction record.
    Tracks successful, pending, and failed payment intents and checkouts.
    """

    __tablename__ = "payments"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    workspace_id = Column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    opportunity_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    contact_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    amount_cents = Column(Integer, nullable=False)
    currency = Column(String(3), nullable=False, default="USD", server_default=text("'USD'"))
    payment_method = Column(String(50), nullable=False, default="stripe", server_default=text("'stripe'"))
    stripe_payment_intent_id = Column(String(255), nullable=True, index=True)
    status = Column(
        String(50),
        nullable=False,
        default="pending",
        server_default=text("'pending'"),
        index=True,
    )
    receipt_url = Column(Text, nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=text("now()"),
        nullable=False,
        index=True,
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=text("now()"),
        nullable=False,
    )


class Appointment(Base):
    """
    Tenant-partitioned scheduled appointment with Google Meet video integration.
    """

    __tablename__ = "appointments"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    workspace_id = Column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title = Column(String(255), nullable=False)
    start_at = Column(DateTime(timezone=True), nullable=False, index=True)
    end_at = Column(DateTime(timezone=True), nullable=False)
    timezone = Column(String(50), nullable=False, default="UTC", server_default=text("'UTC'"))
    assigned_user_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    contact_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    google_calendar_event_id = Column(String(255), nullable=True)
    meet_url = Column(Text, nullable=True)
    status = Column(
        String(50),
        nullable=False,
        default="scheduled",
        server_default=text("'scheduled'"),
        index=True,
    )
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=text("now()"),
        nullable=False,
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=text("now()"),
        nullable=False,
    )


class SyncLog(Base):
    """
    Sync log tracking every inbound event and outbound call per workspace (I5.4).
    Enforces tenant isolation and records external references and delivery results.
    """

    __tablename__ = "sync_logs"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    workspace_id = Column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    provider = Column(String(50), nullable=False, index=True)
    direction = Column(String(20), nullable=False)  # 'inbound' | 'outbound'
    result = Column(String(20), nullable=False)  # 'success' | 'failure'
    external_reference = Column(String(255), nullable=True, index=True)
    error_reason = Column(Text, nullable=True)
    details = Column(JSONB, nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=text("now()"),
        nullable=False,
        index=True,
    )


class Conversation(Base):
    """Omni-channel conversation thread (Twilio WhatsApp / SMS)."""

    __tablename__ = "conversations"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    workspace_id = Column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    channel = Column(String(50), nullable=False, default="whatsapp")
    external_thread_id = Column(String(255), nullable=True, index=True)
    contact_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    status = Column(String(50), nullable=False, default="active", server_default=text("'active'"))
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=text("now()"),
        nullable=False,
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=text("now()"),
        nullable=False,
    )


class Message(Base):
    """Individual message within a conversation."""

    __tablename__ = "messages"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    conversation_id = Column(
        UUID(as_uuid=True),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sender_type = Column(String(50), nullable=False)  # 'user', 'contact', 'system'
    sender_id = Column(String(100), nullable=True)
    body = Column(Text, nullable=False)
    delivery_status = Column(String(50), nullable=False, default="sent", server_default=text("'sent'"))
    external_message_id = Column(String(255), nullable=True, index=True)
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=text("now()"),
        nullable=False,
    )


