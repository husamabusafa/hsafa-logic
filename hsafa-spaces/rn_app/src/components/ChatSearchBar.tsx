import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  Image,
} from 'react-native';
import { resolveMediaUrl } from '../lib/api';
import { useTheme, spacing, fontSize, fontWeight, borderRadius } from '../lib/theme';
import type { Message, Member } from '../lib/types';

interface Props {
  query: string;
  onQueryChange: (q: string) => void;
  messages: Message[];
  members: Member[];
  onSelect: (messageId: string) => void;
  onClose: () => void;
}

export function ChatSearchBar({ query, onQueryChange, messages, members, onSelect, onClose }: Props) {
  const { colors } = useTheme();

  const results = query.trim().length > 0
    ? messages.filter((m) => {
        const text = (m.content || m.title || m.formTitle || m.cardTitle || m.imageCaption || m.fileName || '').toLowerCase();
        return text.includes(query.toLowerCase()) || m.senderName.toLowerCase().includes(query.toLowerCase());
      }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    : [];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Search header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TextInput
          style={[styles.searchInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
          placeholder="Search messages..."
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={onQueryChange}
          autoFocus
          autoCapitalize="none"
          returnKeyType="search"
        />
        <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={styles.closeBtn}>
          <Text style={[styles.closeText, { color: colors.primary }]}>Cancel</Text>
        </TouchableOpacity>
      </View>

      {/* Results */}
      {query.trim().length > 0 && (
        <>
          <View style={[styles.countRow, { borderBottomColor: colors.border }]}>
            <Text style={[styles.countText, { color: colors.textMuted }]}>
              {results.length} result{results.length !== 1 ? 's' : ''}
            </Text>
          </View>
          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              const member = members.find((m) => m.entityId === item.entityId);
              const avatarUrl = resolveMediaUrl(member?.avatarUrl ?? null);
              const text = item.content || item.title || item.formTitle || item.cardTitle || item.imageCaption || item.fileName || 'Message';
              const time = new Date(item.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' });

              return (
                <TouchableOpacity
                  style={styles.resultRow}
                  onPress={() => onSelect(item.id)}
                  activeOpacity={0.7}
                >
                  {avatarUrl ? (
                    <Image source={{ uri: avatarUrl }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatarPlaceholder, { backgroundColor: item.senderType === 'agent' ? colors.successLight : colors.primaryLight }]}>
                      <Text style={{ fontSize: 12 }}>{item.senderType === 'agent' ? '🤖' : '👤'}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <View style={styles.resultHeader}>
                      <Text style={[styles.senderName, { color: colors.text }]}>{item.senderName}</Text>
                      <Text style={[styles.timeText, { color: colors.textMuted }]}>{time}</Text>
                    </View>
                    <Text style={[styles.previewText, { color: colors.textMuted }]} numberOfLines={1}>
                      {text}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            }}
            contentContainerStyle={results.length === 0 ? styles.emptyContainer : undefined}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={{ fontSize: 24 }}>🔍</Text>
                <Text style={[styles.emptyTitle, { color: colors.text }]}>No results found</Text>
                <Text style={[styles.emptySub, { color: colors.textMuted }]}>Try a different search term</Text>
              </View>
            }
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.sm,
  },
  closeBtn: { paddingHorizontal: spacing.sm },
  closeText: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },

  countRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  countText: { fontSize: fontSize.xs, fontWeight: fontWeight.medium },

  resultRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  avatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  senderName: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  timeText: { fontSize: 10 },
  previewText: { fontSize: fontSize.sm, marginTop: 2 },

  emptyContainer: { flexGrow: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', gap: spacing.xs },
  emptyTitle: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  emptySub: { fontSize: fontSize.xs },
});
