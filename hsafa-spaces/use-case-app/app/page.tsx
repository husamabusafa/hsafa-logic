"use client";

import { useState, useEffect } from "react";
import { AuthForm, type AuthSession } from "@/components/register-form";
import { ChatPage } from "@/components/chat-page";

const TOKEN_KEY = "hsafa-usecase-token";
const SESSION_KEY = "hsafa-usecase-session";

function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

function getStoredSession(): AuthSession | null {
  if (typeof window === "undefined") return null;
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

export default function Home() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);

  // On mount, verify stored token with /api/me
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
        // Refresh session with latest user data from DB
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

  if (loading) {
    return (
      <div className="flex h-dvh w-full items-center justify-center bg-background">
        <span className="text-muted-foreground text-sm">Loading...</span>
      </div>
    );
  }

  if (!session) {
    return <AuthForm onAuth={handleAuth} />;
  }

  return <ChatPage session={session} onLogout={handleLogout} />;
}
