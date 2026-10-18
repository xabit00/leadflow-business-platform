# LeadFlow — External Integrations Architecture

> **Notice:** External integrations are primarily designed and owned by **Member 3 (Integrations / Analytics)**.

---

## 1. Overview of External Integrations

LeadFlow interfaces with four third-party cloud services:
1. **Twilio**: Customer SMS and WhatsApp messaging.
2. **Stripe (Test Mode)**: Secure payment links and webhook reconciliation.
3. **Google Calendar API**: Bi-directional appointment scheduling and Google Meet provisioning.
4. **Telegram Bot API**: High-priority escalation and SLA breach alerting.

---

## 2. Twilio (WhatsApp Sandbox & SMS)

### 2.1 Configuration
- `TWILIO_ACCOUNT_SID`: Twilio project account SID.
- `TWILIO_AUTH_TOKEN`: Twilio API authentication token.
- `TWILIO_PHONE_NUMBER`: Twilio virtual phone number for SMS.
- `TWILIO_WHATSAPP_NUMBER`: WhatsApp Sandbox number (e.g., `whatsapp:+14155238886`).

### 2.2 Inbound Webhook Handling
Twilio dispatches HTTP POST requests when messages are received:
- **Endpoint**: `/api/v1/integrations/twilio/webhook`
- **Security**: Validate `X-Twilio-Signature` against the backend request URL and payload.
- **Workflow**:
  1. Verify signature.
  2. Parse sender (`From`) and message body (`Body`).
  3. Match sender to an existing `Contact` or create a new `Lead`.
  4. Append message to the active `Conversation` thread.
  5. Respond with empty 200 OK or TwiML acknowledgment.

---

## 3. Stripe (Test Mode Payments)

### 3.1 Configuration
- `STRIPE_SECRET_KEY`: `sk_test_...`
- `STRIPE_PUBLISHABLE_KEY`: `pk_test_...`
- `STRIPE_WEBHOOK_SECRET`: `whsec_...`

### 3.2 Workflow
1. **Checkout Session Creation**: When an agent requests payment on an Opportunity, backend issues a Stripe Checkout Session with `client_reference_id` containing the `opportunity_id` and `workspace_id`.
2. **Webhook Verification**:
   - **Endpoint**: `/api/v1/integrations/stripe/webhook`
   - **Events Handled**:
     - `checkout.session.completed`
     - `payment_intent.succeeded`
     - `payment_intent.payment_failed`
   - Signature checked via `stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)`.
3. **Ledger Update**: Successful payments create a `Payment` record and append an immutable `AuditEvent`.

---

## 4. Google Calendar API (OAuth 2.0)

### 4.1 Configuration
- `GOOGLE_CLIENT_ID`: Google Cloud OAuth 2.0 Web Client ID.
- `GOOGLE_CLIENT_SECRET`: OAuth 2.0 Client Secret.
- `GOOGLE_REDIRECT_URI`: e.g. `http://localhost:8000/api/v1/integrations/google-calendar/callback`.
- **OAuth Scopes**:
  - `https://www.googleapis.com/auth/calendar.events`
  - `https://www.googleapis.com/auth/userinfo.email`

### 4.2 Workflow
1. User clicks "Connect Google Calendar" in frontend settings.
2. User is redirected to Google OAuth consent screen.
3. Callback exchanges `code` for `access_token` and `refresh_token`.
4. Refresh tokens are stored encrypted in `IntegrationConnection`.
5. Appointments created in LeadFlow automatically push event resources to Google Calendar with `conferenceData` (Google Meet link generation).

---

## 5. Telegram Bot API (Urgent Escalations)

### 5.1 Configuration
- `TELEGRAM_BOT_TOKEN`: Token obtained from `@BotFather`.
- `TELEGRAM_ESCALATION_CHAT_ID`: Target group chat ID or admin channel ID.

### 5.2 Workflow
1. When a lead SLA breaches without agent acknowledgment:
2. The escalation service constructs an alert message formatted with Markdown:
   ```text
   🚨 *LEADFLOW ESCALATION ALERT*
   *Lead:* Sarah Jenkins
   *Source:* Website Intake
   *Assigned To:* Unacknowledged (Overdue by 15 mins)
   *Action:* Reassigned to Tier 2 Recovery
   ```
3. Outbound HTTP POST to `https://api.telegram.org/bot<TOKEN>/sendMessage`.

---

## 6. Testing & Mocking Strategy

In development and CI environments:
- External network requests to third parties must be mocked or disabled by default using feature flags (`ENABLE_TWILIO_MOCK=true`, `ENABLE_STRIPE_MOCK=true`).
- Unit tests must never fail due to missing external credentials.
