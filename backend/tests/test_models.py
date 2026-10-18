import app.models
from app.database.base import Base


EXPECTED_TABLES = {
    'workspaces', 'users', 'roles', 'user_workspace_roles', 'companies',
    'contacts', 'pipelines', 'pipeline_stages', 'opportunities', 'custom_fields',
    'leads', 'lead_assignments', 'lead_escalations', 'activities', 'audit_events',
    'conversations', 'messages', 'payments', 'appointments',
    'integration_connections', 'integration_events',
}


def test_initial_schema_is_registered() -> None:
    assert set(Base.metadata.tables) == EXPECTED_TABLES


def test_tenant_columns_reference_workspaces() -> None:
    for table in Base.metadata.tables.values():
        if 'workspace_id' not in table.c:
            continue
        targets = {key.target_fullname for key in table.c.workspace_id.foreign_keys}
        assert targets == {'workspaces.id'}
