import asyncio
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
from uuid import uuid4

from app.integrations.stripe import webhooks
from app.routers import integrations


def test_processed_webhook_is_not_processed_again(monkeypatch):
    monkeypatch.setattr(webhooks.settings, 'STRIPE_WEBHOOK_SECRET', 'test-secret')
    monkeypatch.setattr(webhooks.stripe.Webhook, 'construct_event', lambda *args: {
        'id': 'evt_duplicate', 'type': 'checkout.session.completed', 'data': {'object': {}}
    })
    db = SimpleNamespace(execute=AsyncMock(return_value=Mock(
        scalar_one_or_none=Mock(return_value=SimpleNamespace(status='processed'))
    )))
    handler = AsyncMock()
    monkeypatch.setattr(webhooks, '_process_stripe_event', handler)
    result = asyncio.run(webhooks.process_stripe_webhook(None, b'{}', 'signature', db))
    assert result['duplicate'] is True
    handler.assert_not_awaited()


def test_duplicate_response_uses_stored_uuid(monkeypatch):
    row = SimpleNamespace(id=uuid4(), event_id='evt_duplicate', event_type='checkout.session.completed',
                          status='processed', received_at=datetime.now(timezone.utc), processed_at=None)
    monkeypatch.setattr(integrations, 'process_stripe_webhook', AsyncMock(return_value={
        'event_id': row.event_id, 'duplicate': True
    }))
    db = SimpleNamespace(execute=AsyncMock(return_value=Mock(scalar_one_or_none=Mock(return_value=row))))
    response = asyncio.run(integrations.stripe_webhook(
        SimpleNamespace(body=AsyncMock(return_value=b'{}')), 'signature', db
    ))
    assert response.id == row.id
    assert response.status == 'processed'
