from typing import Any, Dict, Optional

from ..http import HttpClient


class ClientsResource:
    def __init__(self, http: HttpClient):
        self._http = http

    def register(
        self,
        entity_id: str,
        client_key: str,
        client_type: Optional[str] = None,
        display_name: Optional[str] = None,
        capabilities: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        return self._http.post("/api/clients/register", {
            "entityId": entity_id,
            "clientKey": client_key,
            "clientType": client_type,
            "displayName": display_name,
            "capabilities": capabilities,
        })

    def list(self, entity_id: str) -> Dict[str, Any]:
        return self._http.get("/api/clients", {"entityId": entity_id})

    def delete(self, client_id: str) -> Dict[str, Any]:
        return self._http.delete(f"/api/clients/{client_id}")
