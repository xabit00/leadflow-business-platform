from contextvars import ContextVar
from typing import Optional
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

# Context variable for thread/task-safe workspace isolation
_current_workspace_id: ContextVar[Optional[str]] = ContextVar("current_workspace_id", default=None)


def get_current_workspace_id() -> Optional[str]:
    """Retrieve the current request's tenant workspace ID."""
    return _current_workspace_id.get()


class WorkspaceContextMiddleware(BaseHTTPMiddleware):
    """
    Middleware that inspects incoming HTTP requests for workspace tenant identification.
    Reads X-Workspace-ID header and binds it to contextvar.
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        workspace_id = request.headers.get("X-Workspace-ID")
        token = _current_workspace_id.set(workspace_id)
        try:
            response = await call_next(request)
            if workspace_id:
                response.headers["X-Workspace-ID"] = workspace_id
            return response
        finally:
            _current_workspace_id.reset(token)
