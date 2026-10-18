'''SQLAlchemy models for the initial LeadFlow schema.'''

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, TenantScopedMixin, TimestampMixin, UUIDPrimaryKeyMixin


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Workspace(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = 'workspaces'
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    plan: Mapped[str] = mapped_column(String(50), default='free', server_default='free')
    settings: Mapped[dict] = mapped_column(JSONB, default=dict, server_default=text('\'{}\'::jsonb'))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default='true')


class User(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = 'users'
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    phone_number: Mapped[str | None] = mapped_column(String(50))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default='true')
    is_superuser: Mapped[bool] = mapped_column(Boolean, default=False, server_default='false')


class Role(UUIDPrimaryKeyMixin, TenantScopedMixin, Base):
    __tablename__ = 'roles'
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    permissions: Mapped[list] = mapped_column(JSONB, nullable=False)
    is_system_role: Mapped[bool] = mapped_column(Boolean, default=False, server_default='false')
    __table_args__ = (UniqueConstraint('workspace_id', 'name'), Index('ix_roles_workspace_created', 'workspace_id', 'created_at'))


class UserWorkspaceRole(TimestampMixin, Base):
    __tablename__ = 'user_workspace_roles'
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    workspace_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('workspaces.id', ondelete='CASCADE'), primary_key=True)
    role_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('roles.id', ondelete='CASCADE'), primary_key=True)
    __table_args__ = (Index('ix_user_workspace_roles_workspace_user', 'workspace_id', 'user_id'),)


class Company(UUIDPrimaryKeyMixin, TenantScopedMixin, Base):
    __tablename__ = 'companies'
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    domain: Mapped[str | None] = mapped_column(String(255))
    industry: Mapped[str | None] = mapped_column(String(100))
    phone: Mapped[str | None] = mapped_column(String(50))
    address: Mapped[dict | None] = mapped_column(JSONB)
    __table_args__ = (Index('ix_companies_workspace_created', 'workspace_id', 'created_at'),)


class Contact(UUIDPrimaryKeyMixin, TenantScopedMixin, Base):
    __tablename__ = 'contacts'
    company_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey('companies.id', ondelete='SET NULL'))
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str | None] = mapped_column(String(100))
    email: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(50))
    custom_attributes: Mapped[dict] = mapped_column(JSONB, default=dict, server_default=text('\'{}\'::jsonb'))
    __table_args__ = (Index('ix_contacts_workspace_created', 'workspace_id', 'created_at'),)


class Pipeline(UUIDPrimaryKeyMixin, TenantScopedMixin, Base):
    __tablename__ = 'pipelines'
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, server_default='false')
    __table_args__ = (Index('ix_pipelines_workspace_created', 'workspace_id', 'created_at'),)


class PipelineStage(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = 'pipeline_stages'
    pipeline_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('pipelines.id', ondelete='CASCADE'), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    stage_order: Mapped[int] = mapped_column(Integer, nullable=False)
    win_probability: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=0, server_default='0')
    is_closed_won: Mapped[bool] = mapped_column(Boolean, default=False, server_default='false')
    is_closed_lost: Mapped[bool] = mapped_column(Boolean, default=False, server_default='false')
    __table_args__ = (UniqueConstraint('pipeline_id', 'stage_order'), CheckConstraint('win_probability >= 0 AND win_probability <= 100'))


class Opportunity(UUIDPrimaryKeyMixin, TenantScopedMixin, Base):
    __tablename__ = 'opportunities'
    contact_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey('contacts.id', ondelete='SET NULL'))
    company_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey('companies.id', ondelete='SET NULL'))
    pipeline_stage_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('pipeline_stages.id'), nullable=False)
    assigned_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='SET NULL'))
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    estimated_value: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, server_default='0')
    currency: Mapped[str] = mapped_column(String(3), default='USD', server_default='USD')
    expected_close_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(50), default='open', server_default='open')
    __table_args__ = (Index('ix_opportunities_workspace_created', 'workspace_id', 'created_at'), CheckConstraint('status IN (\'open\', \'won\', \'lost\', \'abandoned\')'))


class CustomField(UUIDPrimaryKeyMixin, TenantScopedMixin, Base):
    __tablename__ = 'custom_fields'
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    field_key: Mapped[str] = mapped_column(String(100), nullable=False)
    field_label: Mapped[str] = mapped_column(String(150), nullable=False)
    field_type: Mapped[str] = mapped_column(String(50), nullable=False)
    options: Mapped[list] = mapped_column(JSONB, default=list, server_default=text('\'[]\'::jsonb'))
    is_required: Mapped[bool] = mapped_column(Boolean, default=False, server_default='false')
    __table_args__ = (UniqueConstraint('workspace_id', 'entity_type', 'field_key'), Index('ix_custom_fields_workspace_created', 'workspace_id', 'created_at'))


class Lead(UUIDPrimaryKeyMixin, TenantScopedMixin, Base):
    __tablename__ = 'leads'
    source: Mapped[str] = mapped_column(String(100), nullable=False)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(50))
    notes: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(50), default='new', server_default='new')
    score: Mapped[int] = mapped_column(Integer, default=0, server_default='0')
    sla_acknowledgement_due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    assigned_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='SET NULL'), index=True)
    __table_args__ = (Index('ix_leads_workspace_created', 'workspace_id', 'created_at'),)


