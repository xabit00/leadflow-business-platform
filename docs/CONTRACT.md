# LeadFlow Supabase Contract Specification

> **Version:** Step 1 Core Database Schema & Authentication Functions  
> **Status:** Active  
> **Target Environment:** Supabase PostgreSQL

---

## 1. Tables Register

LeadFlow core database comprises 24 multi-tenant tables. All tables utilize UUID primary keys with `gen_random_uuid()` default generation and strict workspace-scoped foreign keys.

| Table Name | Primary Key | References / Foreign Keys | Description |
| :--- | :--- | :--- | :--- |
| `workspaces` | `id uuid` | None | Primary multi-tenant workspace isolation boundary. |
| `roles` | `id uuid` | `workspace_id -> workspaces(id)` | Configurable workspace RBAC role definitions. |
| `role_permissions` | `id uuid` | `role_id -> roles(id)` | Granular permission string grants assigned to roles. |
| `profiles` | `id uuid` | `id -> auth.users(id)`, `workspace_id -> workspaces(id)`, `role_id -> roles(id)` | Member profile associated 1:1 with Supabase Auth users. |
| `companies` | `id uuid` | `workspace_id -> workspaces(id)` | Organization and business accounts within CRM. |
| `contacts` | `id uuid` | `workspace_id -> workspaces(id)`, `company_id -> companies(id)` | Individuals, leads, and customer contacts. |
| `pipelines` | `id uuid` | `workspace_id -> workspaces(id)` | Visual sales and qualification workflow pipelines. |
| `stages` | `id uuid` | `workspace_id -> workspaces(id)`, `pipeline_id -> pipelines(id)` | Ordered milestone stages within a pipeline. |
| `opportunities` | `id uuid` | `workspace_id -> workspaces(id)`, `contact_id -> contacts(id)`, `pipeline_id -> pipelines(id)`, `stage_id -> stages(id)`, `owner_id -> profiles(id)` | Commercial deals and qualification opportunities. |
| `opportunity_values` | `opportunity_id uuid` | `opportunity_id -> opportunities(id)`, `workspace_id -> workspaces(id)` | Monetary valuation and currency tracking for opportunities. |
| `custom_fields` | `id uuid` | `workspace_id -> workspaces(id)`, `pipeline_id -> pipelines(id)` | Dynamic schema extension definitions for contacts and opportunities. |
| `saved_lists` | `id uuid` | `workspace_id -> workspaces(id)`, `owner_id -> profiles(id)` | Custom contact/lead segment filter configurations. |
| `leads` | `id uuid` | `workspace_id -> workspaces(id)`, `contact_id -> contacts(id)`, `opportunity_id -> opportunities(id)`, `owner_id -> profiles(id)` | Ingested lead records with SLA ack deadlines and escalation counters. |
| `lead_assignments` | `id uuid` | `workspace_id -> workspaces(id)`, `lead_id -> leads(id)`, `user_id -> profiles(id)` | Immutable historical lead routing and assignment events. |
| `assignment_rules` | `workspace_id uuid` | `workspace_id -> workspaces(id)`, `backup_user_id -> profiles(id)`, `manager_user_id -> profiles(id)`, `last_rr_user_id -> profiles(id)` | Round-robin routing, escalation intervals, and SLA configuration. |
| `activities` | `id uuid` | `workspace_id -> workspaces(id)`, `actor_id -> profiles(id)` | Polymorphic operational activity stream and interaction timeline. |
| `audit_log` | `id uuid` | `workspace_id -> workspaces(id)`, `actor_id -> profiles(id)` | Append-only immutable security and compliance audit log. |
| `dashboard_preferences` | `user_id uuid` | `user_id -> profiles(id)`, `workspace_id -> workspaces(id)` | Per-user UI dashboard widget display preferences. |
| `integrations` | `id uuid` | `workspace_id -> workspaces(id)` | External service connections (Twilio, SendGrid, Stripe, etc.). |
| `integration_events` | `id uuid` | `workspace_id -> workspaces(id)` | Deduplicated webhook events and outbound synchronization dispatch logs. |
| `messages` | `id uuid` | `workspace_id -> workspaces(id)`, `contact_id -> contacts(id)`, `lead_id -> leads(id)` | Inbound and outbound SMS/email communication records. |
| `payments` | `id uuid` | `workspace_id -> workspaces(id)`, `opportunity_id -> opportunities(id)`, `contact_id -> contacts(id)`, `requested_by -> profiles(id)` | Invoices, payment links, and checkout transaction records. |
| `appointments` | `id uuid` | `workspace_id -> workspaces(id)`, `contact_id -> contacts(id)`, `opportunity_id -> opportunities(id)`, `user_id -> profiles(id)` | Scheduled meetings and synced calendar appointments. |
| `notification_outbox` | `id uuid` | `workspace_id -> workspaces(id)`, `user_id -> profiles(id)`, `lead_id -> leads(id)` | Outbound notification dispatch queue (email, Telegram, webhook). |

