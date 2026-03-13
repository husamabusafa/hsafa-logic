import { useState, useCallback, useMemo, useEffect } from "react";
import { Routes, Route, Navigate, useParams, useNavigate, useLocation } from "react-router-dom";
import { LoaderIcon } from "lucide-react";
import { ThemeProvider } from "@/components/theme-provider";
import { AppShell, type AppPage } from "@/components/app-shell";
import { SpacesSidebar } from "@/components/spaces-sidebar";
import { ChatView, ChatEmptyState } from "@/components/chat-view";
import { SpaceDetails } from "@/components/space-details";
import { UserProfile } from "@/components/user-profile";
import { CreateSpaceDialog } from "@/components/create-space-dialog";
import { InviteDialog } from "@/components/invite-dialog";
import { InvitationsPage } from "@/components/invitations-page";
import {
  HaseefsSidebar,
  HaseefDetail,
  HaseefEmptyState,
  CreateHaseefDialog,
} from "@/components/haseefs-page";
import { AuthPage } from "@/components/auth-page";
import { VerifyEmailPage } from "@/components/verify-email-page";
import { AuthCallback } from "@/components/auth-callback";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { mockSpaces } from "@/lib/mock-data";
import { haseefsApi, spacesApi, invitationsApi, type HaseefListItem, type SmartSpace } from "@/lib/api";
import { cn } from "@/lib/utils";

// ─── Route-aware page components ────────────────────────────────────────────

function SpaceChatRoute({ spaces }: { spaces: SmartSpace[] }) {
  const { spaceId } = useParams<{ spaceId: string }>();
  const navigate = useNavigate();
  const [showDetails, setShowDetails] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  const realSpace = spaces.find((s) => s.id === spaceId);
  if (!realSpace) return <ChatEmptyState />;

  // Temporary adapter: convert SmartSpace to MockSpace format for ChatView
  // TODO Phase 5: Rewrite ChatView to use real API
  const space = {
    id: realSpace.id,
    name: realSpace.name || "Unnamed Space",
    description: realSpace.description || "",
    isGroup: true,
    members: [],
    unreadCount: 0,
    lastMessage: undefined,
    createdAt: realSpace.createdAt,
    adminEntityId: "",
  };

  return (
    <>
      <div className="flex h-full overflow-hidden">
        {/* Chat — hidden on mobile when details open */}
        <div className={cn(
          "flex-1 min-w-0 flex flex-col",
          showDetails && "hidden md:flex",
        )}>
          <ChatView
            space={space}
            onToggleDetails={() => setShowDetails((v) => !v)}
            onBack={() => navigate("/spaces")}
            showSearch={showSearch}
            onSearchClose={() => setShowSearch(false)}
          />
        </div>

        {/* Space Details — full screen on mobile, side panel on desktop */}
        {showDetails && (
          <aside className="w-full md:w-[340px] md:border-l border-border bg-card md:shrink-0 overflow-y-auto">
            <SpaceDetails
              space={space}
              onClose={() => setShowDetails(false)}
              onInvite={() => setShowInvite(true)}
              onSearchClick={() => setShowSearch(true)}
            />
          </aside>
        )}
      </div>
      <InviteDialog
        open={showInvite}
        onClose={() => setShowInvite(false)}
        space={space}
      />
    </>
  );
}

function HaseefDetailRoute({ onDeleted }: { onDeleted: () => void }) {
  const { haseefId } = useParams<{ haseefId: string }>();
  const navigate = useNavigate();

  if (!haseefId) return <HaseefEmptyState onCreate={() => navigate("/haseefs")} />;
  return (
    <HaseefDetail
      haseefId={haseefId}
      onDeleted={() => {
        onDeleted();
        navigate("/haseefs");
      }}
    />
  );
}

// ─── Auth Guard ─────────────────────────────────────────────────────────────

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <LoaderIcon className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  // If email not verified, redirect to verification
  if (user && !user.emailVerified) {
    return <Navigate to="/auth/verify" replace />;
  }

  return <>{children}</>;
}

function RequireUnauth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <LoaderIcon className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/spaces" replace />;
  }

  return <>{children}</>;
}

