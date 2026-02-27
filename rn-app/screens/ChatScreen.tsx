import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Pressable,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HsafaProvider, useHsafaRuntime } from '@hsafa/react-native';
import { MessageBubble } from '../components/MessageBubble';
import type { AuthSession, SpaceInfo } from '../App';
import type { ThreadMessageLike } from '@hsafa/react-native';
import { AUTH_URL, PUBLIC_KEY } from '../config';

const DRAWER_WIDTH = 280;

// =============================================================================
// Spaces Drawer
// =============================================================================
interface DrawerProps {
  spaces: SpaceInfo[];
  selectedSpaceId: string;
  onSelectSpace: (id: string) => void;
  onCreateSpace: () => void;
  creatingSpace: boolean;
  user: AuthSession['user'];
  onLogout: () => void;
}

function SpacesDrawer({ spaces, selectedSpaceId, onSelectSpace, onCreateSpace, creatingSpace, user, onLogout }: DrawerProps) {
  return (
    <View style={ds.drawer}>
      {/* Header */}
      <View style={ds.drawerHeader}>
        <View style={ds.logoRow}>
          <Text style={ds.logoIcon}>✦</Text>
          <Text style={ds.logoText}>Hsafa</Text>
        </View>
      </View>

      {/* New Chat Button */}
      <TouchableOpacity style={ds.newChatBtn} onPress={onCreateSpace} disabled={creatingSpace} activeOpacity={0.7}>
        {creatingSpace ? (
          <ActivityIndicator size="small" color="#3B82F6" />
        ) : (
          <>
            <Text style={ds.newChatIcon}>+</Text>
            <Text style={ds.newChatText}>New Chat</Text>
          </>
        )}
      </TouchableOpacity>

      {/* Spaces List */}
      <ScrollView style={ds.spacesList} showsVerticalScrollIndicator={false}>
        {spaces.map((space) => {
          const isActive = space.id === selectedSpaceId;
          return (
            <TouchableOpacity
              key={space.id}
              style={[ds.spaceItem, isActive && ds.spaceItemActive]}
              onPress={() => onSelectSpace(space.id)}
              activeOpacity={0.7}
            >
              <Text style={ds.spaceIcon}>💬</Text>
              <Text style={[ds.spaceName, isActive && ds.spaceNameActive]} numberOfLines={1}>
                {space.name || 'Untitled'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Profile Box */}
      <View style={ds.profileBox}>
        <View style={ds.profileRow}>
          <View style={ds.profileAvatar}>
            <Text style={ds.profileAvatarText}>{user.name.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={ds.profileInfo}>
            <Text style={ds.profileName} numberOfLines={1}>{user.name}</Text>
            <Text style={ds.profileEmail} numberOfLines={1}>{user.email}</Text>
          </View>
          <TouchableOpacity onPress={onLogout} style={ds.logoutBtn} activeOpacity={0.7}>
            <Text style={ds.logoutIcon}>⏻</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// =============================================================================
// Chat view — inside provider, uses useHsafaRuntime
// =============================================================================
interface ChatViewProps {
  spaceId: string;
  entityId: string;
  spaceName: string;
  onToggleDrawer: () => void;
}

function ChatView({ spaceId, entityId, spaceName, onToggleDrawer }: ChatViewProps) {
  const { messages, isRunning, activeAgents, send, membersById } = useHsafaRuntime({
    smartSpaceId: spaceId,
    entityId,
  });
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<ThreadMessageLike>>(null);

  const agentLabel = activeAgents.length === 1
    ? `${activeAgents[0].entityName || 'AI Agent'} is active`
    : activeAgents.length > 1
      ? `${activeAgents.length} agents active`
      : null;

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || sending) return;
    setInputText('');
    setSending(true);
    try {
      await send(text);
    } catch {
      // silent
    } finally {
      setSending(false);
    }
  }, [inputText, sending, send]);

  const renderItem = useCallback(
    ({ item }: { item: ThreadMessageLike }) => (
      <MessageBubble message={item} membersById={membersById as any} />
    ),
    [membersById]
  );

  const scrollToBottom = () => listRef.current?.scrollToEnd({ animated: true });

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onToggleDrawer} style={styles.menuBtn} activeOpacity={0.7}>
          <Text style={styles.menuIcon}>☰</Text>
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle} numberOfLines={1}>{spaceName || 'AI Assistant'}</Text>
          {agentLabel ? (
            <View style={styles.statusRow}>
              <View style={styles.statusDot} />
              <Text style={styles.statusActive}>{agentLabel}</Text>
            </View>
          ) : null}
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Messages */}
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          onContentSizeChange={scrollToBottom}
          onLayout={scrollToBottom}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>✦</Text>
              <Text style={styles.emptyTitle}>Start a conversation</Text>
              <Text style={styles.emptySubtitle}>Send a message to chat with the AI assistant.</Text>
            </View>
          }
          ListFooterComponent={
            isRunning ? (
              <View style={styles.streamRow}>
                <View style={styles.streamAvatar}>
                  <Text style={styles.streamAvatarText}>✦</Text>
                </View>
                <View style={styles.streamBubble}>
                  <View style={styles.typingDots}>
                    <View style={styles.dot} />
                    <View style={[styles.dot, { opacity: 0.6 }]} />
                    <View style={[styles.dot, { opacity: 0.3 }]} />
                  </View>
                </View>
              </View>
            ) : null
          }
        />

        {/* Input bar */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Message"
            placeholderTextColor="#9CA3AF"
            multiline
            maxLength={2000}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!inputText.trim() || sending) && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!inputText.trim() || sending}
            activeOpacity={0.7}
          >
            {sending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.sendIcon}>↑</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// =============================================================================
