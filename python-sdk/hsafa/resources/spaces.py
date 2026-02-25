from typing import Any, Dict, Optional

from ..http import HttpClient
from ..sse import SSEStream


class SpacesResource:
    def __init__(self, http: HttpClient):
        self._http = http

    def create(
        self,
        name: Optional[str] = None,
        description: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        show_agent_reasoning: Optional[bool] = None,
    ) -> Dict[str, Any]:
        return self._http.post("/api/smart-spaces", {
            "name": name,
            "description": description,
            "metadata": metadata,
            "showAgentReasoning": show_agent_reasoning,
        })

    def list(
        self,
        entity_id: Optional[str] = None,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
    ) -> Dict[str, Any]:
        return self._http.get("/api/smart-spaces", {
            "entityId": entity_id,
            "limit": limit,
            "offset": offset,
        })

    def get(self, space_id: str) -> Dict[str, Any]:
        return self._http.get(f"/api/smart-spaces/{space_id}")

    def update(
        self,
        space_id: str,
        name: Optional[str] = None,
        description: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        show_agent_reasoning: Optional[bool] = None,
    ) -> Dict[str, Any]:
        return self._http.patch(f"/api/smart-spaces/{space_id}", {
            "name": name,
            "description": description,
            "metadata": metadata,
            "showAgentReasoning": show_agent_reasoning,
        })

    def delete(self, space_id: str) -> Dict[str, Any]:
        return self._http.delete(f"/api/smart-spaces/{space_id}")

    def add_member(self, space_id: str, entity_id: str, role: Optional[str] = None) -> Dict[str, Any]:
        return self._http.post(f"/api/smart-spaces/{space_id}/members", {
            "entityId": entity_id,
            "role": role,
        })

    def list_members(self, space_id: str) -> Dict[str, Any]:
        return self._http.get(f"/api/smart-spaces/{space_id}/members")

    def update_member(self, space_id: str, entity_id: str, role: str) -> Dict[str, Any]:
        return self._http.patch(
            f"/api/smart-spaces/{space_id}/members/{entity_id}",
            {"role": role},
        )

    def remove_member(self, space_id: str, entity_id: str) -> Dict[str, Any]:
        return self._http.delete(f"/api/smart-spaces/{space_id}/members/{entity_id}")

    def subscribe(self, space_id: str, after_seq: Optional[int] = None, since: Optional[str] = None) -> SSEStream:
        params: Dict[str, Any] = {}
        if after_seq is not None:
            params["afterSeq"] = after_seq
        if since:
            params["since"] = since
        url = self._http.build_url(f"/api/smart-spaces/{space_id}/stream", params)
        return SSEStream(url, self._http.get_auth_headers(), reconnect=True).start()
