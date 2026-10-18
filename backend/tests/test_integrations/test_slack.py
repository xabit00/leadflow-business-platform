"""
Unit tests for SlackClient (I4 provider).
Mocks HTTP layer calls (httpx) inside tests/.
Verifies:
- ok:true path
- ok:false invalid_auth is permanent and not retried
- ratelimited retried with Retry-After
- 5xx retried max 3
- lead name with special characters escaped (&, <, >)
- Slack user ID regex validation (^[UW][A-Z0-9]+$)
- send_escalation_alert fail-soft behavior (I5.8)
"""

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import httpx
import pytest

from app.integrations.base import (
    PermanentProviderError,
    TemporaryProviderError,
)
from app.integrations.slack.client import (
    SlackClient,
    escape_slack_text,
    send_escalation_alert,
    validate_slack_user_id,
)


@pytest.fixture
def slack_client():
    return SlackClient(
        workspace_id=str(uuid4()),
        credentials={"bot_token": "xoxb-mock-bot-token-1234567890"},
    )


def test_validate_slack_user_id():
    """Verify Slack user ID matches ^[UW][A-Z0-9]+$."""
    assert validate_slack_user_id("U12345678") is True
    assert validate_slack_user_id("W98765432") is True
    assert validate_slack_user_id("U0ABCDEF12") is True
    assert validate_slack_user_id("U1") is True

    # Invalid cases
    assert validate_slack_user_id("") is False
    assert validate_slack_user_id(None) is False
    assert validate_slack_user_id("C12345678") is False  # Channel ID, not user ID
    assert validate_slack_user_id("user12345") is False
    assert validate_slack_user_id("12345678") is False
    assert validate_slack_user_id("U 123456") is False


def test_escape_slack_text():
    """Verify Slack control characters (&, <, >) are safely escaped to prevent mrkdwn injection."""
    raw = "John & Jane <VIP> Alert > High Priority"
    escaped = escape_slack_text(raw)
    assert escaped == "John &amp; Jane &lt;VIP&gt; Alert &gt; High Priority"
    assert escape_slack_text(None) == ""
    assert escape_slack_text("") == ""


@pytest.mark.anyio
async def test_slack_ok_true_path(slack_client):
    """Verify successful message dispatch when Slack API returns ok: true."""
    mock_response = MagicMock(spec=httpx.Response)
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "ok": True,
        "channel": "U12345678",
        "ts": "1729240000.000100",
        "message": {"text": "Escalation"},
    }

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_response

        res = await slack_client.send_lead_escalation(
            slack_user_id="U12345678",
            lead_name="Acme Corp Lead",
            source="Website",
            reason="SLA Breached (15 min overdue)",
            lead_id=str(uuid4()),
        )

        mock_post.assert_called_once()
        assert res["ok"] is True
        assert res["ts"] == "1729240000.000100"
        assert res["channel"] == "U12345678"


@pytest.mark.anyio
async def test_slack_ok_false_invalid_auth_permanent_not_retried(slack_client):
    """Slack returning HTTP 200 with ok: false and error: invalid_auth must be permanent and NOT retried."""
    mock_response = MagicMock(spec=httpx.Response)
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "ok": False,
        "error": "invalid_auth",
    }

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_response

        with pytest.raises(PermanentProviderError) as exc_info:
            await slack_client.post_message(channel="U12345678", text="Alert")

        assert exc_info.value.status_code == 400
        assert "invalid_auth" in exc_info.value.message
        # Verify exactly one call attempted — permanent error stops immediately
        assert mock_post.call_count == 1


@pytest.mark.anyio
async def test_slack_ratelimited_retried_with_retry_after(slack_client):
    """When Slack returns error: ratelimited, honors Retry-After header and retries."""
    rate_limit_resp = MagicMock(spec=httpx.Response)
    rate_limit_resp.status_code = 200
    rate_limit_resp.headers = {"Retry-After": "1"}
    rate_limit_resp.json.return_value = {
        "ok": False,
        "error": "ratelimited",
    }

    success_resp = MagicMock(spec=httpx.Response)
    success_resp.status_code = 200
    success_resp.json.return_value = {
        "ok": True,
        "channel": "U12345678",
        "ts": "1729240000.000200",
    }

    with patch(
        "httpx.AsyncClient.post",
        new_callable=AsyncMock,
        side_effect=[rate_limit_resp, success_resp],
    ) as mock_post:
        with patch("asyncio.sleep", return_value=None):
            res = await slack_client.post_message(channel="U12345678", text="Alert")

        assert mock_post.call_count == 2
        assert res["ok"] is True
        assert res["ts"] == "1729240000.000200"


@pytest.mark.anyio
async def test_slack_5xx_retried_max_3(slack_client):
    """HTTP 5xx server errors must be retried up to max 3 times then raise TemporaryProviderError."""
    err_resp = MagicMock(spec=httpx.Response)
    err_resp.status_code = 502

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=err_resp) as mock_post:
        with patch("asyncio.sleep", return_value=None):
            with pytest.raises(TemporaryProviderError) as exc_info:
                await slack_client.post_message(channel="U12345678", text="Alert")

        assert mock_post.call_count == 3
        assert exc_info.value.status_code == 502


@pytest.mark.anyio
async def test_slack_lead_name_special_characters_escaped(slack_client):
    """User-controlled lead names with <, >, & are escaped in the Slack payload."""
    mock_response = MagicMock(spec=httpx.Response)
    mock_response.status_code = 200
    mock_response.json.return_value = {"ok": True, "ts": "123.456", "channel": "U12345678"}

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_response

        lead_id = uuid4()
        await slack_client.send_lead_escalation(
            slack_user_id="U12345678",
            lead_name="Evil <script>alert(1)</script> & Co",
            source="Form <Web>",
            reason="Overdue > 10m",
            lead_id=str(lead_id),
        )

        call_json = mock_post.call_args[1]["json"]
        assert "&lt;script&gt;" in call_json["text"]
        assert "&amp; Co" in call_json["text"]
        assert "&gt; 10m" in call_json["text"]


@pytest.mark.anyio
async def test_send_escalation_alert_fail_soft(monkeypatch):
    """Failure to deliver Slack alert must NEVER break escalation flow (I5.8 fail-soft)."""
    monkeypatch.setenv("SLACK_BOT_TOKEN", "xoxb-mock-fail-token")
    monkeypatch.setenv("SLACK_TEST_USER_ID", "U12345678")

    err_resp = MagicMock(spec=httpx.Response)
    err_resp.status_code = 500

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=err_resp):
        with patch("asyncio.sleep", return_value=None):
            # Must return delivered: False without raising
            result = await send_escalation_alert(
                workspace_id=uuid4(),
                user_id=uuid4(),
                lead_id=uuid4(),
                reason="SLA timeout",
            )

            assert result["delivered"] is False
            assert result["provider"] == "slack"
            assert "error" in result
