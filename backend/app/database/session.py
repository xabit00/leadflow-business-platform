from typing import Generator
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session
from app.core.config import settings
from app.core.logging import logger

# Configure SQLAlchemy engine with connection pool parameters
# pool_pre_ping=True checks validity before giving connection from pool
engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    connect_args={"connect_timeout": 1} if "postgresql" in settings.DATABASE_URL else {},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


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