// ─── Main App Content (authenticated) ────────────────────────────────────────

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [showCreateSpace, setShowCreateSpace] = useState(false);
  const [showCreateHaseef, setShowCreateHaseef] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  // ── Haseefs state ──
  const [haseefs, setHaseefs] = useState<HaseefListItem[]>([]);
  const [haseefsLoading, setHaseefsLoading] = useState(false);

  const fetchHaseefs = useCallback(async () => {
    setHaseefsLoading(true);
    try {
      const { haseefs: list } = await haseefsApi.list();
      setHaseefs(list);
    } catch (err) {
      console.error("Failed to fetch haseefs:", err);
    } finally {
      setHaseefsLoading(false);
    }
  }, []);

  // ── Spaces state ──
  const [spaces, setSpaces] = useState<SmartSpace[]>([]);
  const [spacesLoading, setSpacesLoading] = useState(false);

  const fetchSpaces = useCallback(async () => {
    setSpacesLoading(true);
    try {
      const { smartSpaces } = await spacesApi.list();
      setSpaces(smartSpaces);
    } catch (err) {
      console.error("Failed to fetch spaces:", err);
    } finally {
      setSpacesLoading(false);
    }
  }, []);

  // ── Invitations count ──
  const [pendingInvitations, setPendingInvitations] = useState(0);

  const fetchInvitationsCount = useCallback(async () => {
    try {
      const { invitations } = await invitationsApi.listMine("pending");
      setPendingInvitations(invitations.length);
    } catch {
      // non-fatal
    }
  }, []);

  useEffect(() => {
    fetchHaseefs();
    fetchSpaces();
    fetchInvitationsCount();
  }, [fetchHaseefs, fetchSpaces, fetchInvitationsCount]);

  // Derive active page from URL
  const activePage: AppPage = useMemo(() => {
    if (location.pathname.startsWith("/haseefs")) return "haseefs";
    if (location.pathname.startsWith("/invitations")) return "invitations";
    return "spaces";
  }, [location.pathname]);

  // Derive selected IDs from URL
  const selectedSpaceId = useMemo(() => {
    const match = location.pathname.match(/^\/spaces\/([^/]+)/);
    return match ? match[1] : null;
  }, [location.pathname]);

  const selectedHaseefId = useMemo(() => {
    const match = location.pathname.match(/^\/haseefs\/([^/]+)/);
    return match && match[1] !== "new" ? match[1] : null;
  }, [location.pathname]);

  const handlePageChange = useCallback((page: AppPage) => {
    setShowProfile(false);
    if (page === "invitations") {
      navigate("/invitations");
      setSidebarOpen(false);
      setMobileSidebarOpen(false);
      return;
    }
    // On mobile, tapping the same page opens the sidebar drawer
    if (page === activePage) {
      setSidebarOpen((v) => !v);
      setMobileSidebarOpen((v) => !v);
    } else {
      navigate(`/${page}`);
      setSidebarOpen(true);
      setMobileSidebarOpen(true);
    }
  }, [activePage, navigate]);

  const handleLogout = useCallback(() => {
    logout();
    navigate("/auth");
  }, [logout, navigate]);

  // ── Sidebar content based on active page ──
  const sidebar =
    activePage === "spaces" ? (
      <SpacesSidebar
        spaces={spaces}
        selectedSpaceId={selectedSpaceId}
        onSelectSpace={(id) => {
          navigate(`/spaces/${id}`);
          setMobileSidebarOpen(false);
        }}
        onCreateSpace={() => setShowCreateSpace(true)}
        isLoading={spacesLoading}
      />
    ) : activePage === "haseefs" ? (
      <HaseefsSidebar
        haseefs={haseefs}
        selectedId={selectedHaseefId}
        onSelect={(id) => {
          navigate(`/haseefs/${id}`);
          setMobileSidebarOpen(false);
        }}
        onCreate={() => setShowCreateHaseef(true)}
        isLoading={haseefsLoading}
      />
    ) : null;

  return (
    <>
      <AppShell
        activePage={activePage}
        onPageChange={handlePageChange}
        sidebarOpen={sidebarOpen}
        sidebar={sidebar}
        onLogout={handleLogout}
        onOpenProfile={() => { setShowProfile(true); setMobileSidebarOpen(false); }}
        invitationCount={pendingInvitations}
        mobileSidebarOpen={mobileSidebarOpen}
        onMobileSidebarClose={() => setMobileSidebarOpen(false)}
      >
        {/* Profile Panel — full-screen overlay on mobile, side panel on desktop */}
        {showProfile ? (
          <div className="flex h-full">
            <div className="hidden md:flex md:flex-1 min-w-0">
              <Routes>
                <Route path="/spaces" element={<ChatEmptyState />} />
                <Route path="/spaces/:spaceId" element={<SpaceChatRoute spaces={spaces} />} />
                <Route path="/haseefs" element={<HaseefEmptyState onCreate={() => setShowCreateHaseef(true)} />} />
                <Route path="/haseefs/:haseefId" element={<HaseefDetailRoute onDeleted={fetchHaseefs} />} />
                <Route path="/invitations" element={<InvitationsPage />} />
                <Route path="*" element={<Navigate to="/spaces" replace />} />
              </Routes>
            </div>
            <aside className="w-full md:w-[340px] md:border-l border-border bg-card md:shrink-0 h-full">
              <UserProfile onClose={() => setShowProfile(false)} />
            </aside>
          </div>
        ) : (
          <Routes>
            {/* Spaces */}
            <Route path="/spaces" element={<ChatEmptyState />} />
            <Route path="/spaces/:spaceId" element={<SpaceChatRoute spaces={spaces} />} />

            {/* Haseefs */}
            <Route path="/haseefs" element={<HaseefEmptyState onCreate={() => setShowCreateHaseef(true)} />} />
            <Route path="/haseefs/:haseefId" element={<HaseefDetailRoute onDeleted={fetchHaseefs} />} />

            {/* Invitations */}
            <Route path="/invitations" element={<InvitationsPage />} />

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/spaces" replace />} />
          </Routes>
        )}
      </AppShell>

      {/* Dialogs */}
      <CreateSpaceDialog
        open={showCreateSpace}
        onClose={() => setShowCreateSpace(false)}
        onCreate={async (data) => {
          const { smartSpace } = await spacesApi.create(data.name);
          await fetchSpaces();
          navigate(`/spaces/${smartSpace.id}`);
        }}
      />

      <CreateHaseefDialog
        open={showCreateHaseef}
        onClose={() => setShowCreateHaseef(false)}
        onCreate={async (data) => {
          await haseefsApi.create({
            name: data.name,
            description: data.description || undefined,
            instructions: data.instructions || undefined,
          });
          await fetchHaseefs();
        }}
      />
    </>
  );
}

// ─── Root App ────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Routes>
          {/* Auth routes (public) */}
          <Route path="/auth" element={<RequireUnauth><AuthPage /></RequireUnauth>} />
          <Route path="/auth/verify" element={<VerifyEmailPage />} />
          <Route path="/auth/callback" element={<AuthCallback />} />

          {/* Protected routes */}
          <Route path="/*" element={<RequireAuth><AppContent /></RequireAuth>} />
        </Routes>
      </AuthProvider>
    </ThemeProvider>
  );
}
