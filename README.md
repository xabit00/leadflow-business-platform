# LeadFlow — Unified Business Management Platform

LeadFlow is an enterprise-grade multi-tenant CRM and operational business management platform engineered for sales, support, and field teams. The platform unifies lead intake, automated round-robin routing, SLA-based escalation, omni-channel customer messaging, secure payment generation, calendar integrations, and real-time operational analytics into a streamlined interface.


> **Current implementation:** Login, workspace profiles, CRM and lead rules use
> Supabase directly from the frontend. The FastAPI service contains health and
> partial integration endpoints; it does not provide the frontend's auth/CRM APIs.
> The older architecture and local PostgreSQL instructions below describe the
> FastAPI scaffold, not a complete setup for the current frontend.
>
> For the current frontend, copy `frontend/.env.example` to `frontend/.env`, set
> `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to your project's public values,
> and apply `supabase/migrations/0001_schema.sql` through `0005_lead_engine.sql`
> in order to a **new Supabase project**. Do not apply these initial migrations
> again to an existing database. Restart Vite after editing environment variables.
> Never put service-role or secret keys in `VITE_` variables.
>
> `VITE_USE_MOCKS=true` enables demo authentication, but CRM and lead screens still
> call Supabase. It is not a fully offline demo.
>
> Integration work remains: Stripe currently records webhook events but does not
> persist checkout payments; the FastAPI integration models/queries and auth must
> be reconciled with the Supabase schema before end-to-end use. A passing build
> or health endpoint does not mean these integrations are complete.

---

## 1. Project Overview

- **Repository**: `leadflow-business-platform`
- **Architecture**: Monorepo with decoupled React frontend and FastAPI backend.
- **Tenancy**: Multi-tenant workspace isolation with role-based access control.
- **Core Automation**: Automatic lead routing, SLA tracking, employee availability management, and emergency recovery queue.

---

## 2. Technology Stack

### Frontend
- **Framework**: React 18 / 19 with Vite
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Routing**: React Router v6
- **HTTP Client**: Axios
- **Icons**: Lucide React

### Backend
- **Framework**: FastAPI
- **Language**: Python 3.12+ / 3.13
- **ORM / Migrations**: SQLAlchemy 2.0 & Alembic
- **Validation**: Pydantic v2
- **Database**: PostgreSQL 16
- **ASGI Server**: Uvicorn

### Third-Party Services
- **Twilio**: SMS & WhatsApp Sandbox
- **Stripe**: Test Mode Payment Processing
- **Google Calendar API**: OAuth 2.0 Appointment Booking
- **Telegram Bot API**: High-Priority Escalation Alerts

---

## 3. Repository Structure

```text
leadflow-business-platform/
│
├── frontend/                     # React + Vite + TypeScript application
│   ├── public/                   # Static public assets
│   ├── src/
│   │   ├── api/                  # Axios HTTP client and interceptors
│   │   ├── assets/               # Local icons and images
│   │   ├── components/           # UI and Layout components
│   │   │   ├── ui/               # Atomic reusable components
│   │   │   └── layout/           # Navbar, Header, Sidebar
│   │   ├── contexts/             # Global Auth and Workspace state
│   │   ├── hooks/                # Custom React hooks
│   │   ├── layouts/              # Top-level shell layouts
│   │   ├── pages/                # Route view components
│   │   ├── routes/               # Router definitions
│   │   ├── styles/               # Global CSS & Tailwind setup
│   │   ├── types/                # TypeScript shared models
│   │   ├── utils/                # Helper utilities
│   │   ├── App.tsx               # Root component
│   │   └── main.tsx              # Application entry point
│   ├── .env.example              # Frontend environment template
│   ├── package.json              # Frontend npm dependencies
│   └── vite.config.ts            # Vite build configuration
│
├── backend/                      # FastAPI Python application
│   ├── app/
│   │   ├── main.py               # FastAPI entry point & CORS
│   │   ├── core/                 # Config, security, logging
│   │   ├── database/             # SQLAlchemy engine & session
│   │   ├── models/               # SQLAlchemy ORM models
│   │   ├── schemas/              # Pydantic validation schemas
│   │   ├── routers/              # Modular API endpoints
│   │   ├── services/             # Domain business logic
│   │   ├── integrations/         # Third-party adapters
│   │   ├── middleware/           # Workspace context, error handling
│   │   └── utils/                # Helper functions
│   ├── alembic/                  # Database migration scripts
│   ├── tests/                    # Pytest test suite
│   ├── requirements.txt          # Python dependencies
│   ├── alembic.ini               # Alembic configuration
│   └── .env.example              # Backend environment template
│
├── docs/                         # Team architecture & specifications
│   ├── ARCHITECTURE.md           # System architecture & tenancy
│   ├── API_CONTRACTS.md          # REST API specifications (DRAFT)
│   ├── DATABASE_SCHEMA.md        # Database schema & entity catalog
│   ├── TEAM_WORKFLOW.md          # Team branch & git collaboration
│   ├── INTEGRATIONS.md           # Third-party service documentation
│   └── REQUIREMENTS.md           # Competition requirements
│
├── scripts/                      # Developer automation scripts
├── .github/                      # CI/CD workflows
├── .gitignore                    # Git ignore patterns
├── .editorconfig                 # Cross-editor styling rules
├── docker-compose.yml            # Local PostgreSQL container
└── README.md                     # Project documentation
```

---

## 4. Installation & Quickstart

### Prerequisites
- Node.js (v18 or higher) & npm
- Python (v3.12 or higher)
- Git
- (Optional) Docker & Docker Compose for PostgreSQL

---

## 5. Running Frontend

```bash
cd frontend

