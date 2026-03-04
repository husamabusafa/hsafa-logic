from typing import Dict, Optional


def build_auth_headers(
    secret_key: Optional[str] = None,
    public_key: Optional[str] = None,
    jwt: Optional[str] = None,
) -> Dict[str, str]:
    headers: Dict[str, str] = {}
    if secret_key:
        headers["x-secret-key"] = secret_key
    elif public_key:
        headers["x-public-key"] = public_key
        if jwt:
            headers["Authorization"] = f"Bearer {jwt}"
    return headers
