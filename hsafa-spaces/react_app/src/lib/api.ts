const API_BASE = "/api";

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function getToken(): string | null {
  return localStorage.getItem("hsafa_token");
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new ApiError(data.error || "Request failed", res.status);
  }

  return data as T;
}

// ── Auth types ───────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  entityId: string | null;
  smartSpaceId: string | null;
  avatarUrl: string | null;
  emailVerified: boolean;
  spaces: Array<{ id: string; name: string }>;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
  verificationRequired?: boolean;
}

// ── Auth API ─────────────────────────────────────────────────────────────────

export const authApi = {
  register(name: string, email: string, password: string) {
    return request<AuthResponse>("/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    });
  },

  login(email: string, password: string) {
    return request<AuthResponse>("/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },

  me() {
    return request<{ user: AuthUser }>("/me");
  },

  verifyEmail(code: string) {
    return request<{ success: boolean; message: string }>("/verify-email", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
  },

  resendCode() {
    return request<{ success: boolean; message: string }>("/resend-code", {
      method: "POST",
    });
  },
};

export { ApiError };
