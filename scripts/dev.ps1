# LeadFlow Windows Local Dev Helper
param (
    [Parameter(Position=0)]
    [ValidateSet("frontend", "backend", "db-up", "db-down", "all")]
    [string]$Target = "all"
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " LeadFlow Development Helper (PowerShell) " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

switch ($Target) {
    "frontend" {
        Write-Host "[+] Starting Frontend on http://localhost:5173..." -ForegroundColor Green
        Set-Location "$PSScriptRoot\..\frontend"
        npm run dev
    }
    "backend" {
        Write-Host "[+] Starting Backend on http://localhost:8000..." -ForegroundColor Green
        Set-Location "$PSScriptRoot\..\backend"
        if (Test-Path ".venv\Scripts\Activate.ps1") {
            .venv\Scripts\Activate.ps1
        }
        uvicorn app.main:app --reload --port 8000
    }
    "db-up" {
        Write-Host "[+] Starting PostgreSQL via Docker Compose..." -ForegroundColor Green
        Set-Location "$PSScriptRoot\.."
        docker-compose up -d
    }
    "db-down" {
        Write-Host "[-] Stopping PostgreSQL..." -ForegroundColor Yellow
        Set-Location "$PSScriptRoot\.."
        docker-compose down
    }
    "all" {
        Write-Host "Usage:"
        Write-Host "  .\scripts\dev.ps1 frontend   - Start Vite frontend"
        Write-Host "  .\scripts\dev.ps1 backend    - Start FastAPI backend"
        Write-Host "  .\scripts\dev.ps1 db-up      - Start local Postgres container"
        Write-Host "  .\scripts\dev.ps1 db-down    - Stop local Postgres container"
    }
}
