import { type ReactNode } from "react";
import {
  MessageSquareIcon,
  BotIcon,
  MailIcon,
  LogOutIcon,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

export type AppPage = "spaces" | "haseefs" | "invitations";

interface AppShellProps {
  activePage: AppPage;
  onPageChange: (page: AppPage) => void;
  sidebarOpen: boolean;
  sidebar: ReactNode;
  children: ReactNode;
  onLogout: () => void;
  invitationCount?: number;
}

const navItems: { page: AppPage; icon: typeof MessageSquareIcon; label: string }[] = [
  { page: "spaces", icon: MessageSquareIcon, label: "Spaces" },
  { page: "haseefs", icon: BotIcon, label: "Haseefs" },
  { page: "invitations", icon: MailIcon, label: "Invites" },
];

export function AppShell({ activePage, onPageChange, sidebarOpen, sidebar, children, onLogout, invitationCount }: AppShellProps) {
  return (
    <div className="flex h-dvh w-full bg-background overflow-hidden">
      {/* Navigation Rail — thin left strip */}
      <nav className="hidden md:flex w-16 flex-col items-center border-r border-border bg-muted/30 py-4 gap-1">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold text-sm mb-4">
          H
        </div>

        {navItems.map((item) => (
          <button
            key={item.page}
            onClick={() => onPageChange(item.page)}
            className={cn(
              "relative flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-colors",
              activePage === item.page
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            title={item.label}
          >
            <item.icon className="size-5" />
            <span className="text-[9px] font-medium mt-0.5">{item.label}</span>
            {item.page === "invitations" && invitationCount && invitationCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 size-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                {invitationCount}
              </span>
            )}
          </button>
        ))}

        <div className="flex-1" />

        <ThemeToggle />

        <button
          onClick={onLogout}
          className="flex items-center justify-center w-12 h-12 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title="Logout"
        >
          <LogOutIcon className="size-5" />
        </button>
      </nav>

      {/* Sidebar panel */}
      <aside
        className={cn(
          "hidden md:flex flex-col border-r border-border bg-card transition-all duration-200 overflow-hidden",
          sidebarOpen ? "w-[320px]" : "w-0 border-r-0",
        )}
      >
        <div className="w-[320px] h-full flex flex-col">
          {sidebar}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {children}
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 flex items-center justify-around border-t border-border bg-card h-14 z-40">
        {navItems.map((item) => (
          <button
            key={item.page}
            onClick={() => onPageChange(item.page)}
            className={cn(
              "flex flex-col items-center justify-center flex-1 h-full transition-colors",
              activePage === item.page
                ? "text-primary"
                : "text-muted-foreground",
            )}
          >
            <item.icon className="size-5" />
            <span className="text-[10px] font-medium mt-0.5">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
