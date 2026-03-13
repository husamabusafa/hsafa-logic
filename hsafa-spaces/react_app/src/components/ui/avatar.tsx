import { cn } from "@/lib/utils";

interface AvatarProps {
  name: string;
  color?: string;
  size?: "sm" | "md" | "lg" | "xl";
  isOnline?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-14 text-lg",
  xl: "size-20 text-2xl",
};

export function Avatar({ name, color = "bg-primary", size = "md", isOnline, className }: AvatarProps) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className={cn("relative inline-flex shrink-0", className)}>
      <div
        className={cn(
          "flex items-center justify-center rounded-full font-semibold text-white",
          color,
          sizeClasses[size],
        )}
      >
        {initials}
      </div>
      {isOnline !== undefined && (
        <span
          className={cn(
            "absolute bottom-0 right-0 rounded-full border-2 border-background",
            size === "sm" ? "size-2.5" : size === "md" ? "size-3" : size === "lg" ? "size-3.5" : "size-4",
            isOnline ? "bg-emerald-500" : "bg-muted-foreground/40",
          )}
        />
      )}
    </div>
  );
}
