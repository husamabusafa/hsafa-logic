import { useState, useCallback, useMemo } from "react";
import { Routes, Route, Navigate, useParams, useNavigate, useLocation } from "react-router-dom";
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
import { mockSpaces, mockHaseefs, mockInvitations } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

// ─── Route-aware page components ────────────────────────────────────────────

function SpaceChatRoute() {
  const { spaceId } = useParams<{ spaceId: string }>();
  const navigate = useNavigate();
  const [showDetails, setShowDetails] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  const space = mockSpaces.find((s) => s.id === spaceId) || null;
  if (!space) return <ChatEmptyState />;

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

function HaseefDetailRoute() {
  const { haseefId } = useParams<{ haseefId: string }>();
  const navigate = useNavigate();
  const haseef = mockHaseefs.find((h) => h.id === haseefId) || null;

  if (!haseef) return <HaseefEmptyState onCreate={() => navigate("/haseefs/new")} />;
  return <HaseefDetail haseef={haseef} />;
}

// ─── Main App ───────────────────────────────────────────────────────────────

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [showCreateSpace, setShowCreateSpace] = useState(false);
  const [showCreateHaseef, setShowCreateHaseef] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  const pendingInvitations = mockInvitations.filter((i) => i.status === "pending").length;

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
    alert("Logout clicked (mock)");
  }, []);

  // ── Sidebar content based on active page ──
  const sidebar =
    activePage === "spaces" ? (
      <SpacesSidebar
        spaces={mockSpaces}
        selectedSpaceId={selectedSpaceId}
        onSelectSpace={(id) => {
          navigate(`/spaces/${id}`);
          setMobileSidebarOpen(false);
        }}
        onCreateSpace={() => setShowCreateSpace(true)}
      />
    ) : activePage === "haseefs" ? (
      <HaseefsSidebar
        haseefs={mockHaseefs}
        selectedId={selectedHaseefId}
        onSelect={(id) => {
          navigate(`/haseefs/${id}`);
          setMobileSidebarOpen(false);
        }}
        onCreate={() => setShowCreateHaseef(true)}
      />
    ) : null;

  return (
    <ThemeProvider>
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
                <Route path="/" element={<Navigate to="/spaces" replace />} />
                <Route path="/spaces" element={<ChatEmptyState />} />
                <Route path="/spaces/:spaceId" element={<SpaceChatRoute />} />
                <Route path="/haseefs" element={<HaseefEmptyState onCreate={() => setShowCreateHaseef(true)} />} />
                <Route path="/haseefs/:haseefId" element={<HaseefDetailRoute />} />
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
            <Route path="/" element={<Navigate to="/spaces" replace />} />

            {/* Spaces */}
            <Route path="/spaces" element={<ChatEmptyState />} />
            <Route path="/spaces/:spaceId" element={<SpaceChatRoute />} />

            {/* Haseefs */}
            <Route path="/haseefs" element={<HaseefEmptyState onCreate={() => setShowCreateHaseef(true)} />} />
            <Route path="/haseefs/:haseefId" element={<HaseefDetailRoute />} />

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
        onCreate={(data) => {
          console.log("Create space:", data);
          setShowCreateSpace(false);
        }}
      />

      <CreateHaseefDialog
        open={showCreateHaseef}
        onClose={() => setShowCreateHaseef(false)}
        onCreate={(data) => {
          console.log("Create haseef:", data);
          setShowCreateHaseef(false);
        }}
      />
    </ThemeProvider>
  );
}
