# LeadFlow — Integrations API & Frontend Contract

> **Notice:** Owned by **Member 3 (Integrations / Analytics)**.  
> **I4 Provider Status:** The active Milestone I4 notification provider is **Slack** (`integrations/slack/client.py`), using per-user DM routing via Slack Bot User Token, Block Kit alerts, strict mrkdwn escaping, and retry with `Retry-After` rate-limiting compliance. Telegram and Discord are not active I4 providers.

---

## 1. Authentication & Security Specifications

1. **Bearer Token Authentication:** All tenant-facing endpoints require `Authorization: Bearer <JWT_TOKEN>`.
2. **Tenant Isolation (BOLA Prevention):** All requests must provide `workspace_id` matching an active membership for the authenticated user (`403 Forbidden` on mismatch).
3. **Webhook Endpoints:** Strictly unauthenticated at the HTTP header level but protected by raw-body cryptographic signatures (`stripe-signature`, `X-Twilio-Signature`).
4. **Secret Hygiene:** All tokens and keys are encrypted at rest using Fernet AES-128-CBC + HMAC-SHA256 derived from `INTEGRATION_MASTER_KEY`. No raw secrets are ever exposed in responses or logs.

---

## 2. API Endpoints Catalog

### 2.1 Stripe Payment Webhook
* **Method & Path:** `POST /api/v1/integrations/stripe/webhook`
* **Auth:** None (Signature protected via `Stripe-Signature` header)
* **Description:** Receives test-mode Stripe webhook events. Processes idempotently using `webhook_events` table and creates `payments` records upon checkout completion.
* **Headers:**
  ```http
  Stripe-Signature: t=1729240000,v1=9e8...
  Content-Type: application/json
  ```
* **Response (200 OK):**
  ```json
  {
    "id": "903ffa22-7cbd-4c94-9c2c-5dd744e5f3f4",
    "provider": "stripe",
    "event_id": "evt_test_1234567890",
    "event_type": "checkout.session.completed",
    "status": "succeeded",
    "received_at": "2026-10-18T12:00:00Z",
    "processed_at": "2026-10-18T12:00:01Z"
  }
  ```
* **Error Codes:**
  * `400 Bad Request`: Missing or invalid signature.

---

### 2.2 Google Calendar OAuth — Consent URL Generation
* **Method & Path:** `GET /api/v1/integrations/google-calendar/auth-url`
* **Auth:** `Bearer <JWT_TOKEN>`
* **Permission:** `integrations:manage` or `workspace:member`
* **Query Parameters:**
  * `workspace_id` (UUID, required): Target workspace.
* **Response (200 OK):**
  ```json
  {
    "auth_url": "https://accounts.google.com/o/oauth2/v2/auth?client_id=...&redirect_uri=...&response_type=code&scope=...&state=...",
    "state": "903ffa22-7cbd-4c94-9c2c-5dd744e5f3f4:csrf_token_value",
    "workspace_id": "903ffa22-7cbd-4c94-9c2c-5dd744e5f3f4"
  }
  ```
* **Error Codes:**
  * `401 Unauthorized`: Missing or expired JWT.
  * `403 Forbidden`: User not a member of the workspace.

---

### 2.3 Google Calendar OAuth — Callback Code Exchange
* **Method & Path:** `GET /api/v1/integrations/google-calendar/callback`
* **Auth:** `Bearer <JWT_TOKEN>`
* **Query Parameters:**
  * `code` (string, required): Authorization code from Google consent screen.
  * `state` (string, required): State parameter containing `<workspace_id>:<csrf_token>`.
* **Response (200 OK):**
  ```json
  {
    "provider": "google_calendar",
    "status": "connected",
    "workspace_id": "903ffa22-7cbd-4c94-9c2c-5dd744e5f3f4",
    "message": "Google Calendar successfully connected and credentials encrypted at rest."
  }
  ```
* **Error Codes:**
  * `400 Bad Request`: Invalid authorization code or state token mismatch.
  * `401 Unauthorized`: Invalid or revoked grant (`needs_reconnect`).

---

