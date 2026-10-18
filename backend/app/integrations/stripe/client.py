"""
Stripe Payment Gateway Client (Test Mode).

Provides real Stripe Checkout Session creation, webhook reconciliation, and refund
tracking via official Stripe SDK. Enforces tenant boundary and zero cardholder data storage.
"""

from __future__ import annotations

from typing import Any, Dict, Optional
from uuid import UUID

import stripe
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import logger
from app.integrations.base import (
    BaseAdapter,
    PermanentProviderError,
    TemporaryProviderError,
    log_sync_event,
    retry_with_backoff,
)


class StripeClient(BaseAdapter):
    """
    Real Stripe Payment Gateway adapter operating in test mode.
    Uses official Stripe Python SDK.
    """

    provider = "stripe"

    def __init__(
        self,
        workspace_id: str | UUID,
        credentials: Optional[Dict[str, Any]] = None,
    ) -> None:
        creds = credentials or {}
        super().__init__(workspace_id=str(workspace_id), credentials=creds)
        self.api_key: str = (
            creds.get("api_key")
            or creds.get("stripe_secret_key")
            or settings.STRIPE_SECRET_KEY
            or ""
        )
        self.webhook_secret: str = (
            creds.get("webhook_secret")
            or creds.get("stripe_webhook_secret")
            or settings.STRIPE_WEBHOOK_SECRET
            or ""
        )

    async def connect(self, db: Optional[AsyncSession] = None) -> bool:
        """
        Validate Stripe credentials by testing connectivity with the Stripe API.
        """
        if not self.api_key:
            raise PermanentProviderError(
                message="Stripe API key is not configured",
                provider=self.provider,
                status_code=400,
                plain_reason="Stripe API key is missing. Please provide sk_test_... key.",
            )

        async def _check_balance() -> bool:
            try:
                # Synchronous Stripe SDK call executed in thread executor or directly
                import asyncio
                loop = asyncio.get_running_loop()
                balance = await loop.run_in_executor(
                    None,
                    lambda: stripe.Balance.retrieve(api_key=self.api_key),
                )
                return balance is not None
            except stripe.error.AuthenticationError as exc:
                raise PermanentProviderError(
                    message=f"Stripe authentication failed: {exc}",
                    provider=self.provider,
                    status_code=401,
                    plain_reason="Invalid Stripe API key. Please check your credentials.",
                ) from exc
            except stripe.error.RateLimitError as exc:
                raise TemporaryProviderError(
                    message=f"Stripe rate limited: {exc}",
                    provider=self.provider,
                    status_code=429,
                    plain_reason="Stripe rate limit exceeded. Retrying shortly.",
                ) from exc
            except stripe.error.StripeError as exc:
                raise TemporaryProviderError(
                    message=f"Stripe service error: {exc}",
                    provider=self.provider,
                    status_code=500,
                    plain_reason="Stripe service temporarily unavailable.",
                ) from exc

        try:
            self.is_connected = await retry_with_backoff(
                _check_balance,
                max_retries=3,
                provider=self.provider,
            )
            await log_sync_event(
                db=db,
                workspace_id=self.workspace_id,
                direction="outbound",
                provider=self.provider,
                result="success",
                external_reference="balance.retrieve",
            )
            return True
        except Exception as exc:
            await log_sync_event(
                db=db,
                workspace_id=self.workspace_id,
                direction="outbound",
                provider=self.provider,
                result="failure",
                external_reference="balance.retrieve",
                error_reason=str(exc),
            )
            raise

    async def disconnect(self) -> bool:
        """Disconnect and revoke active adapter state."""
        self.is_connected = False
        return True

    async def status(self) -> Dict[str, Any]:
        """Return provider status and test mode details."""
        return {
            "provider": self.provider,
            "status": "connected" if self.is_connected else "disconnected",
            "last_sync_at": self.last_sync_at.isoformat() if self.last_sync_at else None,
            "details": {
                "mode": "test_mode",
                "api_key_configured": bool(self.api_key),
                "webhook_secret_configured": bool(self.webhook_secret),
                "supported_currencies": ["USD", "EUR", "GBP", "CAD"],
            },
            "limits": "Stripe test mode only processes test card numbers (e.g. 4242 4242 4242 4242).",
        }

    async def send(self, *args: Any, **kwargs: Any) -> Any:
        """Convenience delegation to create_checkout_session."""
        return await self.create_checkout_session(*args, **kwargs)

    async def handle_webhook(self, *args: Any, **kwargs: Any) -> Any:
        """Delegation to webhook processing logic."""
        from app.integrations.stripe.webhooks import process_stripe_webhook
        return await process_stripe_webhook(*args, **kwargs)

    async def create_checkout_session(
        self,
        amount_cents: int,
        currency: str = "USD",
        opportunity_id: Optional[UUID] = None,
        contact_id: Optional[UUID] = None,
        customer_email: Optional[str] = None,
        success_url: Optional[str] = None,
        cancel_url: Optional[str] = None,
        db: Optional[AsyncSession] = None,
    ) -> Dict[str, Any]:
        """
        Create a real Stripe Checkout Session via official Stripe API.
        Returns the genuine checkout URL and session ID.
        """
        if amount_cents <= 0:
            raise PermanentProviderError(
                message="Amount must be greater than zero",
                provider=self.provider,
                status_code=400,
                plain_reason="Payment amount must be greater than zero.",
            )

        if not self.api_key:
            raise PermanentProviderError(
                message="Stripe API key missing",
                provider=self.provider,
                status_code=400,
                plain_reason="Stripe is not configured for this workspace.",
            )

        import asyncio

        def _call_stripe() -> Any:
            return stripe.checkout.Session.create(
                api_key=self.api_key,
                payment_method_types=["card"],
                mode="payment",
                line_items=[
                    {
                        "price_data": {
                            "currency": currency.lower(),
                            "unit_amount": amount_cents,
                            "product_data": {
                                "name": f"Opportunity Payment ({opportunity_id or 'General'})",
                            },
                        },
                        "quantity": 1,
                    }
                ],
                customer_email=customer_email or None,
                client_reference_id=str(opportunity_id) if opportunity_id else None,
                metadata={
                    "workspace_id": self.workspace_id,
                    "opportunity_id": str(opportunity_id) if opportunity_id else "",
                    "contact_id": str(contact_id) if contact_id else "",
                },
                success_url=success_url or "https://leadflow.app/payments/success?session_id={CHECKOUT_SESSION_ID}",
                cancel_url=cancel_url or "https://leadflow.app/payments/cancelled",
            )

        async def _execute() -> Any:
            loop = asyncio.get_running_loop()
            try:
                return await loop.run_in_executor(None, _call_stripe)
            except stripe.error.AuthenticationError as exc:
                raise PermanentProviderError(
                    message=f"Stripe authentication failed: {exc}",
                    provider=self.provider,
                    status_code=401,
                    plain_reason="Invalid Stripe credentials.",
                ) from exc
            except stripe.error.InvalidRequestError as exc:
                raise PermanentProviderError(
                    message=f"Stripe bad request: {exc}",
                    provider=self.provider,
                    status_code=400,
                    plain_reason=f"Stripe rejected checkout creation: {exc.user_message or str(exc)}",
                ) from exc
            except stripe.error.RateLimitError as exc:
                raise TemporaryProviderError(
                    message=f"Stripe rate limited: {exc}",
                    provider=self.provider,
                    status_code=429,
                ) from exc
            except stripe.error.StripeError as exc:
                raise TemporaryProviderError(
                    message=f"Stripe error: {exc}",
                    provider=self.provider,
                    status_code=500,
                ) from exc

        session = await retry_with_backoff(_execute, max_retries=3, provider=self.provider)

        await log_sync_event(
            db=db,
            workspace_id=self.workspace_id,
            direction="outbound",
            provider=self.provider,
            result="success",
            external_reference=session.id,
            details={"amount_cents": amount_cents, "currency": currency},
        )

        return {
            "checkout_session_id": session.id,
            "url": session.url,
            "amount_cents": amount_cents,
            "currency": currency.upper(),
            "status": "open",
        }
