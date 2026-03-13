import { useState, useEffect, createContext, useContext, useCallback } from "react";
import { XIcon, CheckCircleIcon, AlertCircleIcon, InfoIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastVariant = "success" | "error" | "info";

interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, variant: ToastVariant = "info") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, message, variant }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      {/* Toast container */}
      <div className="fixed bottom-4 right-4 z-100 flex flex-col gap-2 max-w-sm">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => removeToast(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setIsVisible(true));
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onDismiss, 200);
    }, 4000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const Icon = toast.variant === "success"
    ? CheckCircleIcon
    : toast.variant === "error"
    ? AlertCircleIcon
    : InfoIcon;

  const iconColor = toast.variant === "success"
    ? "text-emerald-500"
    : toast.variant === "error"
    ? "text-destructive"
    : "text-primary";

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border border-border bg-popover px-4 py-3 shadow-lg transition-all duration-200",
        isVisible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
      )}
    >
      <Icon className={cn("size-5 shrink-0 mt-0.5", iconColor)} />
      <p className="text-sm text-foreground flex-1 leading-relaxed">{toast.message}</p>
      <button
        onClick={() => { setIsVisible(false); setTimeout(onDismiss, 200); }}
        className="shrink-0 p-0.5 rounded hover:bg-muted transition-colors"
      >
        <XIcon className="size-3.5 text-muted-foreground" />
      </button>
    </div>
  );
}
