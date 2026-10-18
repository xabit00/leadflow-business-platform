"""
Immutable audit logging service for integration events.

Provides append-only tracking of integration activity, webhook events, credential
changes, and automated escalations for tenant compliance and debugging.
"""

from __future__ import annotations

import datetime
from typing import Any, Dict, Optional
from uuid import UUID, uuid4

from fastapi import HTTPException, status
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import logger
from app.integrations.models import AuditLog


async def log_integration_audit(
    db: AsyncSession,
    workspace_id: UUID,
    actor_id: Optional[UUID],
    action: str,
    entity_type: str,
    entity_id: UUID,
    before_state: Optional[Dict[str, Any]] = None,
    after_state: Optional[Dict[str, Any]] = None,
) -> None:
    """
    Persist an immutable audit record into the `audit_logs` table.

    Args:
        db: Active SQLAlchemy AsyncSession.
        workspace_id: Tenant UUID partition key.
        actor_id: Optional UUID of user who triggered the action (None for system/webhook).
        action: Standardized action name (e.g., 'integration.connected', 'payment.succeeded').
        entity_type: Target entity model name (e.g., 'webhook_event', 'payment', 'lead').
        entity_id: Target entity identifier.
        before_state: State snapshot prior to mutation (if applicable).
        after_state: State snapshot following mutation (if applicable).

    Raises:
        HTTPException: If the audit record fails to persist, enforcing audit integrity.
    """
    log_id = uuid4()
    audit_entry = AuditLog(
        id=log_id,
        workspace_id=workspace_id,
        actor_id=actor_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        before_state=before_state,
        after_state=after_state,
        created_at=datetime.datetime.now(datetime.timezone.utc),
    )

    try:
        db.add(audit_entry)
        await db.commit()
        logger.info(
            "Audit record stored: id=%s workspace=%s action='%s' entity='%s:%s'",
            log_id,
            workspace_id,
            action,
            entity_type,
            entity_id,
        )
    except SQLAlchemyError as exc:
        await db.rollback()
        logger.error(
            "Failed to write immutable audit record (action='%s', workspace=%s): %s",
            action,
            workspace_id,
            type(exc).__name__,
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to record immutable audit log entry",
        ) from exc
    except Exception as exc:
        await db.rollback()
        logger.error(
            "Unexpected error while writing audit log (action='%s'): %s",
            action,
            exc,
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unexpected error recording audit log",
        ) from exc
