from typing import Generator, AsyncGenerator
from sqlalchemy import create_engine, text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import sessionmaker, Session
from app.core.config import settings
from app.core.logging import logger

# Configure SQLAlchemy engine with connection pool parameters
# pool_pre_ping=True checks validity before giving connection from pool
engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    connect_args={"connect_timeout": 1} if "postgresql" in settings.DATABASE_URL else {},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


# Async SQLAlchemy engine / session (required by the integration layer).
# DATABASE_URL must use the postgresql+asyncpg:// dialect (asyncpg driver).
async_database_url = settings.DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)
async_engine = create_async_engine(
    async_database_url,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)
AsyncSessionLocal = async_sessionmaker(
    async_engine, class_=AsyncSession, expire_on_commit=False
)


async def get_async_db() -> AsyncGenerator[AsyncSession, None]:
    """Async dependency that yields a SQLAlchemy AsyncSession for request lifecycle."""
    async with AsyncSessionLocal() as session:
        yield session


def get_db() -> Generator[Session, None, None]:
    """Dependency that yields a database session for request lifecycle."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def check_db_connection() -> dict:
    """
    Non-blocking diagnostic database check.
    Returns status dictionary without throwing uncaught exceptions.
    """
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "connected", "database": "PostgreSQL (Live)"}
    except Exception as exc:
        logger.debug(f"Database ping bypassed/failed (expected in Level 0 if DB uninitialized): {exc}")
        return {"status": "unconnected", "database": "PostgreSQL (Configured - Pending Connection)"}
