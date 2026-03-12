import { useState, useEffect } from "react";
import { AuthForm, type AuthSession } from "@/components/register-form";
import { ChatPage } from "@/components/chat-page";
import { ThemeProvider } from "@/components/theme-provider";

const TOKEN_KEY = "hsafa-spaces-token";
const SESSION_KEY = "hsafa-spaces-session";

function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function getStoredSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
}

function storeSession(session: AuthSession) {
  localStorage.setItem(TOKEN_KEY, session.token);
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(SESSION_KEY);
}

export default function App() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getStoredToken();
    const cached = getStoredSession();

    if (!token || !cached) {
      setLoading(false);
      return;
    }

    fetch("/api/me", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Invalid token");
        return res.json();
      })
      .then((data) => {
        const refreshed: AuthSession = { token, user: data.user };
        storeSession(refreshed);
        setSession(refreshed);
      })
      .catch(() => {
        clearSession();
      })
      .finally(() => setLoading(false));
  }, []);

  const handleAuth = (result: AuthSession) => {
    storeSession(result);
    setSession(result);
  };

  const handleLogout = () => {
    clearSession();
    setSession(null);
  };

  return (
    <ThemeProvider>
      {loading ? (
        <div className="flex h-dvh w-full items-center justify-center bg-background">
          <span className="text-muted-foreground text-sm">Loading...</span>
        </div>
      ) : !session ? (
        <AuthForm onAuth={handleAuth} />
      ) : (
        <ChatPage session={session} onLogout={handleLogout} />
      )}
    </ThemeProvider>
  );
}
