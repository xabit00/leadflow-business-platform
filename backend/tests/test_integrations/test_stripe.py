"""
Unit tests for StripeClient (test mode payment gateway).
Tests checkout session creation, parameter validation, retry logic, and error mapping.
All external network interactions with Stripe API are mocked inside tests/.
"""

import asyncio
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
import stripe

from app.integrations.base import (
    PermanentProviderError,
    TemporaryProviderError,
)
from app.integrations.stripe.client import StripeClient


@pytest.fixture
def workspace_id():
    return uuid4()


@pytest.fixture
def stripe_client(workspace_id):
    return StripeClient(
        workspace_id=workspace_id,
        credentials={"api_key": "sk_test_mockstripekey1234567890", "webhook_secret": "whsec_mock123"},
    )


@pytest.mark.anyio
async def test_create_checkout_session_success(stripe_client, workspace_id):
    """Verify checkout session is created with correct params and server-side amount."""
    opportunity_id = uuid4()
    contact_id = uuid4()

    mock_session = MagicMock()
    mock_session.id = "cs_test_a1b2c3d4e5"
    mock_session.url = "https://checkout.stripe.com/c/pay/cs_test_a1b2c3d4e5"

    with patch("stripe.checkout.Session.create", return_value=mock_session) as mock_create:
        result = await stripe_client.create_checkout_session(
            amount_cents=25000,
            currency="USD",
            opportunity_id=opportunity_id,
            contact_id=contact_id,
            customer_email="buyer@example.com",
            success_url="https://leadflow.app/success",
            cancel_url="https://leadflow.app/cancel",
        )

        mock_create.assert_called_once()
        call_kwargs = mock_create.call_args[1]

        # Verify server-side amounts, currency, and line items
        assert call_kwargs["mode"] == "payment"
        assert call_kwargs["customer_email"] == "buyer@example.com"
        assert call_kwargs["line_items"][0]["price_data"]["unit_amount"] == 25000
        assert call_kwargs["line_items"][0]["price_data"]["currency"] == "usd"
        assert call_kwargs["metadata"]["workspace_id"] == str(workspace_id)
        assert call_kwargs["metadata"]["opportunity_id"] == str(opportunity_id)
        assert call_kwargs["metadata"]["contact_id"] == str(contact_id)

        assert result["checkout_session_id"] == "cs_test_a1b2c3d4e5"
        assert result["url"] == "https://checkout.stripe.com/c/pay/cs_test_a1b2c3d4e5"
        assert result["amount_cents"] == 25000
        assert result["currency"] == "USD"
        assert result["status"] == "open"


@pytest.mark.anyio
async def test_create_checkout_session_zero_or_negative_amount_fails(stripe_client):
    """Zero or negative amount must be rejected immediately without calling Stripe."""
    with patch("stripe.checkout.Session.create") as mock_create:
        with pytest.raises(PermanentProviderError) as exc_info:
            await stripe_client.create_checkout_session(amount_cents=0)

        assert exc_info.value.status_code == 400
        mock_create.assert_not_called()

        with pytest.raises(PermanentProviderError):
            await stripe_client.create_checkout_session(amount_cents=-100)
        mock_create.assert_not_called()


@pytest.mark.anyio
async def test_create_checkout_session_4xx_invalid_request_not_retried(stripe_client):
    """4xx InvalidRequestError from Stripe is permanent and must NOT be retried."""
    with patch(
        "stripe.checkout.Session.create",
        side_effect=stripe.error.InvalidRequestError("Invalid currency", param="currency"),
    ) as mock_create:
        with pytest.raises(PermanentProviderError) as exc_info:
            await stripe_client.create_checkout_session(amount_cents=1000)

        assert exc_info.value.status_code == 400
        # Exactly 1 call attempted: no retries on 4xx
        assert mock_create.call_count == 1


@pytest.mark.anyio
async def test_create_checkout_session_429_rate_limit_retried(stripe_client):
    """429 RateLimitError must be retried with backoff and succeed if subsequent attempt succeeds."""
    mock_session = MagicMock()
    mock_session.id = "cs_test_retry_success"
    mock_session.url = "https://checkout.stripe.com/pay"

    side_effects = [
        stripe.error.RateLimitError("Rate limit exceeded"),
        stripe.error.RateLimitError("Rate limit exceeded"),
        mock_session,
    ]

    with patch("stripe.checkout.Session.create", side_effect=side_effects) as mock_create:
        with patch("asyncio.sleep", return_value=None):  # fast unit test execution
            result = await stripe_client.create_checkout_session(amount_cents=5000)

        assert mock_create.call_count == 3
        assert result["checkout_session_id"] == "cs_test_retry_success"


@pytest.mark.anyio
async def test_create_checkout_session_5xx_retried_max_3(stripe_client):
    """5xx service errors retried up to max 3 times then raise TemporaryProviderError."""
    with patch(
        "stripe.checkout.Session.create",
        side_effect=stripe.error.APIConnectionError("Failed to connect to Stripe"),
    ) as mock_create:
        with patch("asyncio.sleep", return_value=None):
            with pytest.raises(TemporaryProviderError):
                await stripe_client.create_checkout_session(amount_cents=5000)

        assert mock_create.call_count == 3
