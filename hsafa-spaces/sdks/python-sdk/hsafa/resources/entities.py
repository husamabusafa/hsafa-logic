from typing import Any, Dict, Optional

from ..http import HttpClient
from ..sse import SSEStream


class EntitiesResource:
    def __init__(self, http: HttpClient):
        self._http = http

    def create(
        self,
        external_id: Optional[str] = None,
        display_name: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        return self._http.post("/api/entities", {
            "type": "human",
            "externalId": external_id,
            "displayName": display_name,
            "metadata": metadata,
        })

    def create_agent(
        self,
        agent_id: str,
        display_name: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        return self._http.post("/api/entities/agent", {
            "agentId": agent_id,
            "displayName": display_name,
            "metadata": metadata,
        })

    def list(
        self,
        type: Optional[str] = None,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
    ) -> Dict[str, Any]:
        return self._http.get("/api/entities", {"type": type, "limit": limit, "offset": offset})

    def get(self, entity_id: str) -> Dict[str, Any]:
        return self._http.get(f"/api/entities/{entity_id}")

    def update(
        self,
        entity_id: str,
        display_name: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        return self._http.patch(f"/api/entities/{entity_id}", {
            "displayName": display_name,
            "metadata": metadata,
        })

    def delete(self, entity_id: str) -> Dict[str, Any]:
        return self._http.delete(f"/api/entities/{entity_id}")

    def subscribe(self, entity_id: str) -> SSEStream:
        url = f"{self._http.base_url}/api/entities/{entity_id}/stream"
        return SSEStream(url, self._http.get_auth_headers(), reconnect=True).start()
