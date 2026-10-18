# LeadFlow — Team Collaboration & Workflow Guide

## 1. Team Roles & Branch Ownership

The team consists of three engineers working simultaneously on dedicated branches with clear boundary ownership to eliminate git conflicts and race conditions.

| Role | Engineer | Assigned Branch | Primary Ownership |
| :--- | :--- | :--- | :--- |
| **Member 1** | Team Leader / Frontend | `feature/frontend` | `frontend/` |
| **Member 2** | Core Backend Architect | `feature/core-backend` | `backend/app/{core,database,models,schemas,routers,services}/`, `backend/alembic/` |
| **Member 3** | Integrations & Analytics | `feature/integrations` | `backend/app/integrations/`, integration test modules |

---

## 2. Collaboration & Safety Rules

1. **Strict Branch Isolation**: Never commit directly to `main`. All development takes place on assigned feature branches.
2. **Schema Authority**: **Member 2** is the sole authority for database models and Alembic migrations. Member 3 must submit schema requests to Member 2 rather than generating competing migration files.
3. **No Credential Commits**: Real API keys, JWT secrets, database passwords, or auth tokens must never be committed. Always use `.env.example` templates.
4. **Integration Branch (`integration/test`)**: When features are ready to be tested together, branches are merged into `integration/test` for integration testing before staging into `main`.
5. **No Force Pushing**: `git push --force` is strictly forbidden on shared or remote branches.

---

## 3. Developer Instructions & Exact Commands

### 3.1 Member 1 — Team Leader / Frontend

**Initial Setup:**
```bash
# Clone the repository
git clone <REPOSITORY_URL> leadflow-business-platform
cd leadflow-business-platform

# Switch to assigned frontend branch
git checkout feature/frontend

# Install frontend dependencies
cd frontend
npm install

# Start development server (Runs on http://localhost:5173)
npm run dev
```

**Daily Workflow:**
```bash
# Ensure working on frontend branch
git checkout feature/frontend
git pull origin feature/frontend

# Make changes strictly inside frontend/
# Stage and commit changes
git add frontend/
git commit -m "feat(ui): implement responsive contact list view"

# Push to remote
git push origin feature/frontend
```

---

### 3.2 Member 2 — Core Backend Architect

**Initial Setup:**
```bash
# Clone the repository
git clone <REPOSITORY_URL> leadflow-business-platform
cd leadflow-business-platform

# Switch to assigned backend branch
git checkout feature/core-backend

# Set up Python virtual environment
cd backend
python -m venv .venv

# Activate virtual environment
# Windows PowerShell:
.venv\Scripts\Activate.ps1
# Linux/macOS:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start backend server (Runs on http://localhost:8000)
uvicorn app.main:app --reload --port 8000
```

**Daily Workflow & Migrations:**
```bash
# Ensure working on core backend branch
git checkout feature/core-backend
git pull origin feature/core-backend

# Make changes to core, models, schemas, services
# If models were changed, create migration:
alembic revision --autogenerate -m "add_leads_table"
alembic upgrade head

# Run tests
pytest tests/

# Stage and commit
git add backend/
git commit -m "feat(api): implement lead assignment service and schemas"

# Push to remote
git push origin feature/core-backend
```

---

### 3.3 Member 3 — Integrations & Analytics

**Initial Setup:**
```bash
# Clone the repository
git clone <REPOSITORY_URL> leadflow-business-platform
cd leadflow-business-platform

# Switch to assigned integrations branch
git checkout feature/integrations

# Set up Python virtual environment
cd backend
python -m venv .venv

# Activate virtual environment
# Windows PowerShell:
.venv\Scripts\Activate.ps1
# Linux/macOS:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start backend server
uvicorn app.main:app --reload --port 8000
```

**Daily Workflow:**
```bash
# Ensure working on integrations branch
git checkout feature/integrations
git pull origin feature/integrations

# Work inside backend/app/integrations/ and integration routes/tests
# Stage and commit
git add backend/app/integrations/ backend/tests/test_integrations/
git commit -m "feat(integrations): add Twilio webhook signature verification"

# Push to remote
git push origin feature/integrations
```

---

## 4. Integration & Merge Protocol

When preparing a release or submitting a competition milestone:

```text
feature/frontend       ─┐
feature/core-backend   ──┼─► integration/test ──(Verify CI & Smoke Tests)──► main
feature/integrations   ─┘
```

1. **Step 1:** All members push their latest tested commits to their respective remote branches.
2. **Step 2:** Team Leader checks out `integration/test` and merges each feature branch:
   ```bash
   git checkout integration/test
   git pull origin integration/test
   git merge feature/core-backend
   git merge feature/integrations
   git merge feature/frontend
   ```
3. **Step 3:** Run all automated checks:
   ```bash
   cd frontend && npm run build
   cd ../backend && pytest
   ```
4. **Step 4:** Once verified, open a Pull Request from `integration/test` to `main`.
