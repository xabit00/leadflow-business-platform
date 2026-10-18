"""
SQLAlchemy ORM models for the integrations layer.

Maps to tables owned by the shared schema (workspaces, webhook_events,
workspace_members, ...) defined in the database migrations. Member 3 owns
these integration-scoped models; Member 2 owns the core entity models.
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from app.database.base import Base


class WebhookEvent(Base):
    """Idempotency ledger for incoming third-party webhook events."""

    __tablename__ = "webhook_events"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    workspace_id = Column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    provider = Column(String, nullable=False, index=True)
    event_id = Column(String, nullable=False, index=True)
    event_type = Column(String, nullable=False)
    payload = Column(JSONB, nullable=False)
    status = Column(
        String,
        nullable=False,
        server_default=text("'received'"),
        index=True,
    )
    received_at = Column(DateTime(timezone=True), server_default=text("now()"), nullable=False)
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
        ForeignKey("auth.users(id)", ondelete="CASCADE"),
        nullable=False,
        primary_key=True,
        index=True,
    )
    role = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=text("now()"), nullable=False)


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
    actor_id = Column(
        UUID(as_uuid=True),
        nullable=True,
        index=True,
    )
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

