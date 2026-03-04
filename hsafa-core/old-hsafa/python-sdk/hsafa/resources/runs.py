from typing import Any, Dict, Optional

from ..http import HttpClient
from ..sse import SSEStream


class RunsResource:
    def __init__(self, http: HttpClient):
        self._http = http

    def list(
        self,
        space_id: Optional[str] = None,
        agent_entity_id: Optional[str] = None,
        agent_id: Optional[str] = None,
        status: Optional[str] = None,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
    ) -> Dict[str, Any]:
        return self._http.get("/api/runs", {
            "smartSpaceId": space_id,
            "agentEntityId": agent_entity_id,
            "agentId": agent_id,
            "status": status,
            "limit": limit,
            "offset": offset,
        })

    def get(self, run_id: str) -> Dict[str, Any]:
        return self._http.get(f"/api/runs/{run_id}")

    def create(
        self,
        agent_entity_id: str,
        agent_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        return self._http.post("/api/runs", {
            "agentEntityId": agent_entity_id,
            "agentId": agent_id,
            "metadata": metadata,
        })

    def cancel(self, run_id: str) -> Dict[str, Any]:
        return self._http.post(f"/api/runs/{run_id}/cancel")

    def delete(self, run_id: str) -> Dict[str, Any]:
        return self._http.delete(f"/api/runs/{run_id}")

    def get_events(self, run_id: str) -> Dict[str, Any]:
        return self._http.get(f"/api/runs/{run_id}/events")

    def subscribe(self, run_id: str, since: Optional[str] = None) -> SSEStream:
        params: Dict[str, Any] = {}
        if since:
            params["since"] = since
        url = self._http.build_url(f"/api/runs/{run_id}/stream", params)
        return SSEStream(url, self._http.get_auth_headers(), reconnect=True).start()
