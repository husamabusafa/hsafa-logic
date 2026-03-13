// =============================================================================
// Core Proxy — Helper to call hsafa-core API for Haseef CRUD
//
// Uses HSAFA_GATEWAY_URL + CORE_API_KEY from environment.
// =============================================================================

const CORE_URL = process.env.HSAFA_GATEWAY_URL || "http://localhost:3001";
const API_KEY = process.env.CORE_API_KEY || "";

if (!API_KEY) {
  console.warn("[core-proxy] ⚠ CORE_API_KEY is not set — haseef CRUD will fail. Set it to match HSAFA_API_KEY in your core .env");
}

function headers(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-api-key": API_KEY,
  };
}

export interface CoreHaseef {
  id: string;
  name: string;
  description?: string;
  profileJson?: Record<string, unknown>;
  configJson?: Record<string, unknown>;
  createdAt?: string;
}

export async function createHaseef(data: {
  name: string;
  description?: string;
  configJson: Record<string, unknown>;
  profileJson?: Record<string, unknown>;
}): Promise<CoreHaseef> {
  const res = await fetch(`${CORE_URL}/api/haseefs`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const text = await res.text();
    throw { status: res.status, error: `Core create failed: ${text}` };
  }
  const json = await res.json();
  return json.haseef;
}

export async function getHaseef(id: string): Promise<CoreHaseef> {
  const res = await fetch(`${CORE_URL}/api/haseefs/${id}`, {
    headers: headers(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw { status: res.status, error: `Core get failed: ${text}` };
  }
  const json = await res.json();
  return json.haseef;
}

export async function updateHaseef(
  id: string,
  data: {
    name?: string;
    description?: string;
    configJson?: Record<string, unknown>;
  },
): Promise<CoreHaseef> {
  const res = await fetch(`${CORE_URL}/api/haseefs/${id}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const text = await res.text();
    throw { status: res.status, error: `Core update failed: ${text}` };
  }
  const json = await res.json();
  return json.haseef;
}

export async function deleteHaseef(id: string): Promise<void> {
  const res = await fetch(`${CORE_URL}/api/haseefs/${id}`, {
    method: "DELETE",
    headers: headers(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw { status: res.status, error: `Core delete failed: ${text}` };
  }
}

export async function listHaseefs(): Promise<CoreHaseef[]> {
  const res = await fetch(`${CORE_URL}/api/haseefs`, {
    headers: headers(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw { status: res.status, error: `Core list failed: ${text}` };
  }
  const json = await res.json();
  return json.haseefs ?? [];
}
