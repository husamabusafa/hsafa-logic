import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { spacesApi, type SmartSpace } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { useTheme, spacing, fontSize, fontWeight, borderRadius } from '../lib/theme';
import { haptic } from '../lib/haptics';
import type { Message } from '../lib/types';

interface Props {
  message: Message;
  currentSpaceId: string;
  onClose: () => void;
  onForwarded?: () => void;
}

export function ForwardMessageModal({ message, currentSpaceId, onClose, onForwarded }: Props) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [spaces, setSpaces] = useState<SmartSpace[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    spacesApi.list().then(({ smartSpaces }) => {
      setSpaces(smartSpaces.filter((s) => s.id !== currentSpaceId));
    }).catch(() => {
      Alert.alert('Error', 'Failed to load spaces');
    }).finally(() => setLoading(false));
  }, [currentSpaceId]);

  const preview = message.content || message.title || message.formTitle || message.cardTitle || message.imageCaption || message.fileName || 'Message';

  const filtered = spaces.filter((s) =>
    (s.name || '').toLowerCase().includes(search.toLowerCase()),
  );

  const toggleSpace = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const buildPayload = () => {
    const base: { content: string; type: string; metadata: Record<string, unknown> } = {
      content: message.content || '',
      type: message.type,
      metadata: {},
    };
    switch (message.type) {
      case 'voice':
        base.metadata = { type: 'voice', payload: { audioUrl: message.audioUrl, audioDuration: message.audioDuration, transcription: message.transcription } };
        break;
      case 'image':
        base.metadata = { type: 'image', payload: { imageUrl: message.imageUrl, caption: message.imageCaption } };
        break;
      case 'video':
        base.metadata = { type: 'video', payload: { videoUrl: message.videoUrl, duration: message.videoDuration } };
        break;
      case 'file':
        base.metadata = { type: 'file', payload: { fileUrl: message.fileUrl, fileName: message.fileName, fileMimeType: message.fileMimeType, fileSize: message.fileSize } };
        break;
      default:
        base.metadata = { type: message.type };
    }
    return base;
  };

  const handleForward = async () => {
    if (selectedIds.size === 0) return;
    setSending(true);
    haptic.medium();
    const payload = buildPayload();
    const errors: string[] = [];
    await Promise.all(
      Array.from(selectedIds).map(async (sid) => {
        try {
          await spacesApi.sendMessage(sid, {
            entityId: user?.entityId ?? '',
            content: payload.content,
            type: payload.type,
            metadata: payload.metadata,
          });
        } catch { errors.push(sid); }
      }),
    );
    setSending(false);
    if (errors.length > 0) {
      Alert.alert('Error', `Failed to forward to ${errors.length} space(s)`);
    } else {
      haptic.success();
      onForwarded?.();
      onClose();
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
            <Text style={[styles.cancelText, { color: colors.textMuted }]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]}>Forward Message</Text>
          <TouchableOpacity
            onPress={handleForward}
            disabled={selectedIds.size === 0 || sending}
            activeOpacity={0.7}
          >
            {sending ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={[styles.sendText, { color: selectedIds.size > 0 ? colors.primary : colors.textMuted }]}>
                Send{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Preview */}
        <View style={[styles.preview, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <Text style={[styles.previewLabel, { color: colors.textMuted }]}>
            From {message.senderName}
          </Text>
          <Text style={[styles.previewText, { color: colors.text }]} numberOfLines={2}>
            {preview}
          </Text>
        </View>

        {/* Search */}
        <View style={styles.searchRow}>
          <TextInput
            style={[styles.searchInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
            placeholder="Search spaces..."
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
          />
        </View>

        {/* Space list */}
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              const isSelected = selectedIds.has(item.id);
              return (
                <TouchableOpacity
                  style={[styles.spaceRow, isSelected && { backgroundColor: colors.primary + '12' }]}
                  onPress={() => toggleSpace(item.id)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.spaceIcon, { backgroundColor: colors.primaryLight }]}>
                    <Text style={{ fontSize: 16 }}>💬</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.spaceName, { color: colors.text }]} numberOfLines={1}>
                      {item.name || 'Unnamed'}
                    </Text>
                    <Text style={[styles.spaceMeta, { color: colors.textMuted }]}>
                      {item.members?.length ?? 0} members
                    </Text>
                  </View>
                  {isSelected && (
                    <View style={[styles.checkCircle, { backgroundColor: colors.primary }]}>
                      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>✓</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            }}
            contentContainerStyle={filtered.length === 0 ? styles.center : undefined}
            ListEmptyComponent={
              <View style={styles.emptyList}>
                <Text style={{ color: colors.textMuted, fontSize: fontSize.sm }}>
                  {spaces.length === 0 ? 'No other spaces to forward to' : 'No spaces match your search'}
                </Text>
              </View>
            }
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 50 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cancelText: { fontSize: fontSize.sm },
  title: { fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  sendText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },

  preview: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  previewLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  previewText: { fontSize: fontSize.sm },

  searchRow: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  searchInput: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.sm,
  },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  spaceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  spaceIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spaceName: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  spaceMeta: { fontSize: fontSize.xs },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyList: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
});
