from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.logging import logger
from app.middleware.error_handler import register_error_handlers
from app.middleware.workspace_context import WorkspaceContextMiddleware
from app.routers import api_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle event handler for startup and shutdown procedures."""
    logger.info(f"Starting {settings.APP_NAME} v{settings.APP_VERSION} in [{settings.ENVIRONMENT}] mode...")
    logger.info("Initializing multi-tenant database session pool...")
    yield
    logger.info("Shutting down LeadFlow API...")


def create_application() -> FastAPI:
    """FastAPI application factory."""
    app = FastAPI(
        title=f"{settings.APP_NAME} API",
        version=settings.APP_VERSION,
        description="LeadFlow - Unified Business Management Platform REST API",
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
        lifespan=lifespan,
    )

    # 1. Register Cross-Origin Resource Sharing (CORS)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # 2. Register Multi-Tenant Workspace Context Middleware
    app.add_middleware(WorkspaceContextMiddleware)

    # 3. Register Centralized Exception Handlers
    register_error_handlers(app)

    # 4. Register Modular Routers
    app.include_router(api_router)

    return app


app = create_application()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=settings.PORT,
        reload=settings.DEBUG,
    )
