# LeadFlow — API Contracts Specification

> **Status:** **PROVISIONAL / DRAFT**  
> All contracts in this document represent agreed architectural baselines. Field names and exact request/response envelopes must be finalized in coordination between **Member 1 (Frontend)** and **Member 2 (Backend)** / **Member 3 (Integrations)**.

---

## 1. Global API Conventions

### 1.1 Base URL & Versioning
All API endpoints follow the versioned prefix:
```text
/api/v1/{resource}
```

### 1.2 Identification & Formatting
- **Identifier**: All entity IDs are RFC-4122 UUID v4 strings (e.g. `a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d`).
- **Timestamps**: All timestamps are formatted in UTC ISO 8601 strings (e.g. `2026-10-18T10:16:08Z`).
- **Casing**: URL paths use kebab-case (`/api/v1/lead-assignments`). JSON payloads use snake_case (`first_name`, `workspace_id`).

### 1.3 Tenant Context & Headers
All requests after authentication require:
- `Authorization: Bearer <JWT_ACCESS_TOKEN>`
- `X-Workspace-ID: <WORKSPACE_UUID>` (Optional if default workspace is active; strictly validated against user memberships)

### 1.4 Standard Envelope Structures

#### Success Single Resource:
```json
{
  "data": {
    "id": "7a306461-9c6f-40e1-b8ef-52f1bce61d2f",
    "created_at": "2026-10-18T10:00:00Z",
    "updated_at": "2026-10-18T10:00:00Z"
  }
}
```

#### Success Paginated Collection:
```json
{
  "data": [
    { "id": "..." }
  ],
  "meta": {
    "page": 1,
    "page_size": 20,
    "total_items": 142,
    "total_pages": 8
  }
}
```

#### Error Envelope (RFC-7807 inspired):
```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "The request body failed schema validation.",
    "status": 422,
    "details": [
      {
        "field": "email",
        "issue": "Invalid email address format"
      }
    ],
    "timestamp": "2026-10-18T10:16:08Z"
  }
}
```

---

## 2. Provisional Endpoint Groups

### 2.1 System & Base
- `GET /` — [LIVE] Base application metadata.
- `GET /health` — [LIVE] Backend operational health status.

### 2.2 Authentication & Identity [DRAFT]
- `POST /api/v1/auth/register` — Register owner account & primary workspace.
- `POST /api/v1/auth/login` — Authenticate credentials; return JWT pair (access + refresh).
- `POST /api/v1/auth/refresh` — Refresh expired access token.
- `GET /api/v1/auth/me` — Return current authenticated user profile & accessible workspaces.

### 2.3 Workspaces & Tenancy [DRAFT]
- `GET /api/v1/workspaces` — List workspaces accessible to current user.
- `POST /api/v1/workspaces` — Create a new workspace.
- `GET /api/v1/workspaces/{id}` — Get workspace configuration.
- `PATCH /api/v1/workspaces/{id}` — Update workspace settings (Owner only).

### 2.4 Users, Roles & Permissions [DRAFT]
- `GET /api/v1/workspaces/{id}/users` — List workspace members and active status.
- `POST /api/v1/workspaces/{id}/invitations` — Invite a new user to workspace.
- `GET /api/v1/workspaces/{id}/roles` — List configurable roles and permission sets.
- `POST /api/v1/workspaces/{id}/roles` — Define custom role with permission grants.

### 2.5 Contacts & Companies (CRM) [DRAFT]
- `GET /api/v1/contacts` — Paginated list of contacts (filter by search, company, tags).
- `POST /api/v1/contacts` — Create contact record.
- `GET /api/v1/contacts/{id}` — Retrieve contact with activity history.
- `PATCH /api/v1/contacts/{id}` — Update contact attributes.
- `DELETE /api/v1/contacts/{id}` — Soft delete contact.
- `GET /api/v1/companies` — Paginated list of companies.
- `POST /api/v1/companies` — Create company record.

### 2.6 Pipelines & Opportunities [DRAFT]
- `GET /api/v1/pipelines` — Retrieve workspace sales pipelines and stages.
- `POST /api/v1/pipelines` — Create custom pipeline.
- `GET /api/v1/opportunities` — Query opportunities (filter by stage, assignee, date).
- `POST /api/v1/opportunities` — Create opportunity deal.
- `PATCH /api/v1/opportunities/{id}/stage` — Transition opportunity to new stage.

### 2.7 Leads, Ingestion & Routing [DRAFT]
- `GET /api/v1/leads` — Query leads by status, assignee, and source.
- `POST /api/v1/leads` — Ingest new lead (triggers routing engine).
- `GET /api/v1/leads/{id}` — Get lead details and SLA timer status.
- `POST /api/v1/leads/{id}/acknowledge` — Agent acknowledgement endpoint (halts SLA timer).
- `POST /api/v1/leads/{id}/convert` — Convert lead into Contact + Opportunity.

### 2.8 Employee Availability & Recovery Queue [DRAFT]
- `GET /api/v1/employees/availability` — View real-time availability of team members.
- `PUT /api/v1/employees/availability` — Update own availability status (ONLINE, AWAY, OFF_DUTY).
- `GET /api/v1/leads/recovery-queue` — List unassigned or failed-routing leads awaiting claim.
- `POST /api/v1/leads/recovery-queue/{id}/claim` — Claim a lead from the recovery queue.

### 2.9 Escalation Engine [DRAFT]
- `GET /api/v1/escalations` — List active and historical lead escalations.
- `POST /api/v1/escalations/{id}/resolve` — Mark escalation resolved with action notes.

### 2.10 Omni-Channel Messaging [DRAFT]
- `GET /api/v1/conversations` — List conversation threads.
- `GET /api/v1/conversations/{id}/messages` — Paginated messages in thread.
- `POST /api/v1/conversations/{id}/messages` — Send outbound SMS/WhatsApp message via Twilio.
- `POST /api/v1/integrations/twilio/webhook` — Inbound Twilio webhook handler.

### 2.11 Payments & Invoices (Stripe) [DRAFT]
- `POST /api/v1/payments/checkout-session` — Generate Stripe Checkout session URL.
- `GET /api/v1/payments` — Query payment transaction history.
- `POST /api/v1/integrations/stripe/webhook` — Stripe webhook receiver for asynchronous settlement.

### 2.12 Appointments & Scheduling (Google Calendar) [DRAFT]
- `GET /api/v1/appointments` — List booked appointments.
- `POST /api/v1/appointments` — Book new appointment (syncs to Google Calendar).
- `GET /api/v1/integrations/google-calendar/auth-url` — Start OAuth 2.0 calendar authorization.
- `GET /api/v1/integrations/google-calendar/callback` — OAuth 2.0 redirect receiver.

### 2.13 Operational Dashboard & Analytics [DRAFT]
- `GET /api/v1/dashboard/overview` — High-level KPIs: pipeline value, conversion rate, response time.
- `GET /api/v1/dashboard/sla-metrics` — Team SLA compliance metrics and escalation rates.
- `GET /api/v1/dashboard/leaderboard` — Sales representative performance metrics.

### 2.14 Immutable Audit History [DRAFT]
- `GET /api/v1/audit-events` — Query immutable audit events (filterable by actor, action, date range).
