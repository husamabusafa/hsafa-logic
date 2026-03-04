import json
from typing import Any, Dict, Optional
from urllib.parse import urlencode

import requests

from .auth import build_auth_headers


class HsafaApiError(Exception):
    def __init__(self, status: int, body: Any):
        if isinstance(body, dict) and "error" in body:
            message = str(body["error"])
        else:
            message = f"HTTP {status}"
        super().__init__(message)
        self.status = status
        self.body = body


class HttpClient:
    def __init__(
        self,
        gateway_url: str,
        secret_key: Optional[str] = None,
        public_key: Optional[str] = None,
        jwt: Optional[str] = None,
    ):
        self.base_url = gateway_url.rstrip("/")
        self.secret_key = secret_key
        self.public_key = public_key
        self.jwt = jwt

    def get_auth_headers(self) -> Dict[str, str]:
        return build_auth_headers(self.secret_key, self.public_key, self.jwt)

    def _build_headers(self) -> Dict[str, str]:
        return {"Content-Type": "application/json", **self.get_auth_headers()}

    def build_url(self, path: str, params: Optional[Dict[str, Any]] = None) -> str:
        url = f"{self.base_url}{path}"
        if params:
            filtered = {k: str(v) for k, v in params.items() if v is not None}
            if filtered:
                url = f"{url}?{urlencode(filtered)}"
        return url

    def _request(
        self,
        method: str,
        path: str,
        body: Any = None,
        params: Optional[Dict[str, Any]] = None,
    ) -> Any:
        url = self.build_url(path, params)
        headers = self._build_headers()

        kwargs: Dict[str, Any] = {"headers": headers}
        if body is not None and method != "GET":
            kwargs["data"] = json.dumps(body)

        response = requests.request(method, url, **kwargs)

        if not response.ok:
            try:
                error_body = response.json()
            except Exception:
                error_body = response.text
            raise HsafaApiError(response.status_code, error_body)

        return response.json()

    def get(self, path: str, params: Optional[Dict[str, Any]] = None) -> Any:
        return self._request("GET", path, params=params)

    def post(self, path: str, body: Any = None) -> Any:
        return self._request("POST", path, body=body)

    def patch(self, path: str, body: Any = None) -> Any:
        return self._request("PATCH", path, body=body)

    def delete(self, path: str) -> Any:
        return self._request("DELETE", path)