// ChatScreen — wraps everything in HsafaProvider + drawer
// =============================================================================
interface ChatScreenProps {
  session: AuthSession;
  gatewayUrl: string;
  onLogout: () => void;
  onUpdateSession: (updated: AuthSession) => void;
}

export function ChatScreen({ session, gatewayUrl, onLogout, onUpdateSession }: ChatScreenProps) {
  const initialSpaces = session.user.spaces && session.user.spaces.length > 0
    ? session.user.spaces
    : [{ id: session.user.smartSpaceId, name: `${session.user.name}'s Chat` }];

  const [spaces, setSpaces] = useState<SpaceInfo[]>(initialSpaces);
  const [selectedSpaceId, setSelectedSpaceId] = useState(session.user.smartSpaceId);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [creatingSpace, setCreatingSpace] = useState(false);
  const drawerAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;

  const toggleDrawer = useCallback(() => {
    const toValue = drawerOpen ? -DRAWER_WIDTH : 0;
    Animated.timing(drawerAnim, {
      toValue,
      duration: 250,
      useNativeDriver: true,
    }).start();
    setDrawerOpen(!drawerOpen);
  }, [drawerOpen, drawerAnim]);

  const closeDrawer = useCallback(() => {
    if (!drawerOpen) return;
    Animated.timing(drawerAnim, {
      toValue: -DRAWER_WIDTH,
      duration: 250,
      useNativeDriver: true,
    }).start();
    setDrawerOpen(false);
  }, [drawerOpen, drawerAnim]);

  const handleSelectSpace = useCallback((id: string) => {
    setSelectedSpaceId(id);
    closeDrawer();
  }, [closeDrawer]);

  const handleCreateSpace = useCallback(async () => {
    setCreatingSpace(true);
    try {
      const res = await fetch(`${AUTH_URL}/api/spaces/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({ name: `Chat ${new Date().toLocaleTimeString()}` }),
      });
      if (!res.ok) throw new Error('Failed');
      const { smartSpace } = await res.json();
      const newSpace: SpaceInfo = { id: smartSpace.id, name: smartSpace.name };
      const updatedSpaces = [newSpace, ...spaces];
      setSpaces(updatedSpaces);
      setSelectedSpaceId(smartSpace.id);
      // Update session with new spaces
      onUpdateSession({
        ...session,
        user: { ...session.user, spaces: updatedSpaces },
      });
      closeDrawer();
    } catch {
      // silent
    } finally {
      setCreatingSpace(false);
    }
  }, [session, spaces, onUpdateSession, closeDrawer]);

  const currentSpace = spaces.find((s) => s.id === selectedSpaceId);

  return (
    <HsafaProvider gatewayUrl={gatewayUrl} publicKey={PUBLIC_KEY} jwt={session.token}>
      <View style={styles.container}>
        {/* Chat content */}
        <ChatView
          spaceId={selectedSpaceId}
          entityId={session.user.entityId}
          spaceName={currentSpace?.name || 'AI Assistant'}
          onToggleDrawer={toggleDrawer}
        />

        {/* Overlay when drawer is open */}
        {drawerOpen && (
          <Pressable style={styles.overlay} onPress={closeDrawer} />
        )}

        {/* Sliding drawer */}
        <Animated.View style={[styles.drawerContainer, { transform: [{ translateX: drawerAnim }] }]}>
          <SafeAreaView style={styles.drawerSafe} edges={['top', 'bottom']}>
            <SpacesDrawer
              spaces={spaces}
              selectedSpaceId={selectedSpaceId}
              onSelectSpace={handleSelectSpace}
              onCreateSpace={handleCreateSpace}
              creatingSpace={creatingSpace}
              user={session.user}
              onLogout={onLogout}
            />
          </SafeAreaView>
        </Animated.View>
      </View>
    </HsafaProvider>
  );
}

// =============================================================================
// Drawer Styles
// =============================================================================
const ds = StyleSheet.create({
  drawer: { flex: 1, backgroundColor: '#F8FAFC' },
  drawerHeader: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0' },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoIcon: { fontSize: 20, color: '#3B82F6' },
  logoText: { fontSize: 17, fontWeight: '700', color: '#1E293B' },
  newChatBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginHorizontal: 12, marginTop: 12, marginBottom: 8, height: 40, borderRadius: 10, borderWidth: 1, borderColor: '#CBD5E1', borderStyle: 'dashed', gap: 6 },
  newChatIcon: { fontSize: 18, color: '#3B82F6', fontWeight: '500' },
  newChatText: { fontSize: 14, color: '#3B82F6', fontWeight: '500' },
  spacesList: { flex: 1, paddingHorizontal: 8, paddingTop: 4 },
  spaceItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, gap: 10, marginVertical: 1 },
  spaceItemActive: { backgroundColor: '#EFF6FF' },
  spaceIcon: { fontSize: 14 },
  spaceName: { flex: 1, fontSize: 14, color: '#334155' },
  spaceNameActive: { color: '#1D4ED8', fontWeight: '600' },
  profileBox: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E2E8F0', paddingHorizontal: 12, paddingVertical: 12 },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  profileAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#DBEAFE', alignItems: 'center', justifyContent: 'center' },
  profileAvatarText: { fontSize: 14, fontWeight: '600', color: '#2563EB' },
  profileInfo: { flex: 1, gap: 1 },
  profileName: { fontSize: 13, fontWeight: '600', color: '#1E293B' },
  profileEmail: { fontSize: 11, color: '#64748B' },
  logoutBtn: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FEF2F2' },
  logoutIcon: { fontSize: 14, color: '#EF4444' },
});

// =============================================================================
// Main Styles
// =============================================================================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  safe: { flex: 1, backgroundColor: '#fff' },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
    gap: 8,
  },
  menuBtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6' },
  menuIcon: { fontSize: 18, color: '#374151' },
  headerInfo: { flex: 1 },
  headerTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981' },
  statusActive: { fontSize: 12, color: '#10B981' },
  list: { paddingVertical: 12, flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, paddingVertical: 80, gap: 10 },
  emptyIcon: { fontSize: 32, color: '#D1D5DB' },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#374151' },
  emptySubtitle: { fontSize: 14, color: '#9CA3AF', textAlign: 'center', lineHeight: 20 },
  streamRow: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12, marginVertical: 3, gap: 8 },
  streamAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  streamAvatarText: { fontSize: 12, color: '#3B82F6' },
  streamBubble: { maxWidth: '75%', backgroundColor: '#F3F4F6', borderRadius: 18, borderBottomLeftRadius: 4, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  typingDots: { flexDirection: 'row', gap: 4 },
  dot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#9CA3AF' },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12, paddingVertical: 10, gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E5E7EB' },
  input: { flex: 1, minHeight: 40, maxHeight: 120, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, color: '#111827', backgroundColor: '#F9FAFB' },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#3B82F6', alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { backgroundColor: '#D1D5DB' },
  sendIcon: { fontSize: 18, color: '#fff', fontWeight: '700' },
  // Drawer
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 10 },
  drawerContainer: { position: 'absolute', left: 0, top: 0, bottom: 0, width: DRAWER_WIDTH, zIndex: 20, backgroundColor: '#F8FAFC', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 20, shadowOffset: { width: 4, height: 0 }, elevation: 10 },
  drawerSafe: { flex: 1 },
});