# 1. Copy environment template
cp .env.example .env

# 2. Install dependencies
npm install

# 3. Start local development server
npm run dev
```

The frontend will be available at **`http://localhost:5173`**.

---

## 6. Running Backend

```bash
cd backend

# 1. Copy environment template
cp .env.example .env

# 2. Create virtual environment
python -m venv .venv

# 3. Activate virtual environment
# Windows PowerShell:
.venv\Scripts\Activate.ps1
# Windows CMD:
.venv\Scripts\activate.bat
# Linux / macOS:
source .venv/bin/activate

# 4. Install dependencies
pip install -r requirements.txt

# 5. Start FastAPI development server
uvicorn app.main:app --reload --port 8000
```

The backend will be available at **`http://localhost:8000`**.  
Interactive API Documentation (Swagger UI): **`http://localhost:8000/docs`**.

---

## 7. Database Setup

### Local PostgreSQL via Docker Compose:
```bash
# In the repository root:
docker-compose up -d
```

### Run Migrations:
```bash
cd backend
# Ensure virtual environment is activated
alembic upgrade head
```

---

## 8. Environment Variables

### Frontend (`frontend/.env.example`)
```env
VITE_API_BASE_URL=http://localhost:8000
VITE_APP_NAME=LeadFlow
```

### Backend (`backend/.env.example`)
```env
APP_NAME=LeadFlow
ENVIRONMENT=development
DEBUG=True
PORT=8000
SECRET_KEY=change-me-in-production-leadflow-secret-key-32chars
DATABASE_URL=postgresql://leadflow_user:leadflow_password@localhost:5432/leadflow_db
CORS_ORIGINS=["http://localhost:5173","http://127.0.0.1:5173"]

# Third-Party Integrations (Optional in Level 0)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
STRIPE_SECRET_KEY=
TELEGRAM_BOT_TOKEN=
```

---

## 9. Branch Workflow & Team Roles

This project is built collaboratively by three engineers using dedicated branches:

- **`main`**: Production-ready base branch.
- **`feature/frontend`**: Owned by **Member 1 (Frontend Lead)** — React UI, layouts, screens, API hooks.
- **`feature/core-backend`**: Owned by **Member 2 (Backend Architect)** — Database models, auth, CRM APIs, lead engine.
- **`feature/integrations`**: Owned by **Member 3 (Integrations & Analytics)** — Twilio, Stripe, Calendar, Telegram, Dashboards.
- **`integration/test`**: Staging branch for joint verification before merging to `main`.

Refer to [`docs/TEAM_WORKFLOW.md`](docs/TEAM_WORKFLOW.md) for full branch commands.

---

## 10. Development & Collaboration Rules

1. **Zero Credential Commits**: Never commit actual secrets or `.env` files.
2. **Schema Control**: Only Member 2 creates database models and migrations.
3. **No Direct Pushes to Main**: All features flow through feature branches into `integration/test` then `main`.
4. **Isolated Workspaces**: Every operational API request and database query must filter by `workspace_id`.
5. **No Force Pushes**: Keep Git history intact.

---

## 11. Testing

### Backend Unit Tests:
```bash
cd backend
pytest tests/ -v
```

### Frontend Build & Typecheck:
```bash
cd frontend
npm run build
```

---

## 12. Troubleshooting

- **CORS Issues**: Ensure `CORS_ORIGINS` in `backend/.env` includes `http://localhost:5173`.
- **Database Connection**: If PostgreSQL is not running locally, `/health` still responds with status `healthy` since DB connectivity is non-blocking for basic health checks.
- **PowerShell Script Execution**: If PowerShell restricts script activation, run:
  ```powershell
  Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
  ```
