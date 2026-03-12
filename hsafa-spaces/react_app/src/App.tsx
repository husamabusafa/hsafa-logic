import { useState, useCallback, useMemo } from "react";
import { Routes, Route, Navigate, useParams, useNavigate, useLocation } from "react-router-dom";
import { ThemeProvider } from "@/components/theme-provider";
import { AppShell, type AppPage } from "@/components/app-shell";
import { SpacesSidebar } from "@/components/spaces-sidebar";
import { ChatView, ChatEmptyState } from "@/components/chat-view";
import { SpaceDetails } from "@/components/space-details";
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

  const space = mockSpaces.find((s) => s.id === spaceId) || null;
  if (!space) return <ChatEmptyState />;

  return (
    <>
      <div className="flex h-full">
        <div className={cn(
          "flex-1 min-w-0 transition-all",
          showDetails && "hidden md:flex md:flex-col",
        )}>
          <ChatView
            space={space}
            onToggleDetails={() => setShowDetails((v) => !v)}
            onBack={() => navigate("/spaces")}
          />
        </div>
        {showDetails && (
          <aside className="w-full md:w-[340px] border-l border-border bg-card shrink-0">
            <SpaceDetails
              space={space}
              onClose={() => setShowDetails(false)}
              onInvite={() => setShowInvite(true)}
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
  const [showCreateSpace, setShowCreateSpace] = useState(false);
  const [showCreateHaseef, setShowCreateHaseef] = useState(false);

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
    if (page === "invitations") {
      navigate("/invitations");
      setSidebarOpen(false);
      return;
    }
    if (page === activePage) {
      setSidebarOpen((v) => !v);
    } else {
      navigate(`/${page}`);
      setSidebarOpen(true);
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
        onSelectSpace={(id) => navigate(`/spaces/${id}`)}
        onCreateSpace={() => setShowCreateSpace(true)}
      />
    ) : activePage === "haseefs" ? (
      <HaseefsSidebar
        haseefs={mockHaseefs}
        selectedId={selectedHaseefId}
        onSelect={(id) => navigate(`/haseefs/${id}`)}
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
        invitationCount={pendingInvitations}
      >
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
