"use client";

import { useState, useEffect } from "react";
import { AuthForm, type RegisterResult } from "@/components/register-form";
import { ChatPage } from "@/components/chat-page";

const SESSION_KEY = "hsafa-usecase-session";

function getStoredSession(): RegisterResult | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as RegisterResult;
  } catch {
    return null;
  }
}

function storeSession(session: RegisterResult) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export default function Home() {
  const [session, setSession] = useState<RegisterResult | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setSession(getStoredSession());
  }, []);

  const handleRegister = (result: RegisterResult) => {
    storeSession(result);
    setSession(result);
  };

  const handleLogout = () => {
    clearSession();
    setSession(null);
  };

  if (!mounted) {
    return (
      <div className="flex h-dvh w-full items-center justify-center bg-background">
        <span className="text-muted-foreground text-sm">Loading...</span>
      </div>
    );
  }

  if (!session) {
    return <AuthForm onAuth={handleRegister} />;
  }

  return <ChatPage session={session} onLogout={handleLogout} />;
}
