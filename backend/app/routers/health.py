from datetime import datetime, timezone
from fastapi import APIRouter
from app.core.config import settings
from app.database.session import check_db_connection
from app.schemas.health import HealthResponse, RootResponse

router = APIRouter(tags=["System"])


@router.get(
    "/",
    response_model=RootResponse,
    summary="Application Information",
    description="Returns basic application metadata, version, and status."
)
async def get_root() -> RootResponse:
    """Root metadata endpoint."""
    return RootResponse(
        app_name=settings.APP_NAME,
        version=settings.APP_VERSION,
        status="running",
        environment=settings.ENVIRONMENT,
        docs_url="/docs",
        message="LeadFlow - Unified Business Management Platform API",
    )


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Health Diagnostic Check",
    description="Returns backend operational status and database connectivity."
)
async def get_health() -> HealthResponse:
    """
    Health check endpoint.
    Performs non-blocking diagnostic checks.
    """
    db_info = check_db_connection()
    return HealthResponse(
        status="healthy",
        app_name=settings.APP_NAME,
        version=settings.APP_VERSION,
        environment=settings.ENVIRONMENT,
        timestamp=datetime.now(timezone.utc),
        database=db_info["database"],
    )
