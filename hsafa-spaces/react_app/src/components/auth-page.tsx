import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  UserPlusIcon,
  LogInIcon,
  LoaderIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

export function AuthPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, register } = useAuth();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLogin = mode === "login";

  // Show error from Google OAuth redirect
  const oauthError = searchParams.get("error");
  const errorMessage =
    error ||
    (oauthError === "token_exchange_failed"
      ? "Google sign-in failed. Please try again."
      : oauthError
        ? "Something went wrong with Google sign-in."
        : null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      if (isLogin) {
        const { verificationRequired } = await login(email, password);
        if (verificationRequired) {
          navigate("/auth/verify");
        } else {
          const redirect = searchParams.get("redirect") || "/spaces";
          navigate(redirect);
        }
      } else {
        await register(name, email, password);
        navigate("/auth/verify");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    setIsGoogleLoading(true);
    const redirect = searchParams.get("redirect");
    if (redirect) {
      localStorage.setItem("hsafa_auth_redirect", redirect);
    }
    const serverBase = import.meta.env.VITE_HSAFA_GATEWAY_URL
      ? import.meta.env.VITE_HSAFA_GATEWAY_URL.replace(/\/+$/, "")
      : "";
    window.location.href = `${serverBase}/api/auth/google`;
  };

  const inputClass = cn(
    "flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm",
    "placeholder:text-muted-foreground",
    "focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring",
    "transition-colors"
  );

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="mx-auto flex items-center justify-center">
            <img 
              src="/logo/dark-logo-spaces.svg" 
              alt="Hsafa Spaces" 
              className="h-12 w-auto dark:hidden"
            />
            <img 
              src="/logo/white-logo-spaces.svg" 
              alt="Hsafa Spaces" 
              className="h-12 w-auto hidden dark:block"
            />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {isLogin ? "Welcome back" : "Welcome to Hsafa Spaces"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isLogin
              ? "Sign in to continue to your spaces"
              : "Create an account to get started"}
          </p>
        </div>

        {/* Form Card */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          {/* Google Sign In */}
          <Button
            type="button"
            variant="outline"
            className="w-full h-10 mb-5"
            onClick={handleGoogleLogin}
            disabled={isGoogleLoading || isLoading}
          >
            {isGoogleLoading ? (
              <LoaderIcon className="size-4 animate-spin" />
            ) : (
              <svg className="size-4" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
            )}
            Continue with Google
          </Button>

          {/* Divider */}
          <div className="relative mb-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-card px-2 text-muted-foreground">or</span>
            </div>
          </div>

          {/* Email/Password Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {!isLogin && (
              <div className="space-y-2">
                <label htmlFor="name" className="text-sm font-medium text-foreground">
                  Name
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                  required={!isLogin}
                  className={inputClass}
                />
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-foreground">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="john@example.com"
                required
                className={inputClass}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-foreground">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isLogin ? "Enter your password" : "Min 6 characters"}
                required
                minLength={6}
                className={inputClass}
              />
            </div>

            {errorMessage && (
              <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {errorMessage}
              </div>
            )}

            <Button
              type="submit"
              disabled={isLoading || isGoogleLoading || !email || !password || (!isLogin && !name)}
              className="w-full h-10"
            >
              {isLoading ? (
                <LoaderIcon className="size-4 animate-spin" />
              ) : isLogin ? (
                <LogInIcon className="size-4" />
              ) : (
                <UserPlusIcon className="size-4" />
              )}
              {isLoading
                ? isLogin
                  ? "Signing in..."
                  : "Creating account..."
                : isLogin
                  ? "Sign In"
                  : "Create Account"}
            </Button>
          </form>

          <div className="mt-4 text-center text-sm text-muted-foreground">
            {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
            <button
              type="button"
              onClick={() => {
                setMode(isLogin ? "register" : "login");
                setError(null);
                setPassword("");
              }}
              className="font-medium text-primary hover:underline"
            >
              {isLogin ? "Create one" : "Sign in"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
