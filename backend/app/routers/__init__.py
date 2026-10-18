"""
Modular routers registry.
New domain routers (auth, crm, leads, integrations) will be registered here.
"""
from fastapi import APIRouter
from app.routers.health import router as health_router
from app.routers.integrations import router as integrations_router

api_router = APIRouter()

# Register core system endpoints
api_router.include_router(health_router)

# Register integration endpoints (webhooks + tenant-scoped metrics)
api_router.include_router(integrations_router)

__all__ = ["api_router", "health_router", "integrations_router"]
