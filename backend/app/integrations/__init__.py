"""
External Integrations Package.

Contains third-party adapters for Twilio, Stripe, Google Calendar, and Telegram.
Primary owner: Member 3 (Integrations / Analytics).
"""

from app.integrations.audit import log_integration_audit
from app.integrations.base import (
    BaseAdapter,
    BaseIntegrationAdapter,
    CredentialManager,
    PermanentProviderError,
    ProviderError,
    TemporaryProviderError,
    log_sync_event,
    mask_credentials_dict,
    mask_secret,
    retry_with_backoff,
)
from app.integrations.models import (
    Appointment,
    AuditLog,
    Payment,
    SyncLog,
    WebhookEvent,
    WorkspaceMember,
)

__all__ = [
    "BaseAdapter",
    "BaseIntegrationAdapter",
    "CredentialManager",
    "mask_secret",
    "mask_credentials_dict",
    "retry_with_backoff",
    "log_sync_event",
    "log_integration_audit",
    "ProviderError",
    "TemporaryProviderError",
    "PermanentProviderError",
    "AuditLog",
    "Appointment",
    "Payment",
    "SyncLog",
    "WebhookEvent",
    "WorkspaceMember",
]
