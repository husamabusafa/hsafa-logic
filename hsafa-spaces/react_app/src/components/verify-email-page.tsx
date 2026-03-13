import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { MailIcon, LoaderIcon, CheckCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

export function VerifyEmailPage() {
  const navigate = useNavigate();
  const { user, verifyEmail, resendCode } = useAuth();

  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Redirect if already verified
  useEffect(() => {
    if (user?.emailVerified) {
      navigate("/spaces", { replace: true });
    }
  }, [user, navigate]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const newDigits = [...digits];

    if (value.length > 1) {
      // Pasted code
      const pasted = value.slice(0, 6).split("");
      for (let i = 0; i < 6; i++) {
        newDigits[i] = pasted[i] || "";
      }
      setDigits(newDigits);
      const lastFilled = Math.min(pasted.length - 1, 5);
      inputRefs.current[lastFilled]?.focus();

      // Auto-submit if full
      if (pasted.length >= 6) {
        handleSubmit(newDigits.join(""));
      }
      return;
    }

    newDigits[index] = value;
    setDigits(newDigits);

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 6 digits filled
    if (value && newDigits.every((d) => d)) {
      handleSubmit(newDigits.join(""));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleSubmit = async (code?: string) => {
    const finalCode = code || digits.join("");
    if (finalCode.length !== 6) return;

    setError(null);
    setIsLoading(true);

    try {
      await verifyEmail(finalCode);
      setSuccess(true);
      setTimeout(() => navigate("/spaces", { replace: true }), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
      setDigits(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setIsResending(true);
    setError(null);

    try {
      await resendCode();
      setResendCooldown(60);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resend code");
    } finally {
      setIsResending(false);
    }
  };

  if (success) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background p-4">
        <div className="text-center space-y-4">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-green-500/10 text-green-500">
            <CheckCircleIcon className="size-7" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Email verified!
          </h1>
          <p className="text-sm text-muted-foreground">Redirecting to your spaces...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-3">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <MailIcon className="size-7" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Check your email
          </h1>
          <p className="text-sm text-muted-foreground">
            We sent a 6-digit code to{" "}
            <span className="font-medium text-foreground">{user?.email}</span>
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
            className="space-y-5"
          >
            {/* 6-digit code input */}
            <div className="flex justify-center gap-2">
              {digits.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => { inputRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={digit}
                  onChange={(e) => handleChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  disabled={isLoading}
                  className={cn(
                    "size-12 rounded-lg border border-input bg-background text-center text-lg font-semibold",
                    "focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring",
                    "transition-colors",
                    "disabled:opacity-50"
                  )}
                />
              ))}
            </div>

            {error && (
              <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive text-center">
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={isLoading || digits.some((d) => !d)}
              className="w-full h-10"
            >
              {isLoading && <LoaderIcon className="size-4 animate-spin" />}
              {isLoading ? "Verifying..." : "Verify Email"}
            </Button>
          </form>

          <div className="mt-4 text-center text-sm text-muted-foreground">
            Didn't receive the code?{" "}
            <button
              type="button"
              onClick={handleResend}
              disabled={isResending || resendCooldown > 0}
              className="font-medium text-primary hover:underline disabled:opacity-50 disabled:no-underline"
            >
              {isResending
                ? "Sending..."
                : resendCooldown > 0
                  ? `Resend in ${resendCooldown}s`
                  : "Resend code"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
