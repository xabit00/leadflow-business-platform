"""
Stripe webhook handling.

Verifies Stripe webhook signatures against the raw request body and
processes events idempotently using the `webhook_events` table as a
replay-protection ledger.
"""

from typing import Any
from uuid import UUID, uuid4

import stripe
from fastapi import HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import logger
from app.integrations.audit import log_integration_audit
from app.integrations.models import Payment, WebhookEvent


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
    if event_type in ("checkout.session.completed", "payment_intent.succeeded"):
        await _handle_checkout_session_completed(event_obj, db)
    # Other event types are acknowledged but not actioned here.


async def _handle_checkout_session_completed(
    event_obj: dict[str, Any], db: AsyncSession
) -> None:
    """Record a completed checkout session or payment intent into the payments table."""
    raw_workspace_id = _extract_workspace_id(event_obj)
    if not raw_workspace_id:
        logger.warning("Stripe event has no workspace_id in metadata; skipping ledger write")
        return

    try:
        workspace_id = UUID(str(raw_workspace_id))
    except (ValueError, TypeError):
        logger.warning("Stripe event contains invalid workspace_id: %s", raw_workspace_id)
        return

    amount_cents = int(event_obj.get("amount_total") or event_obj.get("amount") or 0)
    currency = (event_obj.get("currency") or "usd").upper()
    payment_intent_id = str(event_obj.get("payment_intent") or event_obj.get("id") or "")
    receipt_url = event_obj.get("receipt_url") or f"https://pay.stripe.com/receipts/{payment_intent_id}"

    metadata = event_obj.get("metadata") or {}
    raw_opp_id = metadata.get("opportunity_id")
    opportunity_id = UUID(str(raw_opp_id)) if raw_opp_id else None

    # Check if payment already recorded
    stmt = select(Payment).where(
        Payment.workspace_id == workspace_id,
        Payment.stripe_payment_intent_id == payment_intent_id,
    )
    res = await db.execute(stmt)
    payment = res.scalar_one_or_none()

    if payment is None:
        payment = Payment(
            id=uuid4(),
            workspace_id=workspace_id,
            opportunity_id=opportunity_id,
            amount_cents=amount_cents,
            currency=currency,
            payment_method="stripe",
            stripe_payment_intent_id=payment_intent_id,
            status="succeeded",
            receipt_url=receipt_url,
        )
        db.add(payment)
    else:
        payment.status = "succeeded"
        payment.amount_cents = amount_cents

    await db.commit()
    await db.refresh(payment)

    # Immutable audit logging
    try:
        await log_integration_audit(
            db=db,
            workspace_id=workspace_id,
            actor_id=None,
            action="payment.succeeded",
            entity_type="payment",
            entity_id=payment.id,
            after_state={
                "amount_cents": amount_cents,
                "currency": currency,
                "payment_intent": payment_intent_id,
            },
        )
    except Exception as exc:
        logger.warning("Failed to record audit log for stripe payment: %s", exc)

    logger.info(
        "Stripe payment successfully processed: workspace=%s amount_cents=%s intent=%s",
        workspace_id,
        amount_cents,
        payment_intent_id,
    )


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
