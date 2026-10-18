from datetime import datetime, timezone
from pydantic import BaseModel, Field


class RootResponse(BaseModel):
    """Application metadata response for GET /."""
    app_name: str = Field(..., description="Application name")
    version: str = Field(..., description="API version")
    status: str = Field(..., description="Operational status")
    environment: str = Field(..., description="Runtime environment")
    docs_url: str = Field(..., description="URL to interactive documentation")
    message: str = Field(..., description="Informational message")


class HealthResponse(BaseModel):
    """Health check response for GET /health."""
    status: str = Field(default="healthy", description="Application health status")
    app_name: str = Field(..., description="Application name")
    version: str = Field(..., description="Application version")
    environment: str = Field(..., description="Runtime environment")
    timestamp: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        description="UTC timestamp of the health check"
    )
    database: str = Field(
        default="PostgreSQL (Configured)",
        description="Database connectivity status"
    )
