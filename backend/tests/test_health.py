from fastapi.testclient import TestClient


def test_root_endpoint(client: TestClient):
    """Verify GET / returns application information."""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["app_name"] == "LeadFlow"
    assert data["status"] == "running"
    assert "version" in data
    assert "environment" in data


def test_health_endpoint(client: TestClient):
    """Verify GET /health returns operational health status."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["app_name"] == "LeadFlow"
    assert "timestamp" in data
    assert "database" in data


def test_workspace_context_header_propagation(client: TestClient):
    """Verify X-Workspace-ID header is handled and echoed by middleware."""
    test_ws_id = "123e4567-e89b-12d3-a456-426614174000"
    response = client.get("/health", headers={"X-Workspace-ID": test_ws_id})
    assert response.status_code == 200
    assert response.headers.get("X-Workspace-ID") == test_ws_id