---

## 2. Enumerated Types (Enums)

All enum definitions preserve strict value order:

- **`user_level`**: `'owner'`, `'admin'`, `'user'`
- **`user_status`**: `'available'`, `'busy'`, `'on_leave'`, `'offline'`
- **`lead_source`**: `'web_form'`, `'message'`, `'manual'`
- **`lead_status`**: `'new'`, `'acknowledged'`, `'closed'`
- **`assignment_reason`**: `'initial'`, `'escalation'`, `'reassign_absence'`, `'manual'`
- **`ack_leave_policy`**: `'keep'`, `'reassign'`
- **`custom_field_entity`**: `'contact'`, `'opportunity'`
- **`custom_field_type`**: `'text'`, `'number'`, `'date'`, `'dropdown'`, `'checkbox'`
- **`integration_status`**: `'not_connected'`, `'connected'`, `'error'`
- **`integration_direction`**: `'inbound'`, `'outbound'`
- **`message_direction`**: `'inbound'`, `'outbound'`
- **`message_status`**: `'queued'`, `'sent'`, `'delivered'`, `'failed'`
- **`payment_status`**: `'pending'`, `'paid'`, `'failed'`, `'expired'`, `'refunded'`
- **`outbox_status`**: `'pending'`, `'sent'`, `'failed'`

---

## 3. Remote Procedure Calls (RPCs)

These functions are defined with `SECURITY DEFINER` and `set search_path = public` for execution via Supabase RPC (`supabase.rpc(...)`).

### 1. `bootstrap_workspace(p_workspace_name text, p_full_name text) -> jsonb`
- **Arguments**:
  - `p_workspace_name` (`text`, required): Name of the new organization workspace.
  - `p_full_name` (`text`, required): Full display name of the initial workspace owner.
- **Preconditions**:
  - `auth.uid()` must not be null.
  - User must not already have a record in `profiles`.
- **Operations**:
  - Generates a collision-resistant unique slug: `<cleaned-name>-<random-hex>`.
  - Inserts the new record into `workspaces`.
  - Creates the caller's profile in `profiles` with `level = 'owner'`, `status = 'available'`, and `is_active = true`.
  - Inserts default configuration into `assignment_rules`.
  - Populates a default `'Sales'` pipeline and standard stages: `New` (pos 0), `Contacted` (pos 1), `Qualified` (pos 2), `Won` (pos 3, `is_won`), `Lost` (pos 4, `is_lost`).
  - Records an immutable `'workspace_bootstrapped'` event in `audit_log`.
- **Return Shape**:
  ```json
  {
    "workspace_id": "00000000-0000-0000-0000-000000000000",
    "profile_id": "00000000-0000-0000-0000-000000000000"
  }
  ```

### 2. `set_user_status(p_user_id uuid, p_status user_status) -> void`
- **Arguments**:
  - `p_user_id` (`uuid`, required): Target user's profile ID.
  - `p_status` (`user_status`, required): New presence status (`'available'`, `'busy'`, `'on_leave'`, `'offline'`).
- **Authorization**:
  - Caller must be modifying their own status (`auth.uid() = p_user_id`), OR possess `'users.manage'` permission.
  - Cross-workspace modification is rejected.
- **Operations**:
  - Updates `profiles.status`.
  - If new status is `'on_leave'` or `'offline'`, triggers `reassign_for_absence(p_user_id)`.
  - Records `'user_status_updated'` in `audit_log` with before/after state.
- **Return Shape**: `void`

### 3. `set_user_level(p_user_id uuid, p_level user_level) -> void`
- **Arguments**:
  - `p_user_id` (`uuid`, required): Target user's profile ID.
  - `p_level` (`user_level`, required): Target role level (`'owner'`, `'admin'`, `'user'`).
- **Authorization**:
  - Caller must possess `'users.manage'` permission.
  - Target user must belong to the caller's workspace.
  - Demoting an existing `'owner'` requires the caller to also have `current_level() = 'owner'`.
