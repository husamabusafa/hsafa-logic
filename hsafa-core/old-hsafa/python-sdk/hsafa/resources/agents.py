from typing import Any, Dict, Optional

from ..http import HttpClient


class AgentsResource:
    def __init__(self, http: HttpClient):
        self._http = http

    def create(self, name: Optional[str] = None, config: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        return self._http.post("/api/agents", {"name": name, "config": config or {}})

    def list(self, limit: Optional[int] = None, offset: Optional[int] = None) -> Dict[str, Any]:
        return self._http.get("/api/agents", {"limit": limit, "offset": offset})

    def get(self, agent_id: str) -> Dict[str, Any]:
        return self._http.get(f"/api/agents/{agent_id}")

    def delete(self, agent_id: str) -> Dict[str, Any]:
        return self._http.delete(f"/api/agents/{agent_id}")

    def trigger(self, agent_id: str, service_name: str, payload: Any = None) -> Dict[str, Any]:
        """Trigger an agent from an external service (cron, Jira, Slack, etc.)."""
        return self._http.post(
            f"/api/agents/{agent_id}/trigger",
            {"serviceName": service_name, "payload": payload},
        )
