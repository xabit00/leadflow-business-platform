"""
Slack Integration Package for LeadFlow.
Handles real escalation alerts (I4 Provider) to employees' Slack accounts.
"""

from app.integrations.slack.client import (
    SlackClient,
    escape_slack_text,
    send_escalation_alert,
    validate_slack_user_id,
)

__all__ = [
    "SlackClient",
    "escape_slack_text",
    "send_escalation_alert",
    "validate_slack_user_id",
]
