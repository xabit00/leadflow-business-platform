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
    disconnect_workspace_integration,
    get_decrypted_credentials,
    get_workspace_integration,
    log_sync_event,
    mask_credentials_dict,
    mask_secret,
    retry_with_backoff,
    save_workspace_integration,
)
from app.integrations.interfaces import ContactLeadService
from app.integrations.models import (
    Appointment,
    AuditLog,
    Conversation,
    IntegrationConnection,
    Message,
    Payment,
    SyncLog,
    WebhookEvent,
    WorkspaceMember,
)
from app.integrations.slack.client import SlackClient, send_escalation_alert

__all__ = [
    "BaseAdapter",
    "BaseIntegrationAdapter",
    "CredentialManager",
    "mask_secret",
    "mask_credentials_dict",
    "retry_with_backoff",
    "log_sync_event",
    "log_integration_audit",
    "get_workspace_integration",
    "get_decrypted_credentials",
    "save_workspace_integration",
    "disconnect_workspace_integration",
    "ProviderError",
    "TemporaryProviderError",
    "PermanentProviderError",
    "IntegrationConnection",
    "AuditLog",
    "Appointment",
    "Payment",
    "SyncLog",
    "WebhookEvent",
    "WorkspaceMember",
    "Conversation",
    "Message",
    "ContactLeadService",
    "SlackClient",
    "send_escalation_alert",
]
