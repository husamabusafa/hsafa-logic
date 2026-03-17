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
  HaseefsGridPage,
  HaseefDetailPage,
  HaseefCreatePage,
  HaseefEditPage,
} from "@/components/haseefs-page";
import { AuthPage } from "@/components/auth-page";
import { VerifyEmailPage } from "@/components/verify-email-page";
import { AuthCallback } from "@/components/auth-callback";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { haseefsApi, spacesApi, invitationsApi, type HaseefListItem, type SmartSpace, type SpaceMember } from "@/lib/api";
import type { MockMember } from "@/lib/mock-data";
import { useSpaceChat } from "@/lib/use-space-chat";
import { cn } from "@/lib/utils";
import { ToastProvider, useToast } from "@/components/ui/toast";

// ─── Route-aware page components ────────────────────────────────────────────

function SpaceChatRoute({
  spaces,
  haseefs,
  onRefreshSpaces,
}: {
  spaces: SmartSpace[];
  haseefs: HaseefListItem[];
  onRefreshSpaces: () => Promise<void>;
}) {
  const { spaceId } = useParams<{ spaceId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [showDetails, setShowDetails] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [members, setMembers] = useState<SpaceMember[]>([]);
  const [fetchedSpace, setFetchedSpace] = useState<SmartSpace | null>(null);

  const currentEntityId = user?.entityId ?? "";

  // Try sidebar list first, then fallback to fetched space
  const sidebarSpace = spaces.find((s) => s.id === spaceId);
  const realSpace = sidebarSpace ?? fetchedSpace;

  // Fetch space from API if not in sidebar (e.g. owner viewing haseef space)
  useEffect(() => {
    if (sidebarSpace || !spaceId) return;
    spacesApi.get(spaceId).then(({ smartSpace }) => setFetchedSpace(smartSpace)).catch(() => setFetchedSpace(null));
  }, [spaceId, sidebarSpace]);

  // Fetch real members
  const fetchMembers = useCallback(async () => {
    if (!spaceId) return;
    try {
      const { members: m } = await spacesApi.listMembers(spaceId);
      setMembers(m);
    } catch {
      setMembers([]);
    }
  }, [spaceId]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  // Convert SpaceMember[] → MockMember[] (must be before hooks)
  // isOnline is set to false initially — updated below after chat hook provides real-time data
  const baseMockMembers: MockMember[] = members.map((m) => ({
    entityId: m.entityId,
    name: m.entity.displayName || "Unknown",
    type: m.entity.type,
    role: m.role,
    avatarColor: m.entity.type === "agent" ? "bg-emerald-500" : "bg-primary",
    avatarUrl: m.entity.avatarUrl || null,
    isOnline: false,
    joinedAt: m.joinedAt,
  }));

  // Real-time chat hook (must be called unconditionally — Rules of Hooks)
  const chat = useSpaceChat(spaceId, baseMockMembers);

  // Derive real online status from chat hook:
  // - Humans: online if in chat.onlineUserIds
  // - Agents: online if in chat.activeAgents (running a cycle)
  const mockMembers: MockMember[] = baseMockMembers.map((m) => ({
    ...m,
    isOnline:
      m.type === "agent"
        ? chat.activeAgents.some((a) => a.agentEntityId === m.entityId)
        : chat.onlineUserIds.includes(m.entityId),
  }));

  if (!realSpace) return <ChatEmptyState />;

  // Determine if this is a direct space (metadata or fallback heuristic)
  const isDirect = !!(realSpace.metadata as any)?.isDirect || (mockMembers.length <= 2 && mockMembers.every((m) => m.type === "human"));
  const otherMember = isDirect ? mockMembers.find((m) => m.entityId !== currentEntityId) : null;
  const displayName = isDirect && otherMember
    ? (otherMember.name || "Unknown")
    : (realSpace.name || "Unnamed Space");

  // MockSpace adapter
  const space = {
    id: realSpace.id,
    name: displayName,
    description: realSpace.description || "",
    isGroup: !isDirect,
    members: mockMembers,
    unreadCount: 0,
    lastMessage: undefined,
    createdAt: realSpace.createdAt,
    adminEntityId: "",
  };

  // Owner is not a member — they access via haseef ownership.
  // If currentEntityId is not in the members list, this is a read-only view.
  const isReadOnly = !members.some((m) => m.entityId === currentEntityId);

  // Available haseefs = user's haseefs that are NOT already members
  const memberEntityIds = new Set(members.map((m) => m.entityId));
  const availableHaseefs = haseefs
    .filter((h) => !memberEntityIds.has(h.entityId))
    .map((h) => ({ entityId: h.entityId, name: h.name }));

  // ─── Action callbacks ────────────────────────────────────────────────
  const handleDeleteSpace = async () => {
    try {
      await spacesApi.delete(realSpace.id);
      await onRefreshSpaces();
      toast("Space deleted", "success");
      navigate("/spaces");
    } catch (err: any) {
      toast(err.message || "Failed to delete space", "error");
    }
  };

  const handleLeaveSpace = async () => {
    try {
      await spacesApi.leave(realSpace.id);
      await onRefreshSpaces();
      toast("Left space", "success");
      navigate("/spaces");
    } catch (err: any) {
      toast(err.message || "Failed to leave space", "error");
    }
  };

  const handleSaveSettings = async (data: { name?: string; description?: string }) => {
    try {
      await spacesApi.update(realSpace.id, data);
      await onRefreshSpaces();
      toast("Settings saved", "success");
    } catch (err: any) {
      toast(err.message || "Failed to save settings", "error");
    }
  };

  const handleUpdateMemberRole = async (entityId: string, role: string) => {
    try {
      await spacesApi.updateMemberRole(realSpace.id, entityId, role);
      await fetchMembers();
      toast("Role updated", "success");
    } catch (err: any) {
      toast(err.message || "Failed to update role", "error");
    }
  };

  const handleRemoveMember = async (entityId: string) => {
    try {
      await spacesApi.removeMember(realSpace.id, entityId);
      await fetchMembers();
      toast("Member removed", "success");
    } catch (err: any) {
      toast(err.message || "Failed to remove member", "error");
    }
  };

  const handleAddMember = async (entityId: string) => {
    try {
      await spacesApi.addMember(realSpace.id, entityId);
      await fetchMembers();
      toast("Member added", "success");
    } catch (err: any) {
      toast(err.message || "Failed to add member", "error");
    }
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
            messages={chat.messages}
            currentEntityId={currentEntityId}
            typingUsers={chat.typingUsers}
            activeAgents={chat.activeAgents}
            onlineUserIds={chat.onlineUserIds}
            seenWatermarks={chat.seenWatermarks}
            isLoading={chat.isLoading}
            readOnly={isReadOnly}
            onSendMessage={chat.sendMessage}
            onSendMediaMessage={chat.sendMediaMessage}
            onTyping={chat.sendTyping}
            onMarkSeen={chat.markSeen}
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
              onDeleteSpace={handleDeleteSpace}
              onLeaveSpace={handleLeaveSpace}
              currentEntityId={currentEntityId}
              onSaveSettings={handleSaveSettings}
              onUpdateMemberRole={handleUpdateMemberRole}
              onRemoveMember={handleRemoveMember}
              onAddMember={handleAddMember}
              availableHaseefs={availableHaseefs}
            />
          </aside>
        )}
      </div>
      <InviteDialog
        open={showInvite}
        onClose={() => setShowInvite(false)}
        spaceId={realSpace.id}
        spaceName={space.name}
        memberEntityIds={memberEntityIds}
        availableHaseefs={availableHaseefs}
        onMembersChanged={fetchMembers}
      />
    </>
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
  const { logout, user } = useAuth();
  const { toast } = useToast();
  const currentEntityId = user?.entityId ?? "";
  const [sidebarOpen, setSidebarOpen] = useState(() => !location.pathname.startsWith("/invitations"));
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [showCreateSpace, setShowCreateSpace] = useState(false);
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

  const handlePageChange = useCallback((page: AppPage) => {
    setShowProfile(false);
    if (page === "invitations") {
      navigate("/invitations");
      setSidebarOpen(false);
      setMobileSidebarOpen(false);
      return;
    }
    if (page === "haseefs") {
      navigate("/haseefs");
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
        currentEntityId={currentEntityId}
        onSelectSpace={(id) => {
          navigate(`/spaces/${id}`);
          setMobileSidebarOpen(false);
        }}
        onCreateSpace={() => setShowCreateSpace(true)}
        isLoading={spacesLoading}
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
        <div className="relative h-full">
          <Routes>
            {/* Spaces */}
            <Route path="/spaces" element={<ChatEmptyState />} />
            <Route path="/spaces/:spaceId" element={<SpaceChatRoute spaces={spaces} haseefs={haseefs} onRefreshSpaces={fetchSpaces} />} />

            {/* Haseefs */}
            <Route path="/haseefs" element={<HaseefsGridPage haseefs={haseefs} isLoading={haseefsLoading} />} />
            <Route path="/haseefs/new" element={<HaseefCreatePage onCreated={fetchHaseefs} />} />
            <Route path="/haseefs/:haseefId" element={<HaseefDetailPage onDeleted={fetchHaseefs} allHaseefs={haseefs} />} />
            <Route path="/haseefs/:haseefId/edit" element={<HaseefEditPage onSaved={fetchHaseefs} />} />

            {/* Invitations */}
            <Route path="/invitations" element={<InvitationsPage />} />

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/spaces" replace />} />
          </Routes>

          {showProfile && (
            <>
              <div
                className="fixed inset-0 z-40 bg-black/20 md:absolute"
                onClick={() => setShowProfile(false)}
              />
              <aside className="fixed inset-y-0 right-0 z-50 w-full bg-card md:absolute md:w-[340px] md:border-l md:border-border md:shadow-xl">
                <UserProfile onClose={() => setShowProfile(false)} />
              </aside>
            </>
          )}
        </div>
      </AppShell>

      {/* Dialogs */}
      <CreateSpaceDialog
        open={showCreateSpace}
        onClose={() => setShowCreateSpace(false)}
        onCreate={async (data) => {
          try {
            const { smartSpace } = await spacesApi.create({
              name: data.name,
              description: data.description || undefined,
              memberEntityIds: data.memberEntityIds.length > 0 ? data.memberEntityIds : undefined,
              isGroup: data.isGroup,
            });
            // Send email invitations for humans (fire-and-forget, non-blocking)
            if (data.inviteEmails && data.inviteEmails.length > 0) {
              for (const email of data.inviteEmails) {
                invitationsApi.createForSpace(smartSpace.id, { email, role: "member" }).catch((err) => {
                  console.warn("Failed to send invitation to", email, err);
                });
              }
            }
            await fetchSpaces();
            toast("Space created", "success");
            navigate(`/spaces/${smartSpace.id}`);
            setMobileSidebarOpen(false);
          } catch (err: any) {
            toast(err.message || "Failed to create space", "error");
          }
        }}
      />

    </>
  );
}

// ─── Root App ────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
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
      </ToastProvider>
    </ThemeProvider>
  );
}
