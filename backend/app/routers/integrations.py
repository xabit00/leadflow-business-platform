"""
Integrations router.

Mounts all third-party integration webhooks and tenant-scoped integration
endpoints under /api/v1/integrations.

Security notes:
  * Webhook endpoints verify provider signatures against the raw body
    (fail-closed) and are idempotent via the webhook_events ledger.
  * The dashboard metrics endpoint enforces BOLA prevention: the
    requesting user must be a member of the requested workspace
    (workspace_id == query param AND user_id == current_user.id).
"""

from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

import jwt
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import logger
from app.database.session import get_async_db
from app.integrations.models import WebhookEvent, WorkspaceMember
from app.integrations.schemas import CurrentUser, DashboardMetrics, WebhookEventResponse
from app.integrations.stripe.webhooks import process_stripe_webhook

router = APIRouter(prefix="/api/v1/integrations", tags=["Integrations"])


# ---------------------------------------------------------------------------
# Authentication dependency
# ---------------------------------------------------------------------------


async def get_current_user(
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> CurrentUser:
    """
    Resolve the authenticated user from the Authorization bearer token.

    Expects: Authorization: Bearer <jwt>
    The JWT is verified against settings.SECRET_KEY (HS256). The `sub`
    claim is used as the user id.

    Raises HTTP 401 when the header is missing, malformed, or the token
    is invalid/signature mismatch.
    """
    if authorization is None or not authorization.startswith("Bearer "):
        logger.warning("Missing or malformed Authorization header")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = authorization[len("Bearer ") :].strip()

    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        logger.warning("JWT verification failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id_raw = payload.get("sub")
    email = payload.get("email")
    if user_id_raw is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing subject",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        user_id = UUID(str(user_id_raw))
    except (ValueError, TypeError) as exc:
        logger.warning("Token subject is not a UUID: %s", user_id_raw)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token subject",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    return CurrentUser(id=user_id, email=email)


# ---------------------------------------------------------------------------
# Stripe webhook
# ---------------------------------------------------------------------------


@router.post(
    "/stripe/webhook",
    response_model=WebhookEventResponse,
    summary="Stripe webhook endpoint",
    description="Receives Stripe webhook events. Verifies the signature "
    "against the raw body and processes each event idempotently.",
)
async def stripe_webhook(
    request: Request,
    stripe_signature: str | None = Header(default=None, alias="stripe-signature"),
    db: AsyncSession = Depends(get_async_db),
) -> WebhookEventResponse:
    """Ingress for Stripe webhook deliveries."""
    if stripe_signature is None:
        raise HTTPException(status_code=400, detail="Missing stripe-signature header")

    payload = await request.body()

    result = await process_stripe_webhook(request, payload, stripe_signature, db)

    if result.get("duplicate"):
        return WebhookEventResponse(
            id=result["event_id"],  # placeholder id; duplicate events carry no new row
            provider="stripe",
            event_id=result["event_id"],
            event_type="duplicate",
            status="succeeded",
            received_at=datetime.now(timezone.utc),
        )

    # Fetch the recorded event to return a consistent response.
    stmt = select(WebhookEvent).where(
        WebhookEvent.provider == "stripe",
        WebhookEvent.event_id == result["event_id"],
    )
    db_result = await db.execute(stmt)
    row = db_result.scalar_one_or_none()

    return WebhookEventResponse(
        id=row.id if row else uuid_placeholder(result["event_id"]),
        provider="stripe",
        event_id=row.event_id if row else result["event_id"],
        event_type=row.event_type if row else "unknown",
        status=row.status if row else "processing",
        received_at=row.received_at if row else datetime.now(timezone.utc),
        processed_at=row.processed_at if row else None,
    )


def uuid_placeholder(value: str) -> UUID:
    """Deterministic UUID placeholder for responses when no DB row exists yet."""
    import uuid as _uuid

    return _uuid.UUID(bytes=_uuid.uuid5(_uuid.NAMESPACE_URL, value).bytes)


# ---------------------------------------------------------------------------
# Dashboard metrics (BOLA-protected)
# ---------------------------------------------------------------------------


@router.get(
    "/dashboard/metrics",
    response_model=DashboardMetrics,
    summary="Get integration dashboard metrics",
    description="Returns aggregated metrics for a workspace. Caller must be "
    "a member of the requested workspace (BOLA protection).",
)
async def get_dashboard_metrics(
    workspace_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
) -> DashboardMetrics:
    """
    Return dashboard metrics for `workspace_id`.

    BOLA fix: strictly verifies that the requesting user is a member of the
    requested workspace before returning any data. Returns 403 otherwise.
    """
    # Enforce workspace membership: workspace_id == param AND user_id == current_user.id.
    membership_stmt = select(WorkspaceMember).where(
        WorkspaceMember.workspace_id == workspace_id,
        WorkspaceMember.user_id == current_user.id,
    )
    membership_result = await db.execute(membership_stmt)
    if membership_result.scalar_one_or_none() is None:
        logger.warning(
            "BOLA rejection: user %s requested metrics for workspace %s",
            current_user.id,
            workspace_id,
        )
        raise HTTPException(status_code=403, detail="Forbidden")

    now = datetime.now(timezone.utc)
    month_start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
    twenty_four_hours_ago = now - timedelta(hours=24)

    # Payments received this month (succeeded only).
    payments_stmt = text(
        """
        SELECT COALESCE(SUM(amount_cents), 0) AS total
        FROM payments
        WHERE workspace_id = :workspace_id
          AND status = 'succeeded'
          AND created_at >= :month_start
        """
    )
    payments_result = await db.execute(
        payments_stmt, {"workspace_id": workspace_id, "month_start": month_start}
    )
    payments_total = int(payments_result.scalar() or 0)

    # Upcoming appointments.
    upcoming_stmt = text(
        """
        SELECT COUNT(*) AS total
        FROM appointments
        WHERE workspace_id = :workspace_id
          AND start_at > :now
        """
    )
    upcoming_result = await db.execute(
        upcoming_stmt, {"workspace_id": workspace_id, "now": now}
    )
    upcoming_appointments = int(upcoming_result.scalar() or 0)

    # Integration health from workspace_integrations.
    health_stmt = text(
        """
        SELECT provider, status
        FROM workspace_integrations
        WHERE workspace_id = :workspace_id
        """
    )
    health_result = await db.execute(health_stmt, {"workspace_id": workspace_id})
    integration_health = [
        {"provider": row.provider, "status": row.status}
        for row in health_result.fetchall()
    ]

    # Recent errors (24h).
    recent_errors_stmt = text(
        """
        SELECT COUNT(*) AS total
        FROM audit_logs
        WHERE workspace_id = :workspace_id
          AND created_at >= :since
          AND (action = 'notification.failed' OR action ILIKE '%error%')
        """
    )
    recent_errors_result = await db.execute(
        recent_errors_stmt,
        {"workspace_id": workspace_id, "since": twenty_four_hours_ago},
    )
    recent_errors = int(recent_errors_result.scalar() or 0)

    # Failed notifications.
    failed_notifs_stmt = text(
        """
        SELECT COUNT(*) AS total
        FROM audit_logs
        WHERE workspace_id = :workspace_id
          AND action = 'notification.failed'
        """
    )
    failed_notifs_result = await db.execute(
        failed_notifs_stmt, {"workspace_id": workspace_id}
    )
    failed_notifications = int(failed_notifs_result.scalar() or 0)

    return DashboardMetrics(
        payments_received_this_month_cents=payments_total,
        upcoming_appointments=upcoming_appointments,
        integration_health=integration_health,
        recent_errors_24h=recent_errors,
        failed_notifications=failed_notifications,
    )
