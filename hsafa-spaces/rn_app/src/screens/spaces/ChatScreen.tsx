import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  Image,
  Keyboard,
  InputAccessoryView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Clipboard from 'expo-clipboard';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/auth-context';
import { spacesApi, mediaApi, resolveMediaUrl, type SpaceMember } from '../../lib/api';
import { useSpaceChat, type MediaMessageData } from '../../lib/use-space-chat';
import { MessageRenderer } from '../../components/messages/MessageRenderer';
import { ForwardMessageModal } from '../../components/ForwardMessageModal';
import { SeenInfoModal } from '../../components/SeenInfoModal';
import { ChatSearchBar } from '../../components/ChatSearchBar';
import { EntityProfileSheet } from '../../components/EntityProfileSheet';
import { TypingDots } from '../../components/TypingDots';
import { SwipeableRow } from '../../components/SwipeableRow';
import { useTheme, spacing, fontSize, fontWeight, borderRadius } from '../../lib/theme';
import { haptic } from '../../lib/haptics';
import type { RootStackParamList, Member, Message, MessageType } from '../../lib/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;

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
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showScrollFab, setShowScrollFab] = useState(false);
  const [actionMessage, setActionMessage] = useState<Message | null>(null);
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [seenInfoMessage, setSeenInfoMessage] = useState<Message | null>(null);
  const [profileMember, setProfileMember] = useState<Member | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const highlightAnim = useRef(new Animated.Value(0)).current;
  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);

  const flashHighlight = useCallback((messageId: string) => {
    setHighlightedMessageId(messageId);
    highlightAnim.setValue(1);
    Animated.timing(highlightAnim, {
      toValue: 0,
      duration: 1500,
      useNativeDriver: false,
    }).start(() => setHighlightedMessageId(null));
  }, [highlightAnim]);

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
    seenWatermarks,
  } = useSpaceChat(spaceId, members);

  // Compute per-message seenBy from seenWatermarks (matches Vite app logic)
  const messageSeenMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    if (!messages.length) return map;
    const idxMap = new Map<string, number>();
    messages.forEach((m, i) => idxMap.set(m.id, i));
    for (const msg of messages) {
      const msgIdx = idxMap.get(msg.id) ?? 0;
      const seenBy: string[] = [];
      for (const [entityId, watermarkId] of Object.entries(seenWatermarks)) {
        if (entityId === msg.entityId) continue;
        const watermarkIdx = idxMap.get(watermarkId);
        if (watermarkIdx !== undefined && watermarkIdx >= msgIdx) {
          seenBy.push(entityId);
        }
      }
      map[msg.id] = seenBy;
    }
    return map;
  }, [messages, seenWatermarks]);

  // Update online status: humans from onlineUserIds, agents from activeAgents
  useEffect(() => {
    setMembers((prev) =>
      prev.map((m) => ({
        ...m,
        isOnline:
          m.type === 'agent'
            ? activeAgents.some((a) => a.agentEntityId === m.entityId)
            : onlineUserIds.includes(m.entityId),
      })),
    );
  }, [onlineUserIds, activeAgents]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  // Track keyboard visibility for bottom padding toggle
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () => {
      setKeyboardVisible(true);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 250);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardVisible(false);
    });
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

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
      // Always scroll to bottom after sending
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
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

  // ── Voice recording handlers ──
  const startRecording = useCallback(async () => {
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Microphone access is required to record voice messages.');
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      recordingRef.current = recording;
      setIsRecording(true);
      setRecordingDuration(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((d) => d + 1);
      }, 1000);
      // Notify others we're recording
      spacesApi.sendTyping(spaceId, true, 'recording').catch(() => {});
      haptic.light();
    } catch (err) {
      console.warn('[VoiceRecording] Failed to start:', err);
      Alert.alert('Error', 'Failed to start recording');
    }
  }, [spaceId]);

  const cancelRecording = useCallback(async () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    try {
      await recordingRef.current?.stopAndUnloadAsync();
    } catch {}
    recordingRef.current = null;
    setIsRecording(false);
    setRecordingDuration(0);
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
    spacesApi.sendTyping(spaceId, false).catch(() => {});
  }, [spaceId]);

  const stopAndSendRecording = useCallback(async () => {
    if (!recordingRef.current) return;
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    haptic.light();
    setIsRecording(false);
    setUploading(true);
    try {
      await recordingRef.current.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;
      if (!uri) throw new Error('No recording URI');
      spacesApi.sendTyping(spaceId, false).catch(() => {});

      const uploaded = await mediaApi.uploadVoice(uri, 'voice.m4a');
      await sendMediaMessage({
        type: 'voice',
        url: uploaded.url,
        duration: recordingDuration,
        transcription: uploaded.transcription,
      });
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to send voice message');
    } finally {
      setUploading(false);
      setRecordingDuration(0);
    }
  }, [spaceId, sendMediaMessage, recordingDuration]);

  // Cleanup recording on unmount
  useEffect(() => {
    return () => {
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
      }
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, []);

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

  // Helper to get message type label for reply banners
  const getMessageTypeLabel = (msg: Message): string => {
    if (msg.content?.trim()) return msg.content;
    switch (msg.type) {
      case 'voice': return '🎤 Voice message';
      case 'image': return '📷 Photo';
      case 'video': return '🎬 Video';
      case 'file': return `📎 ${msg.fileName || 'File'}`;
      case 'confirmation': return `✓ ${msg.title || 'Confirmation'}`;
      case 'vote': return '📊 Poll';
      case 'choice': return '☰ Choice';
      case 'form': return `📝 ${msg.formTitle || 'Form'}`;
      case 'card': return `🃏 ${msg.cardTitle || 'Card'}`;
      case 'chart': return '📈 Chart';
      default: return msg.title || msg.formTitle || msg.cardTitle || '[Attachment]';
    }
  };

  const renderMessage = useCallback(({ item, index }: { item: Message; index: number }) => {
    const isOwn = item.entityId === currentEntityId;
    const prevMsg = index > 0 ? messages[index - 1] : null;
    const nextMsg = index < messages.length - 1 ? messages[index + 1] : null;
    
    // Show sender name on first message in group
    const showSenderName = !isOwn && (
      !prevMsg || prevMsg.entityId !== item.entityId || item.type === 'system'
    );
    
    // Show avatar only on LAST message in consecutive group from same sender
    const isLastInGroup = !nextMsg || nextMsg.entityId !== item.entityId || nextMsg.type === 'system';
    const showAvatar = !isOwn && isLastInGroup;
    
    // Determine bubble position in group for corner radius styling
    const isFirstInGroup = showSenderName;
    const isMiddleInGroup = !isFirstInGroup && !isLastInGroup;
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

    const isHighlighted = highlightedMessageId === item.id;
    const highlightBg = isHighlighted
      ? highlightAnim.interpolate({ inputRange: [0, 1], outputRange: ['transparent', colors.primary + '20'] })
      : 'transparent';

    return (
      <Animated.View style={{ backgroundColor: highlightBg, borderRadius: 16, marginHorizontal: -4, paddingHorizontal: 4 }}>
        {showDate && (
          <View style={styles.dateSeparator}>
            <View style={[styles.dateLine, { backgroundColor: colors.border }]} />
            <Text style={[styles.dateLabel, { color: colors.textMuted, backgroundColor: colors.background }]}>
              {formatDateSeparator(item.createdAt)}
            </Text>
            <View style={[styles.dateLine, { backgroundColor: colors.border }]} />
          </View>
        )}
        <SwipeableRow
          onSwipeRight={() => {
            haptic.light();
            setReplyingTo(item.id);
            inputRef.current?.focus();
          }}
          iconColor={colors.primary}
        >
        <TouchableOpacity
          activeOpacity={1}
          delayLongPress={300}
          onPress={() => {}}
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
        <View style={isOwn ? { alignSelf: 'flex-end' } : styles.messageRowWithAvatar}>
          {/* Sender avatar */}
          {showAvatar && (() => {
            const member = members.find((mem) => mem.entityId === item.entityId);
            const avatar = resolveMediaUrl(member?.avatarUrl ?? null);
            const isAgent = member?.type === 'agent' || item.senderType === 'agent';
            return (
              <TouchableOpacity
                onPress={() => { if (member) setProfileMember(member); }}
                activeOpacity={0.7}
                style={styles.msgAvatarWrap}
              >
                {avatar ? (
                  <Image source={{ uri: avatar }} style={styles.msgAvatar} />
                ) : (
                  <View style={[styles.msgAvatarFallback, { backgroundColor: isAgent ? colors.successLight : colors.primaryLight }]}>
                    {isAgent ? (
                      <Ionicons name="sparkles" size={12} color={colors.success} />
                    ) : (
                      <Text style={{ fontSize: 11, fontWeight: '600', color: colors.primary }}>
                        {(item.senderName || '?')[0].toUpperCase()}
                      </Text>
                    )}
                  </View>
                )}
              </TouchableOpacity>
            );
          })()}
          {!isOwn && !showAvatar && <View style={styles.msgAvatarSpacer} />}
        <View style={{ alignSelf: isOwn ? 'flex-end' : 'flex-start' }}>
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

          {/* Reply banner (above bubble, Vite app style) */}
          {item.replyTo && (
            <TouchableOpacity
              style={styles.replyBannerAbove}
              onPress={() => {
                const targetId = item.replyTo?.messageId;
                if (!targetId) return;
                const idx = messages.findIndex((m) => m.id === targetId);
                if (idx >= 0) {
                  flatListRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.3 });
                  setTimeout(() => flashHighlight(targetId), 400);
                }
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-undo" size={12} color={colors.textMuted} style={{ marginRight: 4 }} />
              <Text style={[styles.replyBannerName, { color: colors.textMuted }]}>{item.replyTo.senderName}</Text>
              <Text style={[styles.replyBannerSnippet, { color: colors.textMuted }]} numberOfLines={1}>
                {(() => {
                  const snippet = item.replyTo?.snippet;
                  const msgType = item.replyTo?.messageType;
                  if (snippet && snippet !== '[Attachment]') return snippet;
                  switch (msgType) {
                    case 'voice': return '🎤 Voice message';
                    case 'image': return '📷 Photo';
                    case 'video': return '🎬 Video';
                    case 'file': return '📎 File';
                    case 'confirmation': return '✓ Confirmation';
                    case 'vote': return '📊 Poll';
                    case 'choice': return '☰ Choice';
                    case 'form': return '📝 Form';
                    case 'card': return '🃏 Card';
                    case 'chart': return '📈 Chart';
                    default: return 'Message';
                  }
                })()}
              </Text>
            </TouchableOpacity>
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
              // Dynamic corner radius: only last message in group has sharp corner, others have equal rounded corners
              isOwn && !isLastInGroup ? { borderBottomRightRadius: borderRadius.lg, borderTopRightRadius: borderRadius.lg } : {},
              !isOwn && !isLastInGroup ? { borderBottomLeftRadius: borderRadius.lg, borderTopLeftRadius: borderRadius.lg } : {},
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
                const seenByOthers = (messageSeenMap[item.id] || []).filter((eid) => eid !== currentEntityId);
                const otherCount = members.filter((m) => m.entityId !== currentEntityId).length;
                const allSeen = seenByOthers.length >= otherCount && otherCount > 0;
                const someSeen = seenByOthers.length > 0;
                // Vite app: CheckCheckIcon blue = all seen, CheckCheckIcon muted = some seen, CheckIcon muted = sent
                if (allSeen) {
                  return <Ionicons name="checkmark-done" size={15} color="#60a5fa" style={{ marginLeft: 3 }} />;
                }
                if (someSeen) {
                  return <Ionicons name="checkmark-done" size={15} color={isInteractive ? colors.textMuted : 'rgba(255,255,255,0.6)'} style={{ marginLeft: 3 }} />;
                }
                return <Ionicons name="checkmark" size={15} color={isInteractive ? colors.textMuted : 'rgba(255,255,255,0.6)'} style={{ marginLeft: 3 }} />;
              })()}
            </View>
          </View>
        </View>
        </View>
        </TouchableOpacity>
        </SwipeableRow>
      </Animated.View>
    );
  }, [currentEntityId, messages, colors, handleRespond, members, highlightedMessageId, highlightAnim, flashHighlight, messageSeenMap]);

  // Merge active agents into typing list (agents show as "typing" like humans)
  const allTyping = useMemo(() => {
    const typing: Array<{ entityId: string; name: string; activity?: 'typing' | 'recording' }> = [];
    // Human typing users
    for (const t of typingUsers) {
      if (t.entityId === currentEntityId) continue;
      typing.push({ entityId: t.entityId, name: t.entityName, activity: t.activity });
    }
    // Active agents as typing (only if not already in typingUsers)
    for (const a of activeAgents) {
      if (typing.some((t) => t.entityId === a.agentEntityId)) continue;
      const member = members.find((m) => m.entityId === a.agentEntityId);
      typing.push({ entityId: a.agentEntityId, name: member?.name || a.agentName || 'Haseef', activity: 'typing' });
    }
    return typing;
  }, [typingUsers, activeAgents, currentEntityId, members]);

  const statusLine = useMemo(() => {
    if (allTyping.length === 0) return null;
    const hasRecording = allTyping.some((t) => t.activity === 'recording');
    const verb = hasRecording ? 'recording voice' : 'typing';
    if (allTyping.length === 1) return `${allTyping[0].name} is ${verb}...`;
    if (allTyping.length === 2) return `${allTyping[0].name} and ${allTyping[1].name} are ${verb}...`;
    return `${allTyping[0].name} and ${allTyping.length - 1} others are ${verb}...`;
  }, [allTyping]);

  const isDirect = useMemo(() => {
    const meta = route.params as Record<string, unknown>;
    // Direct spaces have exactly 2 members
    return members.length === 2;
  }, [members.length]);

  const otherMember = useMemo(() => {
    if (!isDirect) return null;
    return members.find((m) => m.entityId !== currentEntityId) ?? null;
  }, [isDirect, members, currentEntityId]);

  // Online count excluding self
  const onlineOtherCount = useMemo(() => {
    return onlineUserIds.filter((id) => id !== currentEntityId).length;
  }, [onlineUserIds, currentEntityId]);

  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7} style={styles.backBtn}>
          <Text style={[styles.backArrow, { color: colors.primary }]}>‹</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerCenter}
          onPress={() => (navigation as any).navigate('SpaceSettings', { spaceId })}
          activeOpacity={0.7}
        >
          <View style={styles.headerRow}>
            {/* Space avatar */}
            {(() => {
              const isGroup = !isDirect;
              const otherAvatar = resolveMediaUrl(otherMember?.avatarUrl ?? null);
              const isAgent = otherMember?.type === 'agent';

              if (!isGroup && otherAvatar) {
                return (
                  <View style={styles.headerAvatarWrap}>
                    <Image source={{ uri: otherAvatar }} style={styles.headerAvatar} />
                    {otherMember?.isOnline && <View style={[styles.headerOnlineDot, { backgroundColor: colors.success, borderColor: colors.card }]} />}
                  </View>
                );
              }
              return (
                <View style={[styles.headerAvatarFallback, { backgroundColor: isGroup ? colors.primaryLight : (isAgent ? colors.successLight : colors.primaryLight) }]}>
                  {isGroup ? (
                    <Ionicons name="people" size={14} color={colors.primary} />
                  ) : isAgent ? (
                    <Ionicons name="sparkles" size={14} color={colors.success} />
                  ) : (
                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primary }}>
                      {(otherMember?.name || spaceName || '?')[0].toUpperCase()}
                    </Text>
                  )}
                </View>
              );
            })()}
            <View style={{ flex: 1 }}>
              <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
                {spaceName || 'Chat'}
              </Text>
              {statusLine ? (
                <Text style={[styles.headerSubtitle, { color: colors.primary }]} numberOfLines={1}>
                  {statusLine}
                </Text>
              ) : isDirect ? (
                otherMember?.isOnline ? (
                  <Text style={[styles.headerSubtitle, { color: colors.success }]}>online</Text>
                ) : null
              ) : (
                <Text style={[styles.headerSubtitle, { color: colors.textMuted }]}>
                  {members.length} member{members.length !== 1 ? 's' : ''}
                  {onlineOtherCount > 0 ? ` · ` : ''}
                  {onlineOtherCount > 0 && (
                    <Text style={{ color: colors.success }}>{onlineOtherCount} online</Text>
                  )}
                </Text>
              )}
            </View>
          </View>
        </TouchableOpacity>
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
            keyboardDismissMode="on-drag"
            onScrollBeginDrag={() => Keyboard.dismiss()}
            automaticallyAdjustKeyboardInsets={false}
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
        {allTyping.length > 0 && (
          <View style={[styles.statusBar, { backgroundColor: colors.surface }]}>
            <TypingDots color={colors.primary} size={5} />
            <Text style={[styles.statusText, { color: colors.textSecondary }]}>{statusLine}</Text>
          </View>
        )}

        {/* Reply banner */}
        {replyMessage && (
          <View style={[styles.replyBar, { backgroundColor: colors.surface, borderTopColor: colors.border, borderBottomWidth: 1, borderBottomColor: colors.border }]}>
            <View style={[styles.replyBarStrip, { backgroundColor: colors.primary }]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.replyBarName, { color: colors.primary }]}>Replying to {replyMessage.senderName}</Text>
              <Text style={[styles.replyBarText, { color: colors.textSecondary }]} numberOfLines={1}>
                {getMessageTypeLabel(replyMessage)}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setReplyingTo(null)} activeOpacity={0.7} style={{ padding: 4 }}>
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

        {/* Input bar — bottom padding accounts for home indicator when keyboard is closed */}
        <View style={[styles.inputBar, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: keyboardVisible ? spacing.sm : spacing.sm + insets.bottom }]}>
          {isRecording ? (
            /* ── Recording UI ── */
            <>
              <TouchableOpacity
                style={[styles.plusBtn, { backgroundColor: 'rgba(239,68,68,0.1)' }]}
                onPress={cancelRecording}
                activeOpacity={0.7}
              >
                <Ionicons name="trash-outline" size={18} color="#ef4444" />
              </TouchableOpacity>
              <View style={[styles.recordingBar, { backgroundColor: 'rgba(239,68,68,0.06)', borderColor: 'rgba(239,68,68,0.2)' }]}>
                <View style={styles.recordingDot} />
                <Text style={styles.recordingText}>
                  {Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, '0')}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: fontSize.xs, flex: 1 }}>Recording...</Text>
              </View>
              <TouchableOpacity
                style={[styles.sendBtn, { backgroundColor: '#ef4444' }]}
                onPress={stopAndSendRecording}
                activeOpacity={0.7}
              >
                <Ionicons name="arrow-up" size={18} color="#fff" />
              </TouchableOpacity>
            </>
          ) : (
            /* ── Normal input UI ── */
            <>
              {/* + button (components) */}
              <TouchableOpacity
                style={[styles.plusBtn, { backgroundColor: colors.surface }]}
                onPress={() => setShowPlusMenu(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="add" size={22} color={colors.primary} />
              </TouchableOpacity>
              {/* Paperclip button (attachments) */}
              <TouchableOpacity
                style={[styles.plusBtn, { backgroundColor: colors.surface }]}
                onPress={() => setShowAttachMenu(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="attach" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
              {/* Mic button */}
              <TouchableOpacity
                style={[styles.plusBtn, { backgroundColor: colors.surface }]}
                onPress={startRecording}
                activeOpacity={0.7}
              >
                <Ionicons name="mic-outline" size={20} color={colors.textSecondary} />
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
            </>
          )}
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

      {/* Components menu modal (+ button) */}
      <Modal visible={showPlusMenu} transparent animationType="fade" onRequestClose={() => setShowPlusMenu(false)}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowPlusMenu(false)}
        >
          <View style={[styles.plusMenuCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.plusMenuTitle, { color: colors.text }]}>Components</Text>
            {[
              { icon: 'checkmark-circle-outline' as const, label: 'Confirmation', sub: 'Ask for yes/no approval', color: colors.primary, bg: colors.primaryLight },
              { icon: 'bar-chart-outline' as const, label: 'Vote', sub: 'Create a poll', color: colors.success, bg: colors.successLight },
              { icon: 'list-outline' as const, label: 'Choice', sub: 'Multiple choice selection', color: colors.warning, bg: colors.warningLight },
              { icon: 'document-text-outline' as const, label: 'Form', sub: 'Structured data form', color: colors.primary, bg: colors.primaryLight },
              { icon: 'card-outline' as const, label: 'Card', sub: 'Rich card with actions', color: colors.textSecondary, bg: colors.surface },
              { icon: 'analytics-outline' as const, label: 'Chart', sub: 'Data visualization', color: colors.success, bg: colors.successLight },
            ].map((item, i, arr) => (
              <TouchableOpacity
                key={item.label}
                style={[styles.plusMenuRow, i < arr.length - 1 ? { borderBottomColor: colors.borderLight } : {}]}
                onPress={() => {
                  setShowPlusMenu(false);
                  // Component types are handled by AI agents — inform user
                  Alert.alert('Coming Soon', `${item.label} components are created by AI agents in the conversation.`);
                }}
                activeOpacity={0.6}
              >
                <View style={[styles.plusMenuIcon, { backgroundColor: item.bg }]}><Ionicons name={item.icon} size={20} color={item.color} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.plusMenuLabel, { color: colors.text }]}>{item.label}</Text>
                  <Text style={[styles.plusMenuSub, { color: colors.textMuted }]}>{item.sub}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Attachments menu modal (paperclip button) */}
      <Modal visible={showAttachMenu} transparent animationType="fade" onRequestClose={() => setShowAttachMenu(false)}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowAttachMenu(false)}
        >
          <View style={[styles.plusMenuCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.plusMenuTitle, { color: colors.text }]}>Attachments</Text>
            <TouchableOpacity style={[styles.plusMenuRow, { borderBottomColor: colors.borderLight }]} onPress={() => { setShowAttachMenu(false); handlePickImage(); }} activeOpacity={0.6}>
              <View style={[styles.plusMenuIcon, { backgroundColor: colors.primaryLight }]}><Ionicons name="image-outline" size={20} color={colors.primary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.plusMenuLabel, { color: colors.text }]}>Photo Library</Text>
                <Text style={[styles.plusMenuSub, { color: colors.textMuted }]}>Choose from gallery</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.plusMenuRow, { borderBottomColor: colors.borderLight }]} onPress={() => { setShowAttachMenu(false); handleTakePhoto(); }} activeOpacity={0.6}>
              <View style={[styles.plusMenuIcon, { backgroundColor: colors.successLight }]}><Ionicons name="camera-outline" size={20} color={colors.success} /></View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.plusMenuLabel, { color: colors.text }]}>Camera</Text>
                <Text style={[styles.plusMenuSub, { color: colors.textMuted }]}>Take a new photo</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.plusMenuRow} onPress={() => { setShowAttachMenu(false); handlePickFile(); }} activeOpacity={0.6}>
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
          seenByEntityIds={messageSeenMap[seenInfoMessage.id] || []}
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
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerAvatarWrap: { position: 'relative' },
  headerAvatar: { width: 34, height: 34, borderRadius: 17 },
  headerAvatarFallback: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  headerOnlineDot: { position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
  headerTitle: { fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  headerSubtitle: { fontSize: fontSize.xs },
  settingsBtn: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },

  // Messages list
  messagesList: { paddingHorizontal: spacing.md, paddingBottom: spacing['2xl'], paddingTop: spacing.sm },
  emptyList: { flexGrow: 1, justifyContent: 'center' },
  emptyChat: { alignItems: 'center' },
  emptyChatIcon: { marginBottom: spacing.sm },
  emptyChatText: { fontSize: fontSize.sm },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Message rows
  messageRow: { marginTop: spacing.xs },
  messageRowOwn: { alignItems: 'flex-end' },
  messageRowOther: { alignItems: 'flex-start' },
  messageRowWithAvatar: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xs },
  msgAvatarWrap: { marginBottom: 2 },
  msgAvatar: { width: 28, height: 28, borderRadius: 14 },
  msgAvatarFallback: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  msgAvatarSpacer: { width: 28 },

  senderName: { fontSize: fontSize.xs, fontWeight: fontWeight.medium, marginBottom: 2, marginLeft: spacing.xs },

  // Bubble
  bubble: { borderRadius: borderRadius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, alignSelf: 'flex-start' },
  bubbleOwn: { borderBottomRightRadius: borderRadius.sm },
  bubbleOther: { borderBottomLeftRadius: borderRadius.sm, borderWidth: StyleSheet.hairlineWidth },
  bubbleOwnInteractive: { borderRadius: borderRadius.lg, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  bubbleOtherInteractive: { borderRadius: borderRadius.lg, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.md },

  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: spacing.xs },
  timeText: { fontSize: 10 },
  seenCheck: { fontSize: 10, fontWeight: '600' },

  // Reply banner (above bubble, Vite app style)
  replyBannerAbove: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
    paddingHorizontal: spacing.xs,
    maxWidth: '100%',
  },
  replyBannerName: { fontSize: 11, fontWeight: fontWeight.medium, marginRight: 4, flexShrink: 0 },
  replyBannerSnippet: { fontSize: 11, flex: 1 },

  // System
  systemContainer: { paddingVertical: spacing.xs },

  // Status bar (typing indicator)
  statusBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.xs },
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
    width: 32,
    height: 32,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    minHeight: 36,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
  },
  recordingText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: '#ef4444',
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
