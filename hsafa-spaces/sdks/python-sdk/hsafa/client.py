from typing import Any, Dict, List, Optional

from .http import HttpClient
from .resources.agents import AgentsResource
from .resources.clients import ClientsResource
from .resources.entities import EntitiesResource
from .resources.messages import MessagesResource
from .resources.runs import RunsResource
from .resources.spaces import SpacesResource
from .resources.tools import ToolsResource


class SetupResource:
    """Convenience methods for common bootstrapping operations."""

    def __init__(self, spaces: SpacesResource, entities: EntitiesResource):
        self._spaces = spaces
        self._entities = entities

    def create_space(
        self,
        name: str,
        agents: Optional[List[Dict[str, Any]]] = None,
        humans: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """
        Create a SmartSpace with entities and memberships in one call.

        agents = [{"agent_id": "...", "display_name": "..."}]
        humans = [{"external_id": "...", "display_name": "..."}]
        """
        space_result = self._spaces.create(name=name)
        smart_space = space_result["smartSpace"]
        space_id: str = smart_space["id"]

        created_entities: List[Dict[str, Any]] = []
        created_memberships: List[Dict[str, Any]] = []

        for a in agents or []:
            entity_result = self._entities.create_agent(
                agent_id=a["agent_id"],
                display_name=a.get("display_name"),
            )
            entity = entity_result["entity"]
            created_entities.append(entity)
            membership_result = self._spaces.add_member(space_id, entity["id"])
            created_memberships.append(membership_result["membership"])

        for h in humans or []:
            entity_result = self._entities.create(
                external_id=h.get("external_id"),
                display_name=h.get("display_name"),
                metadata=h.get("metadata"),
            )
            entity = entity_result["entity"]
            created_entities.append(entity)
            membership_result = self._spaces.add_member(space_id, entity["id"])
            created_memberships.append(membership_result["membership"])

        return {
            "smartSpace": smart_space,
            "entities": created_entities,
            "memberships": created_memberships,
        }


class HsafaClient:
    """
    Python SDK for Hsafa gateway v3.

    Usage (server/backend — secret key):
        client = HsafaClient(
            gateway_url="http://localhost:3001",
            secret_key="sk_...",
        )

    Usage (browser equivalent — public key + JWT):
        client = HsafaClient(
            gateway_url="http://localhost:3001",
            public_key="pk_...",
            jwt="eyJ...",
        )
    """

    def __init__(
        self,
        gateway_url: str,
        secret_key: Optional[str] = None,
        public_key: Optional[str] = None,
        jwt: Optional[str] = None,
    ):
        self._http = HttpClient(
            gateway_url=gateway_url,
            secret_key=secret_key,
            public_key=public_key,
            jwt=jwt,
        )
        self.agents = AgentsResource(self._http)
        self.entities = EntitiesResource(self._http)
        self.spaces = SpacesResource(self._http)
        self.messages = MessagesResource(self._http)
        self.runs = RunsResource(self._http)
        self.tools = ToolsResource(self._http)
        self.clients = ClientsResource(self._http)
        self.setup = SetupResource(self.spaces, self.entities)
