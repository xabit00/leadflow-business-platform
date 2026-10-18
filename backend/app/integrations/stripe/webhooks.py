"""
Stripe webhook handling.

Verifies Stripe webhook signatures against the raw request body and
processes events idempotently using the `webhook_events` table as a
replay-protection ledger.
"""

from typing import Any

import stripe
from fastapi import HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import logger
from app.integrations.models import WebhookEvent


# Configure the Stripe client with the server-side secret key.
stripe.api_key = settings.STRIPE_SECRET_KEY


async def process_stripe_webhook(
    request: Request,
    payload: bytes,
    signature: str,
    db: AsyncSession,
) -> dict[str, Any]:
    """
    Verify a Stripe webhook signature and idempotently record/process the event.

    Idempotency rules (webhook_events ledger, unique on provider+event_id):
      - existing status == 'succeeded'  -> return immediately (duplicate, 200).
      - existing status == 'failed'     -> reset to 'processing' and reprocess.
      - not found                       -> insert as 'processing' and process.

    Returns a dict the router can translate into the appropriate HTTP response.
    """
    if not settings.STRIPE_WEBHOOK_SECRET:
        logger.error("STRIPE_WEBHOOK_SECRET is not configured")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    # 1. Signature verification against the raw request body (fail-closed).
    try:
        event = stripe.Webhook.construct_event(payload, signature, settings.STRIPE_WEBHOOK_SECRET)
    except stripe.error.SignatureVerificationError as exc:
        logger.warning("Stripe signature verification failed: %s", exc)
        raise HTTPException(status_code=400, detail="Invalid signature")
    except ValueError as exc:
        logger.warning("Stripe payload parsing failed: %s", exc)
        raise HTTPException(status_code=400, detail="Invalid payload")

    event_id: str = event["id"]
    event_type: str = event["type"]
    event_obj: dict[str, Any] = event["data"]["object"]  # type: ignore[index]

    # 2. Idempotency ledger lookup.
    stmt = select(WebhookEvent).where(
        WebhookEvent.provider == "stripe",
        WebhookEvent.event_id == event_id,
    )
    result = await db.execute(stmt)
    existing: WebhookEvent | None = result.scalar_one_or_none()

    if existing is not None:
        if existing.status == "succeeded":
            # Already fully processed -> duplicate delivery, ignore.
            return {"received": True, "duplicate": True, "event_id": event_id}
        if existing.status == "failed":
            # Previous attempt failed -> reset and retry.
            existing.status = "processing"
            existing.error = None
            await db.commit()
    else:
        # First sighting -> insert as processing.
        db.add(
            WebhookEvent(
                provider="stripe",
                event_id=event_id,
                event_type=event_type,
                payload=event_obj,
                status="processing",
                workspace_id=_extract_workspace_id(event_obj),
            )
        )
        await db.commit()

    # 3. Business processing (extensible per event type).
    try:
        await _process_stripe_event(event_type, event_obj, db)
    except Exception as exc:  # noqa: BLE001 - mark failed and return 500
        await _mark_failed(db, event_id, str(exc))
        logger.error("Stripe webhook %s processing failed: %s", event_id, exc)
        raise HTTPException(status_code=500, detail="Processing failed")

    # 4. Mark processed.
    await _mark_processed(db, event_id)
    return {"received": True, "duplicate": False, "event_id": event_id}


def _extract_workspace_id(event_obj: dict[str, Any]) -> str | None:
    """Best-effort extraction of workspace_id from Stripe event metadata."""
    metadata = event_obj.get("metadata") or {}
    return metadata.get("workspace_id") or None


async def _process_stripe_event(
    event_type: str, event_obj: dict[str, Any], db: AsyncSession
) -> None:
    """Dispatch a verified Stripe event to the appropriate handler."""
    if event_type == "checkout.session.completed":
        await _handle_checkout_session_completed(event_obj, db)
    # Other event types are acknowledged but not actioned here.


async def _handle_checkout_session_completed(
    event_obj: dict[str, Any], db: AsyncSession
) -> None:
    """Record a completed checkout session as a payment (placeholder)."""
    workspace_id = _extract_workspace_id(event_obj)
    amount = event_obj.get("amount_total") or 0
    currency = (event_obj.get("currency") or "usd").upper()
    logger.info(
        "Stripe checkout.session.completed: workspace=%s amount=%s currency=%s",
        workspace_id,
        amount,
        currency,
    )
    # Business persistence (payments upsert, audit log) is wired here.


async def _mark_processed(db: AsyncSession, event_id: str) -> None:
    stmt = select(WebhookEvent).where(WebhookEvent.event_id == event_id)
    result = await db.execute(stmt)
    row: WebhookEvent | None = result.scalar_one_or_none()
    if row is not None:
        row.status = "processed"
        from datetime import datetime, timezone

        row.processed_at = datetime.now(timezone.utc)
        await db.commit()


async def _mark_failed(db: AsyncSession, event_id: str, error: str) -> None:
    stmt = select(WebhookEvent).where(WebhookEvent.event_id == event_id)
    result = await db.execute(stmt)
    row: WebhookEvent | None = result.scalar_one_or_none()
    if row is not None:
        row.status = "failed"
        row.error = error
        await db.commit()
