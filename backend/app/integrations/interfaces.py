"""
Integration Protocol Interfaces.

Defines the boundary between the integration layer (Member 3) and core CRM models
(Member 2) without coupling to unfinished core entities or using fake implementations.
"""

from __future__ import annotations

from typing import Any, Dict, Optional, Protocol, runtime_checkable
from uuid import UUID


@runtime_checkable
class ContactLeadService(Protocol):
    """
    Protocol for CRM contact & lead resolution invoked by messaging webhooks.
    Real implementations are provided by Member 2 / Core Backend service layer.
    """

    async def create_or_get_contact_by_phone(
        self,
        workspace_id: UUID,
        phone: str,
        first_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Match existing contact by phone or provision a new one."""
        ...

    async def create_lead(
        self,
        workspace_id: UUID,
        full_name: str,
        phone: str,
        source: str = "whatsapp",
        notes: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Ingest a new lead from an incoming message."""
        ...

    async def is_opted_out(
        self,
        workspace_id: UUID,
        phone: str,
    ) -> bool:
        """Verify whether contact has unsubscribed / opted out."""
        ...
