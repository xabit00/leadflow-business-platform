#!/usr/bin/env bash
# LeadFlow Unix Local Dev Helper

TARGET=${1:-all}

echo "========================================"
echo "   LeadFlow Development Helper (Bash)   "
echo "========================================"

case $TARGET in
  frontend)
    echo "[+] Starting Frontend on http://localhost:5173..."
    cd "$(dirname "$0")/../frontend" || exit 1
    npm run dev
    ;;
  backend)
    echo "[+] Starting Backend on http://localhost:8000..."
    cd "$(dirname "$0")/../backend" || exit 1
    if [ -f ".venv/bin/activate" ]; then
      source .venv/bin/activate
    fi
    uvicorn app.main:app --reload --port 8000
    ;;
  db-up)
    echo "[+] Starting PostgreSQL via Docker Compose..."
    cd "$(dirname "$0")/.." || exit 1
    docker-compose up -d
    ;;
  db-down)
    echo "[-] Stopping PostgreSQL..."
    cd "$(dirname "$0")/.." || exit 1
    docker-compose down
    ;;
  *)
    echo "Usage:"
    echo "  ./scripts/dev.sh frontend   - Start Vite frontend"
    echo "  ./scripts/dev.sh backend    - Start FastAPI backend"
    echo "  ./scripts/dev.sh db-up      - Start local Postgres container"
    echo "  ./scripts/dev.sh db-down    - Stop local Postgres container"
    ;;
esac
