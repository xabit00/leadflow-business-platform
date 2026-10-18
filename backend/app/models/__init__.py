"""
SQLAlchemy ORM Models Registry.

Notice: Detailed entity models are owned and implemented by Member 2 (Core Backend)
in accordance with docs/DATABASE_SCHEMA.md.
"""
from app.database.base import Base
from app.models.entities import Activity, Appointment, AuditEvent, Company, Contact
from app.models.entities import Conversation, CustomField, IntegrationConnection, IntegrationEvent
from app.models.entities import Lead, LeadAssignment, LeadEscalation, Message, Opportunity
from app.models.entities import Payment, Pipeline, PipelineStage, Role, User, UserWorkspaceRole, Workspace

__all__ = ["Base"]
