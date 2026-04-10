import { type ReactNode, useState } from "react";
import {
  MessageSquareIcon,
  BotIcon,
  MailIcon,
  LogOutIcon,
  UserIcon,
  XIcon,
  KeyRoundIcon,
  UsersIcon,
  ZapIcon,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

export type AppPage = "spaces" | "haseefs" | "skills" | "bases" | "invitations" | "api-keys";

interface AppShellProps {
  activePage: AppPage;
  onPageChange: (page: AppPage) => void;
  sidebarOpen: boolean;
  sidebar: ReactNode;
  children: ReactNode;
  onLogout: () => void;
  onOpenProfile: () => void;
  invitationCount?: number;
  mobileSidebarOpen?: boolean;
  onMobileSidebarClose?: () => void;
}

const navItems: { page: AppPage; icon: typeof MessageSquareIcon; label: string }[] = [
  { page: "spaces", icon: MessageSquareIcon, label: "Spaces" },
  { page: "haseefs", icon: BotIcon, label: "Haseefs" },
  { page: "skills", icon: ZapIcon, label: "Skills" },
  { page: "bases", icon: UsersIcon, label: "Bases" },
  { page: "invitations", icon: MailIcon, label: "Invites" },
  { page: "api-keys", icon: KeyRoundIcon, label: "API Keys" },
];

export function AppShell({
  activePage,
  onPageChange,
  sidebarOpen,
  sidebar,
  children,
  onLogout,
  onOpenProfile,
  invitationCount,
  mobileSidebarOpen,
  onMobileSidebarClose,
}: AppShellProps) {
  const [showMobileMore, setShowMobileMore] = useState(false);

  return (
    <div className="flex h-dvh w-full bg-background overflow-hidden">
      {/* Navigation Rail — thin left strip (desktop) */}
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
            {item.page === "invitations" && invitationCount !== undefined && invitationCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                {invitationCount > 99 ? '99+' : invitationCount}
              </span>
            )}
          </button>
        ))}

        <div className="flex-1" />

        <button
          onClick={onOpenProfile}
          className="flex items-center justify-center w-12 h-12 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title="Your Profile"
        >
          <UserIcon className="size-5" />
        </button>

        <ThemeToggle />

        <button
          onClick={onLogout}
          className="flex items-center justify-center w-12 h-12 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title="Logout"
        >
          <LogOutIcon className="size-5" />
        </button>
      </nav>

      {/* Desktop sidebar panel */}
      {activePage === "spaces" && (
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
      )}

      {/* Mobile sidebar drawer overlay */}
      {mobileSidebarOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/40" onClick={onMobileSidebarClose} />
          <div className="relative w-[300px] max-w-[85vw] h-full bg-card border-r border-border flex flex-col animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between px-4 h-14 shrink-0 border-b border-border">
              <span className="text-sm font-semibold capitalize">{activePage}</span>
              <button onClick={onMobileSidebarClose} className="p-1 rounded-lg hover:bg-muted transition-colors">
                <XIcon className="size-4 text-muted-foreground" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden flex flex-col">
              {sidebar}
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden pb-14 md:pb-0">
        {children}
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 flex items-center border-t border-border bg-card/95 backdrop-blur-sm h-14 z-40">
        {navItems.map((item) => (
          <button
            key={item.page}
            onClick={() => onPageChange(item.page)}
            className={cn(
              "relative flex flex-col items-center justify-center flex-1 h-full transition-colors",
              activePage === item.page
                ? "text-primary"
                : "text-muted-foreground",
            )}
          >
            <item.icon className="size-5" />
            <span className="text-[10px] font-medium mt-0.5">{item.label}</span>
            {item.page === "invitations" && invitationCount !== undefined && invitationCount > 0 && (
              <span className="absolute top-1.5 right-[calc(50%-16px)] min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center translate-x-1/2">
                {invitationCount > 99 ? '99+' : invitationCount}
              </span>
            )}
          </button>
        ))}

        {/* Profile button on mobile */}
        <button
          onClick={onOpenProfile}
          className="flex flex-col items-center justify-center flex-1 h-full text-muted-foreground transition-colors"
        >
          <UserIcon className="size-5" />
          <span className="text-[10px] font-medium mt-0.5">Profile</span>
        </button>
      </nav>

      {/* Mobile "more" popup */}
      {showMobileMore && (
        <>
          <div className="md:hidden fixed inset-0 z-50" onClick={() => setShowMobileMore(false)} />
          <div className="md:hidden fixed bottom-16 right-2 z-50 w-44 bg-popover border border-border rounded-xl shadow-lg py-1.5">
            <button
              onClick={() => { setShowMobileMore(false); onOpenProfile(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-muted transition-colors text-left"
            >
              <UserIcon className="size-4 text-muted-foreground" />
              <span className="text-sm">Your Profile</span>
            </button>
            <button
              onClick={() => { setShowMobileMore(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-muted transition-colors text-left"
            >
              <ThemeToggle />
              <span className="text-sm">Toggle Theme</span>
            </button>
            <div className="border-t border-border my-1" />
            <button
              onClick={() => { setShowMobileMore(false); onLogout(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-muted transition-colors text-left text-red-500"
            >
              <LogOutIcon className="size-4" />
              <span className="text-sm">Logout</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
