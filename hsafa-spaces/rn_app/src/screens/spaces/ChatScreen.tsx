import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/auth-context';
import { spacesApi, mediaApi, type SpaceMember } from '../../lib/api';
import { useSpaceChat, type MediaMessageData } from '../../lib/use-space-chat';
import { MessageRenderer } from '../../components/messages/MessageRenderer';
import { ForwardMessageModal } from '../../components/ForwardMessageModal';
import { SeenInfoModal } from '../../components/SeenInfoModal';
import { ChatSearchBar } from '../../components/ChatSearchBar';
import { EntityProfileSheet } from '../../components/EntityProfileSheet';
import { useTheme, spacing, fontSize, fontWeight, borderRadius } from '../../lib/theme';
import { haptic } from '../../lib/haptics';
import type { SpacesStackParamList, Message, Member } from '../../lib/types';

type Props = NativeStackScreenProps<SpacesStackParamList, 'Chat'>;

function toMember(m: SpaceMember): Member {
  return {
    entityId: m.entityId,
    name: m.entity?.displayName || 'Unknown',
    type: m.entity?.type || 'human',
    role: m.role || 'member',
    avatarUrl: m.entity?.avatarUrl ?? null,
    isOnline: false,
  };
}

export function ChatScreen({ route }: Props) {
  const { spaceId, spaceName } = route.params;
  const { colors } = useTheme();
  const { user } = useAuth();
  const navigation = useNavigation();

  const [members, setMembers] = useState<Member[]>([]);
  const [inputText, setInputText] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showScrollFab, setShowScrollFab] = useState(false);
  const [actionMessage, setActionMessage] = useState<Message | null>(null);
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [seenInfoMessage, setSeenInfoMessage] = useState<Message | null>(null);
  const [profileMember, setProfileMember] = useState<Member | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);

  const currentEntityId = user?.entityId ?? '';

  // Fetch members
  useEffect(() => {
    spacesApi.listMembers(spaceId).then(({ members: mems }) => {
      setMembers(mems.map(toMember));
    }).catch(() => {});
  }, [spaceId]);

  const {
    messages,
    isLoading,
    error,
    sendMessage,
    sendMediaMessage,
    sendTyping,
    markSeen,
    typingUsers,
    activeAgents,
    onlineUserIds,
  } = useSpaceChat(spaceId, members);

  // Update online status
  useEffect(() => {
    setMembers((prev) =>
      prev.map((m) => ({
        ...m,
        isOnline: onlineUserIds.includes(m.entityId),
      })),
    );
  }, [onlineUserIds]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  // Mark last message as seen
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (last && last.entityId !== currentEntityId) {
      markSeen(last.id);
    }
  }, [messages.length]);

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || sending) return;
    haptic.light();
    setSending(true);
    setInputText('');
    const replyId = replyingTo;
    setReplyingTo(null);
    try {
      await sendMessage(text, replyId ?? undefined);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  }, [inputText, sending, replyingTo, sendMessage]);

  const handleRespond = useCallback(async (messageId: string, value: unknown) => {
    try {
      await spacesApi.respondToMessage(spaceId, messageId, value);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to respond');
    }
  }, [spaceId]);

  const handleTextChange = useCallback((text: string) => {
    setInputText(text);
    if (text.length > 0) sendTyping(true);
  }, [sendTyping]);

  // ── Media handlers ──
  const handlePickImage = useCallback(async () => {
    setShowPlusMenu(false);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsMultipleSelection: false,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setUploading(true);
    try {
      const fileName = asset.uri.split('/').pop() || 'photo.jpg';
      const mimeType = asset.mimeType || 'image/jpeg';
      const uploaded = await mediaApi.upload(asset.uri, fileName, mimeType);
      await sendMediaMessage({
        type: 'image',
        url: uploaded.url,
        width: asset.width,
        height: asset.height,
      });
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to upload image');
    } finally {
      setUploading(false);
    }
  }, [sendMediaMessage]);

  const handleTakePhoto = useCallback(async () => {
    setShowPlusMenu(false);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Camera access is required to take photos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setUploading(true);
    try {
      const fileName = 'camera_photo.jpg';
      const uploaded = await mediaApi.upload(asset.uri, fileName, 'image/jpeg');
      await sendMediaMessage({
        type: 'image',
        url: uploaded.url,
        width: asset.width,
        height: asset.height,
      });
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to upload photo');
    } finally {
      setUploading(false);
    }
  }, [sendMediaMessage]);

  const handlePickFile = useCallback(async () => {
    setShowPlusMenu(false);
    try {
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setUploading(true);
      const uploaded = await mediaApi.upload(asset.uri, asset.name, asset.mimeType || 'application/octet-stream');
      await sendMediaMessage({
        type: 'file',
        url: uploaded.url,
        fileName: asset.name,
        fileSize: asset.size ?? 0,
        mimeType: asset.mimeType || 'application/octet-stream',
      });
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to upload file');
    } finally {
      setUploading(false);
    }
  }, [sendMediaMessage]);

  // ── Date separator helper ──
  const formatDateSeparator = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const dayMs = 86400000;
    if (diff < dayMs && d.getDate() === now.getDate()) return 'Today';
    if (diff < 2 * dayMs) return 'Yesterday';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
  };

  const replyMessage = replyingTo ? messages.find((m) => m.id === replyingTo) : null;

  const renderMessage = useCallback(({ item, index }: { item: Message; index: number }) => {
    const isOwn = item.entityId === currentEntityId;
    const prevMsg = index > 0 ? messages[index - 1] : null;
    const showSenderName = !isOwn && (
      !prevMsg || prevMsg.entityId !== item.entityId || item.type === 'system'
    );
    const isInteractive = ['confirmation', 'vote', 'choice', 'form', 'card', 'chart'].includes(item.type);

    // Date separator
    const prevDate = prevMsg ? new Date(prevMsg.createdAt).toDateString() : null;
    const currDate = new Date(item.createdAt).toDateString();
    const showDate = prevDate !== currDate;

    if (item.type === 'system') {
      return (
        <View style={styles.systemContainer}>
          {showDate && (
            <View style={styles.dateSeparator}>
              <View style={[styles.dateLine, { backgroundColor: colors.border }]} />
              <Text style={[styles.dateLabel, { color: colors.textMuted, backgroundColor: colors.background }]}>
                {formatDateSeparator(item.createdAt)}
              </Text>
              <View style={[styles.dateLine, { backgroundColor: colors.border }]} />
            </View>
          )}
          <MessageRenderer message={item} isOwn={false} />
        </View>
      );
    }

    const time = new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return (
      <View>
        {showDate && (
          <View style={styles.dateSeparator}>
            <View style={[styles.dateLine, { backgroundColor: colors.border }]} />
            <Text style={[styles.dateLabel, { color: colors.textMuted, backgroundColor: colors.background }]}>
              {formatDateSeparator(item.createdAt)}
            </Text>
            <View style={[styles.dateLine, { backgroundColor: colors.border }]} />
          </View>
        )}
        <TouchableOpacity
          activeOpacity={0.8}
          onLongPress={() => {
            haptic.medium();
            setActionMessage(item);
          }}
          style={[
            styles.messageRow,
            isOwn ? styles.messageRowOwn : styles.messageRowOther,
            showSenderName && { marginTop: spacing.md },
          ]}
        >
        <View style={{ maxWidth: '80%' }}>
          {/* Sender name */}
          {showSenderName && (
            <TouchableOpacity
              onPress={() => {
                const m = members.find((mem) => mem.entityId === item.entityId);
                if (m) setProfileMember(m);
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.senderName, { color: colors.textMuted }]}>
                {item.senderName}
              </Text>
            </TouchableOpacity>
          )}

          {/* Reply banner */}
          {item.replyTo && (
            <View style={[styles.replyBanner, { backgroundColor: colors.primaryLight, borderLeftColor: colors.primary }]}>
              <Text style={[styles.replyName, { color: colors.primary }]}>{item.replyTo.senderName}</Text>
              <Text style={[styles.replySnippet, { color: colors.textSecondary }]} numberOfLines={1}>
                {item.replyTo.snippet}
              </Text>
            </View>
          )}

          {/* Bubble */}
          <View
            style={[
              styles.bubble,
              isOwn
                ? (isInteractive
                    ? [styles.bubbleOwnInteractive, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '25' }]
                    : [styles.bubbleOwn, { backgroundColor: colors.messageMine }])
                : (isInteractive
                    ? [styles.bubbleOtherInteractive, { backgroundColor: colors.card, borderColor: colors.border }]
                    : [styles.bubbleOther, { backgroundColor: colors.messageOther, borderColor: colors.border }]),
            ]}
          >
            <MessageRenderer
              message={item}
              isOwn={isOwn && !isInteractive}
              currentEntityId={currentEntityId}
              onRespond={handleRespond}
            />
            <View style={styles.timeRow}>
              <Text style={[styles.timeText, {
                color: isOwn && !isInteractive ? 'rgba(255,255,255,0.6)' : colors.textMuted,
              }]}>
                {time}
              </Text>
              {isOwn && (() => {
                const seenByOthers = item.seenBy.filter((eid) => eid !== currentEntityId);
                const otherCount = members.filter((m) => m.entityId !== currentEntityId).length;
                const allSeen = seenByOthers.length >= otherCount && otherCount > 0;
                return (
                  <Text style={[styles.seenCheck, {
                    color: allSeen
                      ? (isInteractive ? '#3b82f6' : 'rgba(147,197,253,0.9)')
                      : (isInteractive ? colors.textMuted : 'rgba(255,255,255,0.5)'),
                  }]}>
                    {seenByOthers.length > 0 ? '✔✔' : '✔'}
                  </Text>
                );
              })()}
            </View>
          </View>
        </View>
        </TouchableOpacity>
      </View>
    );
  }, [currentEntityId, messages, colors, handleRespond]);

  // Typing / agent activity indicator
  const statusLine = (() => {
    if (activeAgents.length > 0) {
      const names = activeAgents.map((a) => a.agentName || 'Haseef').join(', ');
      return `${names} is thinking...`;
    }
    if (typingUsers.length > 0) {
      const names = typingUsers.map((t) => t.entityName).join(', ');
      const activity = typingUsers[0]?.activity === 'recording' ? 'recording' : 'typing';
      return `${names} is ${activity}...`;
    }
    return null;
  })();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7} style={styles.backBtn}>
          <Text style={[styles.backArrow, { color: colors.primary }]}>‹</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
            {spaceName || 'Chat'}
          </Text>
          <Text style={[styles.headerSubtitle, { color: colors.textMuted }]}>
            {members.length} member{members.length !== 1 ? 's' : ''}
            {onlineUserIds.length > 0 ? ` · ${onlineUserIds.length} online` : ''}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => { setSearchMode(true); setSearchQuery(''); }}
          activeOpacity={0.7}
          style={styles.settingsBtn}
        >
          <Ionicons name="search-outline" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => (navigation as any).navigate('SpaceSettings', { spaceId })}
          activeOpacity={0.7}
          style={styles.settingsBtn}
        >
          <Ionicons name="settings-outline" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {/* Messages */}
        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={{ color: colors.error, fontSize: fontSize.sm }}>{error}</Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            contentContainerStyle={[
              styles.messagesList,
              messages.length === 0 && styles.emptyList,
            ]}
            ListEmptyComponent={
              <View style={styles.emptyChat}>
                <Ionicons name="chatbubbles-outline" size={40} color={colors.textMuted} />
                <Text style={[styles.emptyChatText, { color: colors.textSecondary }]}>
                  No messages yet. Say hello!
                </Text>
              </View>
            }
            onEndReachedThreshold={0.1}
            showsVerticalScrollIndicator={false}
            onScroll={(e) => {
              const offsetY = e.nativeEvent.contentOffset.y;
              const contentH = e.nativeEvent.contentSize.height;
              const layoutH = e.nativeEvent.layoutMeasurement.height;
              setShowScrollFab(contentH - offsetY - layoutH > 200);
            }}
            scrollEventThrottle={200}
          />
        )}

        {/* Typing / agent activity */}
        {statusLine && (
          <View style={[styles.statusBar, { backgroundColor: colors.surface }]}>
            <Text style={[styles.statusText, { color: colors.textSecondary }]}>{statusLine}</Text>
          </View>
        )}

        {/* Reply banner */}
        {replyMessage && (
          <View style={[styles.replyBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
            <View style={[styles.replyBarStrip, { backgroundColor: colors.primary }]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.replyBarName, { color: colors.primary }]}>{replyMessage.senderName}</Text>
              <Text style={[styles.replyBarText, { color: colors.textSecondary }]} numberOfLines={1}>
                {replyMessage.content || replyMessage.title || replyMessage.formTitle || replyMessage.cardTitle || ''}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setReplyingTo(null)} activeOpacity={0.7}>
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        )}

        {/* Upload indicator */}
        {uploading && (
          <View style={[styles.statusBar, { backgroundColor: colors.surface }]}>
            <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: spacing.sm }} />
            <Text style={[styles.statusText, { color: colors.textSecondary }]}>Uploading...</Text>
          </View>
        )}

        {/* Input bar */}
        <View style={[styles.inputBar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.plusBtn, { backgroundColor: colors.surface }]}
            onPress={() => setShowPlusMenu(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="add" size={22} color={colors.primary} />
          </TouchableOpacity>
          <TextInput
            ref={inputRef}
            style={[styles.textInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
            placeholder="Message..."
            placeholderTextColor={colors.textMuted}
            value={inputText}
            onChangeText={handleTextChange}
            multiline
            maxLength={4000}
            returnKeyType="default"
          />
          <TouchableOpacity
            style={[styles.sendBtn, { backgroundColor: inputText.trim() ? colors.primary : colors.surface }]}
            onPress={handleSend}
            disabled={!inputText.trim() || sending}
            activeOpacity={0.7}
          >
            {sending ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : (
              <Ionicons name="arrow-up" size={18} color={inputText.trim() ? colors.primaryForeground : colors.textMuted} />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Scroll to bottom FAB */}
      {showScrollFab && (
        <TouchableOpacity
          style={[styles.scrollFab, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => flatListRef.current?.scrollToEnd({ animated: true })}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-down" size={18} color={colors.primary} />
        </TouchableOpacity>
      )}

      {/* Message action sheet */}
      <Modal visible={!!actionMessage} transparent animationType="fade" onRequestClose={() => setActionMessage(null)}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setActionMessage(null)}
        >
          <View style={[styles.plusMenuCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.plusMenuTitle, { color: colors.text }]}>Message Actions</Text>
            <TouchableOpacity
              style={[styles.plusMenuRow, { borderBottomColor: colors.borderLight }]}
              onPress={() => {
                const msg = actionMessage;
                setActionMessage(null);
                if (msg) {
                  setReplyingTo(msg.id);
                  inputRef.current?.focus();
                }
              }}
              activeOpacity={0.6}
            >
              <View style={[styles.plusMenuIcon, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="arrow-undo-outline" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.plusMenuLabel, { color: colors.text }]}>Reply</Text>
                <Text style={[styles.plusMenuSub, { color: colors.textMuted }]}>Reply to this message</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.plusMenuRow, { borderBottomColor: colors.borderLight }]}
              onPress={async () => {
                const msg = actionMessage;
                setActionMessage(null);
                if (msg) {
                  const text = msg.content || msg.title || msg.formTitle || msg.cardTitle || msg.imageCaption || msg.fileName || '';
                  if (text) {
                    await Clipboard.setStringAsync(text);
                    haptic.success();
                  }
                }
              }}
              activeOpacity={0.6}
            >
              <View style={[styles.plusMenuIcon, { backgroundColor: colors.surface }]}>
                <Ionicons name="copy-outline" size={20} color={colors.textSecondary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.plusMenuLabel, { color: colors.text }]}>Copy Text</Text>
                <Text style={[styles.plusMenuSub, { color: colors.textMuted }]}>Copy message to clipboard</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.plusMenuRow, { borderBottomColor: colors.borderLight }]}
              onPress={() => {
                const msg = actionMessage;
                setActionMessage(null);
                if (msg) setForwardingMessage(msg);
              }}
              activeOpacity={0.6}
            >
              <View style={[styles.plusMenuIcon, { backgroundColor: colors.successLight }]}>
                <Ionicons name="share-outline" size={20} color={colors.success} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.plusMenuLabel, { color: colors.text }]}>Forward</Text>
                <Text style={[styles.plusMenuSub, { color: colors.textMuted }]}>Send to another space</Text>
              </View>
            </TouchableOpacity>
            {actionMessage?.entityId === currentEntityId && (
              <TouchableOpacity
                style={styles.plusMenuRow}
                onPress={() => {
                  const msg = actionMessage;
                  setActionMessage(null);
                  if (msg) setSeenInfoMessage(msg);
                }}
                activeOpacity={0.6}
              >
                <View style={[styles.plusMenuIcon, { backgroundColor: colors.warningLight }]}>
                  <Ionicons name="eye-outline" size={20} color={colors.warning} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.plusMenuLabel, { color: colors.text }]}>Info</Text>
                  <Text style={[styles.plusMenuSub, { color: colors.textMuted }]}>See who read this message</Text>
                </View>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Plus menu modal */}
      <Modal visible={showPlusMenu} transparent animationType="fade" onRequestClose={() => setShowPlusMenu(false)}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowPlusMenu(false)}
        >
          <View style={[styles.plusMenuCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.plusMenuTitle, { color: colors.text }]}>Send Media</Text>
            <TouchableOpacity style={[styles.plusMenuRow, { borderBottomColor: colors.borderLight }]} onPress={handlePickImage} activeOpacity={0.6}>
              <View style={[styles.plusMenuIcon, { backgroundColor: colors.primaryLight }]}><Ionicons name="image-outline" size={20} color={colors.primary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.plusMenuLabel, { color: colors.text }]}>Photo Library</Text>
                <Text style={[styles.plusMenuSub, { color: colors.textMuted }]}>Choose from gallery</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.plusMenuRow, { borderBottomColor: colors.borderLight }]} onPress={handleTakePhoto} activeOpacity={0.6}>
              <View style={[styles.plusMenuIcon, { backgroundColor: colors.successLight }]}><Ionicons name="camera-outline" size={20} color={colors.success} /></View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.plusMenuLabel, { color: colors.text }]}>Camera</Text>
                <Text style={[styles.plusMenuSub, { color: colors.textMuted }]}>Take a new photo</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.plusMenuRow} onPress={handlePickFile} activeOpacity={0.6}>
              <View style={[styles.plusMenuIcon, { backgroundColor: colors.warningLight }]}><Ionicons name="document-outline" size={20} color={colors.warning} /></View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.plusMenuLabel, { color: colors.text }]}>File</Text>
                <Text style={[styles.plusMenuSub, { color: colors.textMuted }]}>Choose a document</Text>
              </View>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
      {/* Forward message modal */}
      {forwardingMessage && (
        <ForwardMessageModal
          message={forwardingMessage}
          currentSpaceId={spaceId}
          onClose={() => setForwardingMessage(null)}
        />
      )}

      {/* Seen info modal */}
      {seenInfoMessage && (
        <SeenInfoModal
          message={seenInfoMessage}
          members={members}
          currentEntityId={currentEntityId}
          onClose={() => setSeenInfoMessage(null)}
        />
      )}

      {/* Entity profile sheet */}
      {profileMember && (
        <EntityProfileSheet
          member={profileMember}
          currentEntityId={currentEntityId}
          onClose={() => setProfileMember(null)}
        />
      )}

      {/* Search overlay */}
      {searchMode && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]}>
          <SafeAreaView style={{ flex: 1 }} edges={['top']}>
            <ChatSearchBar
              query={searchQuery}
              onQueryChange={setSearchQuery}
              messages={messages}
              members={members}
              onSelect={(msgId) => {
                setSearchMode(false);
                setSearchQuery('');
                const idx = messages.findIndex((m) => m.id === msgId);
                if (idx >= 0) {
                  setTimeout(() => flatListRef.current?.scrollToIndex({ index: idx, animated: true }), 100);
                }
              }}
              onClose={() => { setSearchMode(false); setSearchQuery(''); }}
            />
          </SafeAreaView>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  backArrow: { fontSize: 28, fontWeight: '300' },
  headerCenter: { flex: 1, marginHorizontal: spacing.sm },
  headerTitle: { fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  headerSubtitle: { fontSize: fontSize.xs },
  settingsBtn: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },

  // Messages list
  messagesList: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm, paddingTop: spacing.sm },
  emptyList: { flexGrow: 1, justifyContent: 'center' },
  emptyChat: { alignItems: 'center' },
  emptyChatIcon: { marginBottom: spacing.sm },
  emptyChatText: { fontSize: fontSize.sm },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Message rows
  messageRow: { marginTop: spacing.xs },
  messageRowOwn: { alignItems: 'flex-end' },
  messageRowOther: { alignItems: 'flex-start' },

  senderName: { fontSize: fontSize.xs, fontWeight: fontWeight.medium, marginBottom: 2, marginLeft: spacing.xs },

  // Bubble
  bubble: { borderRadius: borderRadius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, maxWidth: '100%' },
  bubbleOwn: { borderBottomRightRadius: borderRadius.sm },
  bubbleOther: { borderBottomLeftRadius: borderRadius.sm, borderWidth: StyleSheet.hairlineWidth },
  bubbleOwnInteractive: { borderRadius: borderRadius.lg, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  bubbleOtherInteractive: { borderRadius: borderRadius.lg, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.md },

  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: spacing.xs },
  timeText: { fontSize: 10 },
  seenCheck: { fontSize: 10, fontWeight: '600' },

  // Reply banner (inside bubble)
  replyBanner: {
    borderLeftWidth: 2,
    paddingLeft: spacing.sm,
    paddingVertical: 2,
    marginBottom: spacing.xs,
    borderRadius: borderRadius.sm,
    paddingRight: spacing.sm,
  },
  replyName: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold },
  replySnippet: { fontSize: fontSize.xs },

  // System
  systemContainer: { paddingVertical: spacing.xs },

  // Status bar (typing indicator)
  statusBar: { paddingHorizontal: spacing.lg, paddingVertical: spacing.xs },
  statusText: { fontSize: fontSize.xs, fontStyle: 'italic' },

  // Reply bar (above input)
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  replyBarStrip: { width: 3, height: '100%', borderRadius: 2, minHeight: 28 },
  replyBarName: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold },
  replyBarText: { fontSize: fontSize.xs },

  // Input bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  textInput: {
    flex: 1,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? spacing.sm : spacing.xs,
    fontSize: fontSize.sm,
    maxHeight: 100,
    minHeight: 36,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusBtn: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Date separator
  dateSeparator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.md,
    gap: spacing.sm,
  },
  dateLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dateLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    paddingHorizontal: spacing.sm,
  },

  // Scroll FAB
  scrollFab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: 80,
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },

  // Plus menu modal
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  plusMenuCard: {
    marginHorizontal: spacing.md,
    marginBottom: spacing['3xl'],
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    padding: spacing.lg,
  },
  plusMenuTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.md,
  },
  plusMenuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
  },
  plusMenuIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusMenuLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  plusMenuSub: { fontSize: fontSize.xs },
});