class LeadAssignment(UUIDPrimaryKeyMixin, Base):
    __tablename__ = 'lead_assignments'
    lead_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('leads.id', ondelete='CASCADE'), index=True, nullable=False)
    assigned_to_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=False)
    assigned_by_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='SET NULL'))
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, server_default=text('CURRENT_TIMESTAMP'))
    assignment_rule: Mapped[str] = mapped_column(String(100), default='round-robin', server_default='round-robin')
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(50), default='pending', server_default='pending')


class LeadEscalation(UUIDPrimaryKeyMixin, Base):
    __tablename__ = 'lead_escalations'
    lead_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('leads.id', ondelete='CASCADE'), index=True, nullable=False)
    escalation_level: Mapped[int] = mapped_column(Integer, default=1, server_default='1')
    reason: Mapped[str] = mapped_column(String(255), nullable=False)
    previous_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='SET NULL'))
    escalated_to_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='SET NULL'))
    notified_via: Mapped[str | None] = mapped_column(String(50))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, server_default=text('CURRENT_TIMESTAMP'))


class Activity(UUIDPrimaryKeyMixin, TenantScopedMixin, Base):
    __tablename__ = 'activities'
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    activity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    due_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_completed: Mapped[bool] = mapped_column(Boolean, default=False, server_default='false')
    __table_args__ = (Index('ix_activities_workspace_created', 'workspace_id', 'created_at'),)


class AuditEvent(UUIDPrimaryKeyMixin, Base):
    __tablename__ = 'audit_events'
    workspace_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('workspaces.id', ondelete='CASCADE'), nullable=False)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='SET NULL'))
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(50), nullable=False)
    resource_id: Mapped[str] = mapped_column(String(100), nullable=False)
    diff_before: Mapped[dict | None] = mapped_column(JSONB)
    diff_after: Mapped[dict | None] = mapped_column(JSONB)
    ip_address: Mapped[str | None] = mapped_column(String(45))
    user_agent: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, server_default=text('CURRENT_TIMESTAMP'))
    __table_args__ = (Index('ix_audit_events_workspace_created', 'workspace_id', 'created_at'),)


class Conversation(UUIDPrimaryKeyMixin, TenantScopedMixin, Base):
    __tablename__ = 'conversations'
    channel: Mapped[str] = mapped_column(String(50), nullable=False)
    external_thread_id: Mapped[str | None] = mapped_column(String(255))
    contact_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey('contacts.id', ondelete='SET NULL'))
    status: Mapped[str] = mapped_column(String(50), default='active', server_default='active')
    __table_args__ = (Index('ix_conversations_workspace_created', 'workspace_id', 'created_at'),)


class Message(UUIDPrimaryKeyMixin, Base):
    __tablename__ = 'messages'
    conversation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('conversations.id', ondelete='CASCADE'), index=True, nullable=False)
    sender_type: Mapped[str] = mapped_column(String(50), nullable=False)
    sender_id: Mapped[str | None] = mapped_column(String(100))
    body: Mapped[str] = mapped_column(Text, nullable=False)
    delivery_status: Mapped[str] = mapped_column(String(50), default='sent', server_default='sent')
    external_message_id: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, server_default=text('CURRENT_TIMESTAMP'))


class Payment(UUIDPrimaryKeyMixin, TenantScopedMixin, Base):
    __tablename__ = 'payments'
    opportunity_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey('opportunities.id', ondelete='SET NULL'))
    contact_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey('contacts.id', ondelete='SET NULL'))
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default='USD', server_default='USD')
    payment_method: Mapped[str] = mapped_column(String(50), default='stripe', server_default='stripe')
    stripe_payment_intent_id: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(50), default='pending', server_default='pending')
    receipt_url: Mapped[str | None] = mapped_column(Text)
    __table_args__ = (Index('ix_payments_workspace_created', 'workspace_id', 'created_at'), CheckConstraint('amount >= 0'))


class Appointment(UUIDPrimaryKeyMixin, TenantScopedMixin, Base):
    __tablename__ = 'appointments'
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    assigned_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=False)
    contact_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey('contacts.id', ondelete='SET NULL'))
    google_calendar_event_id: Mapped[str | None] = mapped_column(String(255))
    meet_url: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(50), default='scheduled', server_default='scheduled')
    __table_args__ = (Index('ix_appointments_workspace_created', 'workspace_id', 'created_at'), CheckConstraint('end_time > start_time'))


class IntegrationConnection(UUIDPrimaryKeyMixin, TenantScopedMixin, Base):
    __tablename__ = 'integration_connections'
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(50), default='connected', server_default='connected')
    credentials_encrypted: Mapped[str | None] = mapped_column(Text)
    config: Mapped[dict] = mapped_column(JSONB, default=dict, server_default=text('\'{}\'::jsonb'))
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    __table_args__ = (UniqueConstraint('workspace_id', 'provider'), Index('ix_integration_connections_workspace_created', 'workspace_id', 'created_at'))


class IntegrationEvent(UUIDPrimaryKeyMixin, Base):
    __tablename__ = 'integration_events'
    workspace_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('workspaces.id', ondelete='CASCADE'), nullable=False)
    integration_connection_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('integration_connections.id', ondelete='CASCADE'), nullable=False)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    processed: Mapped[bool] = mapped_column(Boolean, default=False, server_default='false')
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, server_default=text('CURRENT_TIMESTAMP'))
    __table_args__ = (Index('ix_integration_events_workspace_created', 'workspace_id', 'created_at'),)