- **Operations**:
  - Updates `profiles.level`.
  - Records `'user_level_updated'` in `audit_log`.
- **Return Shape**: `void`

### 4. `set_role_permissions(p_role_id uuid, p_permissions text[]) -> void`
- **Arguments**:
  - `p_role_id` (`uuid`, required): Role ID to update.
  - `p_permissions` (`text[]`, required): Complete array of permission keys to grant to the role.
- **Authorization**:
  - Caller must possess `'users.manage'` permission.
  - Target role must belong to caller's workspace.
- **Operations**:
  - Replaces all existing `role_permissions` rows for `p_role_id`.
  - Records `'role_permissions_updated'` in `audit_log` with previous and updated permission lists.
- **Return Shape**: `void`

### 5. `reassign_for_absence(p_user_id uuid) -> void`
- **Arguments**:
  - `p_user_id` (`uuid`, required): User ID going on leave or offline.
- **Description**:
  - Lead re-routing engine hook (no-op stub in Step 1, implemented in Step 3).
- **Return Shape**: `void`

---

## 4. Helper Functions & Security Guards

All helper functions run with `SECURITY DEFINER` and `set search_path = public`:

| Function Signature | Return Type | Description |
| :--- | :--- | :--- |
| `current_workspace_id()` | `uuid` | Returns the `workspace_id` of the authenticated caller (`auth.uid()`), or `null` if unauthenticated. |
| `current_level()` | `user_level` | Returns the `user_level` (`'owner'`, `'admin'`, `'user'`) of the authenticated caller. |
| `has_permission(perm text)` | `boolean` | Evaluates permission grants. `'owner'` always returns `true`. `'admin'` returns `true`. `'user'` returns `true` for base defaults (`'crm.view'`, `'crm.create'`, `'crm.edit'`) or if present in `role_permissions` for their `role_id`. |
| `audit_record(p_workspace_id, p_actor_id, p_event_type, p_target_type, p_target_id, p_before, p_after)` | `uuid` | Inserts an audit trail entry into `audit_log` and returns the generated UUID. |
| `prevent_audit_modification()` | `trigger` | Prevents any `UPDATE` or `DELETE` on `audit_log` table (enforces append-only immutability). |

---

## 5. Register of Permission Keys

The LeadFlow platform enforces granular permissions structured into hierarchical domain namespaces:

| Permission Key | Domain | Description | Default Level Access |
| :--- | :--- | :--- | :--- |
| `crm.view` | CRM | View contacts, companies, pipelines, stages, and opportunities. | `owner`, `admin`, `user` |
| `crm.create` | CRM | Create contacts, companies, opportunities, and custom values. | `owner`, `admin`, `user` |
| `crm.edit` | CRM | Modify contacts, companies, opportunities, and pipelines. | `owner`, `admin`, `user` |
| `crm.delete` | CRM | Delete CRM entities (contacts, companies, deals). | `owner`, `admin` |
| `leads.view` | Leads Engine | Inspect incoming leads, queues, and assignment histories. | `owner`, `admin`, `user` |
| `leads.create` | Leads Engine | Ingest leads manually or configure inbound webhook sources. | `owner`, `admin` |
| `leads.edit` | Leads Engine | Edit lead details, notes, and qualification status. | `owner`, `admin`, `user` |
| `leads.assign` | Leads Engine | Manually route or reassign leads to workspace members. | `owner`, `admin` |
| `leads.escalate` | Leads Engine | Manually trigger or override lead escalation timers. | `owner`, `admin` |
| `pipelines.manage` | CRM Config | Add, reorder, or delete pipelines and stages. | `owner`, `admin` |
| `users.manage` | Administration | Invite users, change user levels, configure status & RBAC roles. | `owner`, `admin` |
| `roles.manage` | Administration | Define custom workspace roles and modify permission mappings. | `owner`, `admin` |
| `integrations.manage`| Integrations | Connect, configure, or disconnect third-party services. | `owner`, `admin` |
| `payments.view` | Payments | View invoices, payment transactions, and reconciliation logs. | `owner`, `admin` |
| `payments.manage` | Payments | Generate payment links, refund charges, manage Stripe/provider. | `owner`, `admin` |
| `appointments.manage`| Calendar | Create, update, or cancel contact appointments and sync calendars.| `owner`, `admin`, `user` |
| `audit.view` | Compliance | Read append-only security logs, system events, and audit trails. | `owner`, `admin` |
| `settings.manage` | Workspace | Update assignment SLAs, escalation policies, and general settings.| `owner`, `admin` |
