
import { createContext, useContext, type ReactNode } from "react";
import type { Entity, ActiveAgent, OnlineUser, TypingUser, SeenWatermarks } from "../hsafa-react";

// Members Context
interface MembersContextValue {
  membersById: Record<string, Entity>;
  currentEntityId: string;
}

const MembersContext = createContext<MembersContextValue>({
  membersById: {},
  currentEntityId: "",
});

export function MembersProvider({
  children,
  membersById,
  currentEntityId,
}: {
  children: ReactNode;
  membersById: Record<string, Entity>;
  currentEntityId: string;
}) {
  return (
    <MembersContext.Provider value={{ membersById, currentEntityId }}>
      {children}
    </MembersContext.Provider>
  );
}

export function useMembers() {
  return useContext(MembersContext);
}

// Active Agents Context
const ActiveAgentsContext = createContext<ActiveAgent[]>([]);

export function ActiveAgentsProvider({
  children,
  activeAgents,
}: {
  children: ReactNode;
  activeAgents: ActiveAgent[];
}) {
  return (
    <ActiveAgentsContext.Provider value={activeAgents}>
      {children}
    </ActiveAgentsContext.Provider>
  );
}

export function useActiveAgents(): ActiveAgent[] {
  return useContext(ActiveAgentsContext);
}

// Current Space Context
interface CurrentSpaceValue {
  spaceId: string | null;
  spaceName: string | null;
}

const CurrentSpaceContext = createContext<CurrentSpaceValue>({
  spaceId: null,
  spaceName: null,
});

export function CurrentSpaceProvider({
  children,
  spaceId,
  spaceName,
}: {
  children: ReactNode;
  spaceId: string | null;
  spaceName: string | null;
}) {
  return (
    <CurrentSpaceContext.Provider value={{ spaceId, spaceName }}>
      {children}
    </CurrentSpaceContext.Provider>
  );
}

export function useCurrentSpace(): CurrentSpaceValue {
  return useContext(CurrentSpaceContext);
}

// Online Users Context
const OnlineUsersContext = createContext<OnlineUser[]>([]);

export function OnlineUsersProvider({
  children,
  onlineUsers,
}: {
  children: ReactNode;
  onlineUsers: OnlineUser[];
}) {
  return (
    <OnlineUsersContext.Provider value={onlineUsers}>
      {children}
    </OnlineUsersContext.Provider>
  );
}

export function useOnlineUsers(): OnlineUser[] {
  return useContext(OnlineUsersContext);
}

// Typing Users Context
const TypingUsersContext = createContext<TypingUser[]>([]);

export function TypingUsersProvider({
  children,
  typingUsers,
}: {
  children: ReactNode;
  typingUsers: TypingUser[];
}) {
  return (
    <TypingUsersContext.Provider value={typingUsers}>
      {children}
    </TypingUsersContext.Provider>
  );
}

export function useTypingUsers(): TypingUser[] {
  return useContext(TypingUsersContext);
}

// Seen Watermarks Context
const SeenWatermarksContext = createContext<SeenWatermarks>({});

export function SeenWatermarksProvider({
  children,
  seenWatermarks,
}: {
  children: ReactNode;
  seenWatermarks: SeenWatermarks;
}) {
  return (
    <SeenWatermarksContext.Provider value={seenWatermarks}>
      {children}
    </SeenWatermarksContext.Provider>
  );
}

export function useSeenWatermarks(): SeenWatermarks {
  return useContext(SeenWatermarksContext);
}