### 2.4 Google Calendar — Book Appointment with Google Meet
* **Method & Path:** `POST /api/v1/integrations/google-calendar/book`
* **Auth:** `Bearer <JWT_TOKEN>`
* **Permission:** `appointments:create`
* **Request Body:**
  ```json
  {
    "workspace_id": "903ffa22-7cbd-4c94-9c2c-5dd744e5f3f4",
    "title": "LeadFlow Enterprise Demo",
    "start_at": "2026-10-19T14:00:00Z",
    "end_at": "2026-10-19T14:45:00Z",
    "timezone": "UTC",
    "contact_id": "c0d4f082-90c1-4ad8-8ebd-586080bedfcc",
    "attendees": ["lead@acme.com"]
  }
  ```
* **Response (201 Created):**
  ```json
  {
    "appointment_id": "551df148-81ed-45e1-a3c0-e0e3ba38ae22",
    "google_calendar_event_id": "gcal_evt_987654321",
    "meet_url": "https://meet.google.com/abc-defg-hij",
    "html_link": "https://www.google.com/calendar/event?eid=...",
    "start_at": "2026-10-19T14:00:00Z",
    "end_at": "2026-10-19T14:45:00Z",
    "title": "LeadFlow Enterprise Demo",
    "status": "scheduled"
  }
  ```
* **Error Codes:**
  * `400 Bad Request`: Slot conflict detected or missing parameters.
  * `401 Unauthorized`: Google token revoked (status marked `needs_reconnect`).

---

### 2.5 Integration Dashboard Metrics (BOLA Protected)
* **Method & Path:** `GET /api/v1/integrations/dashboard/metrics`
* **Auth:** `Bearer <JWT_TOKEN>`
* **Query Parameters:**
  * `workspace_id` (UUID, required): Target workspace.
* **Response (200 OK):**
  ```json
  {
    "payments_received_this_month_cents": 125000,
    "upcoming_appointments": 4,
    "integration_health": [
      {"provider": "stripe", "status": "connected"},
      {"provider": "google_calendar", "status": "connected"},
      {"provider": "slack", "status": "connected"}
    ],
    "recent_errors_24h": 0,
    "failed_notifications": 0
  }
  ```
* **Error Codes:**
  * `401 Unauthorized`: Missing or expired JWT.
  * `403 Forbidden`: Requesting user is not a member of the workspace (BOLA prevention).

---

## 3. Slack Escalation Alert Service (I4 Provider Contract)

### 3.1 Public Dispatch Function
* **Signature:**
  ```python
  async def send_escalation_alert(
      workspace_id: UUID,
      user_id: UUID,
      lead_id: UUID,
      reason: str,
      destination_slack_user_id: Optional[str] = None,
      lead_name: Optional[str] = "Unknown Lead",
      source: Optional[str] = "Website",
      db: Optional[AsyncSession] = None,
  ) -> Dict[str, Any]
  ```
* **Fail-Soft Guarantee (I5.8):** Never raises unhandled exceptions to caller. Failures are recorded in `sync_logs` and returned as `{"delivered": False, "error": ...}`.
* **Recipient Destination:** Validated Slack User ID format: `^[UW][A-Z0-9]+$`.
* **Block Kit Payload Sample:**
  ```json
  {
    "channel": "U12345678",
    "text": "🚨 Lead Escalation Alert: Acme Corp (&lt;overdue&gt;)",
    "blocks": [
      {
        "type": "header",
        "text": {"type": "plain_text", "text": "🚨 Lead Escalation Alert", "emoji": true}
      },
      {
        "type": "section",
        "fields": [
          {"type": "mrkdwn", "text": "*Lead:*\n<http://localhost:5173/leads/903ffa22...|Acme Corp>"},
          {"type": "mrkdwn", "text": "*Source:*\nWebsite Intake"},
          {"type": "mrkdwn", "text": "*Reason:*\nSLA Breached (15 min overdue)"},
          {"type": "mrkdwn", "text": "*Lead ID:*\n`903ffa22...`"}
        ]
      },
      {
        "type": "actions",
        "elements": [
          {
            "type": "button",
            "text": {"type": "plain_text", "text": "Open Lead in LeadFlow", "emoji": true},
            "url": "http://localhost:5173/leads/903ffa22...",
            "style": "danger"
          }
        ]
      }
    ]
  }
  ```
