import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { useTheme, spacing, fontSize, fontWeight, borderRadius } from '../../lib/theme';
import { resolveMediaUrl } from '../../lib/api';
import type { Message } from '../../lib/types';

// =============================================================================
// Renders message content based on type
// =============================================================================

interface Props {
  message: Message;
  isOwn: boolean;
  currentEntityId?: string;
  onRespond?: (messageId: string, value: unknown) => void;
}

export function MessageRenderer({ message, isOwn, currentEntityId, onRespond }: Props) {
  if (message.attachments && message.attachments.length > 0) {
    return <AttachmentsContent message={message} isOwn={isOwn} />;
  }

  switch (message.type) {
    case 'text':
      return <TextContent message={message} isOwn={isOwn} />;
    case 'confirmation':
      return <ConfirmationContent message={message} isOwn={isOwn} currentEntityId={currentEntityId} onRespond={onRespond} />;
    case 'vote':
      return <VoteContent message={message} isOwn={isOwn} currentEntityId={currentEntityId} onRespond={onRespond} />;
    case 'choice':
      return <ChoiceContent message={message} isOwn={isOwn} currentEntityId={currentEntityId} onRespond={onRespond} />;
    case 'form':
      return <FormContent message={message} isOwn={isOwn} />;
    case 'card':
      return <CardContent message={message} isOwn={isOwn} currentEntityId={currentEntityId} onRespond={onRespond} />;
    case 'image':
      return <ImageContent message={message} isOwn={isOwn} />;
    case 'voice':
      return <VoiceContent message={message} isOwn={isOwn} />;
    case 'file':
      return <FileContent message={message} isOwn={isOwn} />;
    case 'video':
      return <VideoContent message={message} isOwn={isOwn} />;
    case 'chart':
      return <ChartContent message={message} isOwn={isOwn} />;
    case 'system':
      return <SystemContent message={message} />;
    default:
      return <TextContent message={message} isOwn={isOwn} />;
  }
}

// =============================================================================
// Text
// =============================================================================

function TextContent({ message, isOwn }: { message: Message; isOwn: boolean }) {
  const { colors } = useTheme();
  // Safeguard: content might be an object (e.g., {model, provider}) from AI responses
  const content = typeof message.content === 'string'
    ? message.content
    : typeof message.content === 'object' && message.content !== null
      ? JSON.stringify(message.content)
      : String(message.content ?? '');
  return (
    <Text style={{ color: isOwn ? colors.messageMineFg : colors.messageOtherFg, fontSize: fontSize.sm, lineHeight: 20 }}>
      {content}
    </Text>
  );
}

// =============================================================================
// System
// =============================================================================

function SystemContent({ message }: { message: Message }) {
  const { colors } = useTheme();
  // Safeguard: content might be an object
  const content = typeof message.content === 'string'
    ? message.content
    : typeof message.content === 'object' && message.content !== null
      ? JSON.stringify(message.content)
      : String(message.content ?? '');
  return (
    <View style={styles.systemRow}>
      <View style={[styles.systemLine, { backgroundColor: colors.border }]} />
      <Text style={[styles.systemText, { color: colors.textMuted }]}>{content}</Text>
      <View style={[styles.systemLine, { backgroundColor: colors.border }]} />
    </View>
  );
}

// =============================================================================
// Confirmation
// =============================================================================

function ConfirmationContent({ message, isOwn, currentEntityId, onRespond }: Props) {
  const { colors } = useTheme();
  const isClosed = message.status === 'closed';
  const allowUpdate = message.allowUpdate !== false;
  const myResponse = message.responseSummary?.responses?.find((r) => r.entityId === currentEntityId);
  const myChoice = myResponse?.value as string | undefined;
  const hasResponded = !!myChoice;

  return (
    <View style={styles.interactiveContent}>
      <Text style={[styles.interactiveTitle, { color: colors.text }]}>{message.title}</Text>
      {message.message && (
        <Text style={[styles.interactiveBody, { color: colors.textSecondary }]}>{message.message}</Text>
      )}
      {!isClosed && (
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[
              styles.interactiveBtn,
              myChoice === 'confirmed'
                ? { backgroundColor: colors.success }
                : { backgroundColor: colors.successLight, borderWidth: 1, borderColor: colors.success + '30' },
            ]}
            onPress={() => onRespond?.(message.id, 'confirmed')}
            disabled={hasResponded && !allowUpdate}
            activeOpacity={0.7}
          >
            <Text style={[styles.interactiveBtnText, { color: myChoice === 'confirmed' ? '#fff' : colors.success }]}>
              {message.confirmLabel || 'Confirm'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.interactiveBtn,
              myChoice === 'rejected'
                ? { backgroundColor: colors.error }
                : { backgroundColor: colors.errorLight, borderWidth: 1, borderColor: colors.error + '30' },
            ]}
            onPress={() => onRespond?.(message.id, 'rejected')}
            disabled={hasResponded && !allowUpdate}
            activeOpacity={0.7}
          >
            <Text style={[styles.interactiveBtnText, { color: myChoice === 'rejected' ? '#fff' : colors.error }]}>
              {message.rejectLabel || 'Cancel'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
      <ResponseCount summary={message.responseSummary} />
    </View>
  );
}

// =============================================================================
// Vote
// =============================================================================

function VoteContent({ message, isOwn, currentEntityId, onRespond }: Props) {
  const { colors } = useTheme();
  const total = message.responseSummary?.totalResponses ?? 0;
  const counts = (message.responseSummary?.counts ?? {}) as Record<string, number>;
  const myResponse = message.responseSummary?.responses?.find((r) => r.entityId === currentEntityId);
  const myVotes = (myResponse?.value as string[] | string) || [];
  const myVoteArray = Array.isArray(myVotes) ? myVotes : [myVotes];

  return (
    <View style={styles.interactiveContent}>
      <Text style={[styles.interactiveTitle, { color: colors.text }]}>{message.title}</Text>
      {(message.options ?? []).map((option) => {
        const count = counts[option] ?? 0;
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        const isMyVote = myVoteArray.includes(option);
        return (
          <TouchableOpacity
            key={option}
            style={[styles.voteBar, { backgroundColor: colors.surface, borderColor: isMyVote ? colors.primary : colors.border, borderWidth: 1 }]}
            onPress={() => onRespond?.(message.id, option)}
            activeOpacity={0.7}
          >
            <View style={[styles.voteBarFill, { width: `${pct}%` as any, backgroundColor: isMyVote ? colors.primary + '25' : colors.primaryLight }]} />
            <Text style={[styles.voteLabel, { color: colors.text }]} numberOfLines={1}>{option}</Text>
            <Text style={[styles.votePct, { color: colors.textMuted }]}>{pct}%</Text>
          </TouchableOpacity>
        );
      })}
      <ResponseCount summary={message.responseSummary} />
    </View>
  );
}

// =============================================================================
// Choice
// =============================================================================

function ChoiceContent({ message, isOwn, currentEntityId, onRespond }: Props) {
  const { colors } = useTheme();
  const myResponse = message.responseSummary?.responses?.find((r) => r.entityId === currentEntityId);
  const myChoice = myResponse?.value as string | undefined;
  const allowUpdate = message.allowUpdate !== false;
  const hasResponded = !!myChoice;

  return (
    <View style={styles.interactiveContent}>
      <Text style={[styles.interactiveTitle, { color: colors.text }]}>{message.title}</Text>
      <View style={styles.choiceGrid}>
        {(message.choiceOptions ?? []).map((opt) => {
          const isSelected = myChoice === opt.value;
          const isPrimary = opt.style === 'primary';
          const isDanger = opt.style === 'danger';
          return (
            <TouchableOpacity
              key={opt.value}
              style={[
                styles.choiceBtn,
                {
                  backgroundColor: isSelected
                    ? (isDanger ? colors.error : colors.primary)
                    : colors.surface,
                  borderColor: isSelected
                    ? 'transparent'
                    : (isDanger ? colors.error + '30' : isPrimary ? colors.primary + '30' : colors.border),
                  borderWidth: 1,
                },
              ]}
              onPress={() => onRespond?.(message.id, opt.value)}
              disabled={hasResponded && !allowUpdate}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.choiceBtnText,
                  { color: isSelected ? '#fff' : (isDanger ? colors.error : isPrimary ? colors.primary : colors.text) },
                ]}
                numberOfLines={1}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <ResponseCount summary={message.responseSummary} />
    </View>
  );
}

// =============================================================================
// Form (simplified — shows title + description)
// =============================================================================

function FormContent({ message, isOwn }: { message: Message; isOwn: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={styles.interactiveContent}>
      <Text style={[styles.interactiveTitle, { color: colors.text }]}>{message.formTitle}</Text>
      {message.formDescription && (
        <Text style={[styles.interactiveBody, { color: colors.textSecondary }]}>{message.formDescription}</Text>
      )}
      <View style={[styles.formFieldsHint, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.formFieldsHintText, { color: colors.textMuted }]}>
          {(message.formFields?.length ?? 0)} field{(message.formFields?.length ?? 0) !== 1 ? 's' : ''} — tap to fill
        </Text>
      </View>
      <ResponseCount summary={message.responseSummary} />
    </View>
  );
}

// =============================================================================
// Card
// =============================================================================

function CardContent({ message, isOwn, currentEntityId, onRespond }: Props) {
  const { colors } = useTheme();
  const imgUrl = resolveMediaUrl(message.cardImageUrl ?? null);
  const myResponse = message.responseSummary?.responses?.find((r) => r.entityId === currentEntityId);
  const myAction = myResponse?.value as string | undefined;

  return (
    <View style={styles.interactiveContent}>
      {imgUrl && (
        <Image source={{ uri: imgUrl }} style={styles.cardImage} resizeMode="cover" />
      )}
      <Text style={[styles.interactiveTitle, { color: colors.text }]}>{message.cardTitle}</Text>
      {message.cardBody && (
        <Text style={[styles.interactiveBody, { color: colors.textSecondary }]}>{message.cardBody}</Text>
      )}
      {message.cardActions && message.cardActions.length > 0 && (
        <View style={styles.buttonRow}>
          {message.cardActions.map((action) => {
            const isSelected = myAction === action.value;
            const isPrimary = action.style === 'primary';
            const isDanger = action.style === 'danger';
            return (
              <TouchableOpacity
                key={action.value}
                style={[
                  styles.interactiveBtn,
                  {
                    backgroundColor: isSelected
                      ? (isDanger ? colors.error : colors.primary)
                      : (isDanger ? colors.errorLight : isPrimary ? colors.primaryLight : colors.surface),
                    borderWidth: isSelected ? 0 : 1,
                    borderColor: isDanger ? colors.error + '30' : isPrimary ? colors.primary + '30' : colors.border,
                  },
                ]}
                onPress={() => onRespond?.(message.id, action.value)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.interactiveBtnText,
                    { color: isSelected ? '#fff' : (isDanger ? colors.error : isPrimary ? colors.primary : colors.text) },
                  ]}
                  numberOfLines={1}
                >
                  {action.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
      <ResponseCount summary={message.responseSummary} />
    </View>
  );
}

// =============================================================================
// Image
// =============================================================================

function ImageContent({ message, isOwn }: { message: Message; isOwn: boolean }) {
  const { colors } = useTheme();
  const url = resolveMediaUrl(message.imageUrl ?? null);
  if (!url) return <TextContent message={message} isOwn={isOwn} />;

  return (
    <View>
      <Image source={{ uri: url }} style={styles.imageMsg} resizeMode="cover" />
      {message.imageCaption ? (
        <Text style={{ color: isOwn ? colors.messageMineFg : colors.messageOtherFg, fontSize: fontSize.sm, marginTop: spacing.xs }}>
          {message.imageCaption}
        </Text>
      ) : null}
    </View>
  );
}

// =============================================================================
// Voice
// =============================================================================

function VoiceContent({ message, isOwn }: { message: Message; isOwn: boolean }) {
  const { colors } = useTheme();
  const totalDuration = message.audioDuration ?? 0;
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentPos, setCurrentPos] = useState(0);
  const soundRef = useRef<Audio.Sound | null>(null);

  // Stable waveform bars seeded from message id
  const bars = useMemo(() => {
    const result: number[] = [];
    let seed = 0;
    for (let i = 0; i < message.id.length; i++) seed = ((seed << 5) - seed + message.id.charCodeAt(i)) | 0;
    for (let i = 0; i < 24; i++) {
      seed = (seed * 16807 + 0) % 2147483647;
      result.push(4 + (Math.abs(seed) % 15));
    }
    return result;
  }, [message.id]);

  useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync().catch(() => {});
    };
  }, []);

  const togglePlayback = useCallback(async () => {
    const url = resolveMediaUrl(message.audioUrl ?? null);
    if (!url) {
      console.warn('[VoiceContent] No audio URL for message', message.id);
      return;
    }

    try {
      if (isPlaying && soundRef.current) {
        await soundRef.current.pauseAsync();
        setIsPlaying(false);
        return;
      }

      if (soundRef.current) {
        // Check if sound is still loaded before replaying
        const status = await soundRef.current.getStatusAsync();
        if (status.isLoaded) {
          await soundRef.current.playAsync();
          setIsPlaying(true);
          return;
        }
        // Sound was unloaded, fall through to create new
        soundRef.current = null;
      }

      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        allowsRecordingIOS: false,
        staysActiveInBackground: false,
      });

      const { sound } = await Audio.Sound.createAsync(
        { uri: url },
        { shouldPlay: true, progressUpdateIntervalMillis: 100 },
        (status) => {
          if (!status.isLoaded) return;
          if (status.durationMillis && status.durationMillis > 0) {
            setProgress(status.positionMillis / status.durationMillis);
            setCurrentPos(status.positionMillis / 1000);
          }
          if (status.didJustFinish) {
            setIsPlaying(false);
            setProgress(0);
            setCurrentPos(0);
            soundRef.current?.setPositionAsync(0).catch(() => {});
          }
        },
      );
      soundRef.current = sound;
      setIsPlaying(true);
    } catch (err) {
      console.warn('[VoiceContent] Playback error:', err);
      setIsPlaying(false);
    }
  }, [isPlaying, message.audioUrl, message.id]);

  const displayDuration = isPlaying ? currentPos : totalDuration;
  const mins = Math.floor(displayDuration / 60);
  const secs = Math.floor(displayDuration % 60);
  const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;

  const activeBarColor = isOwn ? 'rgba(255,255,255,0.85)' : colors.primary;
  const inactiveBarColor = isOwn ? 'rgba(255,255,255,0.35)' : colors.primary + '40';
  const activeBarIndex = Math.floor(progress * bars.length);

  return (
    <View>
      <View style={styles.voiceRow}>
        <TouchableOpacity
          onPress={togglePlayback}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={[styles.voicePlayBtn, { backgroundColor: isOwn ? 'rgba(255,255,255,0.2)' : colors.primaryLight }]}
        >
          <Ionicons name={isPlaying ? 'pause' : 'play'} size={18} color={isOwn ? colors.messageMineFg : colors.primary} />
        </TouchableOpacity>
        <View style={styles.voiceWaveform}>
          {bars.map((h, i) => (
            <View
              key={i}
              style={[
                styles.voiceBar,
                {
                  height: h,
                  backgroundColor: i <= activeBarIndex ? activeBarColor : inactiveBarColor,
                },
              ]}
            />
          ))}
        </View>
        <Text style={{ color: isOwn ? 'rgba(255,255,255,0.7)' : colors.textMuted, fontSize: fontSize.xs }}>{timeStr}</Text>
      </View>
      {message.transcription && (
        <Text style={{ color: isOwn ? 'rgba(255,255,255,0.8)' : colors.textSecondary, fontSize: fontSize.xs, fontStyle: 'italic', marginTop: spacing.xs }}>
          {message.transcription}
        </Text>
      )}
    </View>
  );
}

// =============================================================================
// File
// =============================================================================

function getFileIcon(fileName: string | undefined, mimeType: string | undefined): keyof typeof Ionicons.glyphMap {
  const ext = (fileName || '').split('.').pop()?.toLowerCase() || '';
  const mime = (mimeType || '').toLowerCase();
  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'image-outline';
  if (mime.startsWith('video/') || ['mp4', 'mov', 'avi', 'webm'].includes(ext)) return 'videocam-outline';
  if (mime.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) return 'musical-notes-outline';
  if (mime === 'application/pdf' || ext === 'pdf') return 'document-text-outline';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'archive-outline';
  if (['js', 'ts', 'py', 'java', 'cpp', 'json', 'html', 'css', 'xml'].includes(ext)) return 'code-slash-outline';
  return 'document-outline';
}

function FileContent({ message, isOwn }: { message: Message; isOwn: boolean }) {
  const { colors } = useTheme();
  const sizeStr = message.fileSize ? formatFileSize(message.fileSize) : '';
  const fileUrl = resolveMediaUrl(message.fileUrl ?? null);
  const iconName = getFileIcon(message.fileName, message.fileMimeType);

  const handlePress = () => {
    if (fileUrl) Linking.openURL(fileUrl).catch(() => {});
  };

  return (
    <TouchableOpacity
      style={[styles.fileRow, { backgroundColor: isOwn ? 'rgba(255,255,255,0.1)' : colors.surface, borderColor: isOwn ? 'rgba(255,255,255,0.15)' : colors.border }]}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      <View style={[styles.fileIcon, { backgroundColor: isOwn ? 'rgba(255,255,255,0.15)' : colors.primaryLight }]}>
        <Ionicons name={iconName} size={18} color={isOwn ? colors.messageMineFg : colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: isOwn ? colors.messageMineFg : colors.text, fontSize: fontSize.sm, fontWeight: fontWeight.medium }} numberOfLines={1}>
          {message.fileName || 'File'}
        </Text>
        {sizeStr ? (
          <Text style={{ color: isOwn ? 'rgba(255,255,255,0.6)' : colors.textMuted, fontSize: fontSize.xs }}>{sizeStr}</Text>
        ) : null}
      </View>
      <Ionicons name="download-outline" size={16} color={isOwn ? 'rgba(255,255,255,0.6)' : colors.textMuted} />
    </TouchableOpacity>
  );
}

// =============================================================================
// Video
// =============================================================================

function VideoContent({ message, isOwn }: { message: Message; isOwn: boolean }) {
  const { colors } = useTheme();
  const thumbnailUrl = resolveMediaUrl(message.videoThumbnailUrl ?? null);
  const duration = message.videoDuration ?? 0;
  const mins = Math.floor(duration / 60);
  const secs = Math.floor(duration % 60);
  const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;

  return (
    <View>
      <View style={[styles.videoContainer, { backgroundColor: isOwn ? 'rgba(255,255,255,0.1)' : colors.surface }]}>
        {thumbnailUrl ? (
          <Image source={{ uri: thumbnailUrl }} style={styles.videoThumb} resizeMode="cover" />
        ) : (
          <View style={[styles.videoThumb, { backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }]}>
            <Ionicons name="videocam-outline" size={32} color={colors.textMuted} />
          </View>
        )}
        <View style={styles.videoPlayOverlay}>
          <View style={[styles.videoPlayBtn, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
            <Ionicons name="play" size={20} color="#fff" />
          </View>
        </View>
        <View style={[styles.videoDuration, { backgroundColor: 'rgba(0,0,0,0.6)' }]}>
          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '600' }}>{timeStr}</Text>
        </View>
      </View>
    </View>
  );
}

// =============================================================================
// Chart (simplified bar/pie/line placeholder)
// =============================================================================

function ChartContent({ message, isOwn }: { message: Message; isOwn: boolean }) {
  const { colors } = useTheme();
  const data = message.chartData ?? [];
  const maxVal = Math.max(...data.map((d) => d.value), 1);

  return (
    <View style={styles.interactiveContent}>
      {message.chartTitle && (
        <Text style={[styles.interactiveTitle, { color: colors.text }]}>{message.chartTitle}</Text>
      )}
      {message.chartType === 'pie' ? (
        <View style={styles.chartPieRow}>
          {data.map((d, i) => (
            <View key={i} style={styles.chartPieItem}>
              <View style={[styles.chartPieDot, { backgroundColor: d.color || colors.primary }]} />
              <Text style={[styles.chartPieLabel, { color: colors.text }]} numberOfLines={1}>{d.label}</Text>
              <Text style={[styles.chartPieValue, { color: colors.textMuted }]}>{d.value}</Text>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.chartBars}>
          {data.map((d, i) => {
            const pct = Math.round((d.value / maxVal) * 100);
            return (
              <View key={i} style={styles.chartBarRow}>
                <Text style={[styles.chartBarLabel, { color: colors.textMuted }]} numberOfLines={1}>{d.label}</Text>
                <View style={[styles.chartBarTrack, { backgroundColor: colors.surface }]}>
                  <View style={[styles.chartBarFill, { width: `${pct}%` as any, backgroundColor: d.color || colors.primary }]} />
                </View>
                <Text style={[styles.chartBarValue, { color: colors.text }]}>{d.value}</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

// =============================================================================
// Attachments (multi-file)
// =============================================================================

function AttachmentsContent({ message, isOwn }: { message: Message; isOwn: boolean }) {
  const { colors } = useTheme();

  return (
    <View>
      {message.content ? (
        <Text style={{ color: isOwn ? colors.messageMineFg : colors.messageOtherFg, fontSize: fontSize.sm, marginBottom: spacing.sm }}>
          {typeof message.content === 'string' ? message.content : JSON.stringify(message.content)}
        </Text>
      ) : null}
      {(message.attachments ?? []).map((att, i) => {
        const url = resolveMediaUrl(att.url);
        if (att.type === 'image' && url) {
          return <Image key={i} source={{ uri: url }} style={styles.attachImage} resizeMode="cover" />;
        }
        return (
          <View key={i} style={[styles.fileRow, { backgroundColor: isOwn ? 'rgba(255,255,255,0.1)' : colors.surface, borderColor: isOwn ? 'rgba(255,255,255,0.15)' : colors.border, marginTop: spacing.xs }]}>
            <View style={[styles.fileIcon, { backgroundColor: isOwn ? 'rgba(255,255,255,0.15)' : colors.primaryLight }]}>
              <Ionicons name="document-outline" size={18} color={isOwn ? colors.messageMineFg : colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: isOwn ? colors.messageMineFg : colors.text, fontSize: fontSize.sm, fontWeight: fontWeight.medium }} numberOfLines={1}>
                {att.fileName}
              </Text>
              <Text style={{ color: isOwn ? 'rgba(255,255,255,0.6)' : colors.textMuted, fontSize: fontSize.xs }}>
                {formatFileSize(att.fileSize)}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

// =============================================================================
// Response count helper
// =============================================================================

function ResponseCount({ summary }: { summary?: Message['responseSummary'] }) {
  const { colors } = useTheme();
  const total = summary?.totalResponses ?? 0;
  if (total === 0) return null;
  return (
    <Text style={[styles.responseCount, { color: colors.textMuted }]}>
      {total} response{total !== 1 ? 's' : ''}
    </Text>
  );
}

// =============================================================================
// Helpers
// =============================================================================

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

// =============================================================================
// Styles
// =============================================================================

const styles = StyleSheet.create({
  // System
  systemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, gap: spacing.sm },
  systemLine: { flex: 1, height: StyleSheet.hairlineWidth },
  systemText: { fontSize: fontSize.xs, textAlign: 'center' },

  // Interactive common
  interactiveContent: { gap: spacing.sm },
  interactiveTitle: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  interactiveBody: { fontSize: fontSize.sm, lineHeight: 20 },
  buttonRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  interactiveBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    minWidth: 80,
    alignItems: 'center',
  },
  interactiveBtnText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold },
  responseCount: { fontSize: fontSize.xs, marginTop: spacing.xs },

  // Vote
  voteBar: { flexDirection: 'row', alignItems: 'center', borderRadius: borderRadius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginTop: spacing.xs, overflow: 'hidden' },
  voteBarFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: borderRadius.sm },
  voteLabel: { flex: 1, fontSize: fontSize.sm, zIndex: 1 },
  votePct: { fontSize: fontSize.xs, fontWeight: fontWeight.medium, zIndex: 1 },

  // Choice
  choiceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  choiceBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: borderRadius.md },
  choiceBtnText: { fontSize: fontSize.xs, fontWeight: fontWeight.medium },

  // Form hint
  formFieldsHint: { borderRadius: borderRadius.md, borderWidth: 1, padding: spacing.md, alignItems: 'center' },
  formFieldsHintText: { fontSize: fontSize.xs },

  // Card
  cardImage: { width: '100%', height: 140, borderRadius: borderRadius.md, marginBottom: spacing.sm },

  // Image
  imageMsg: { width: '100%', height: 200, borderRadius: borderRadius.md },

  // Voice
  voiceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  voicePlayBtn: { width: 40, height: 40, borderRadius: borderRadius.full, alignItems: 'center', justifyContent: 'center' },
  voiceWaveform: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 1.5, height: 22 },
  voiceBar: { width: 2, borderRadius: 1 },

  // File
  fileRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.sm, borderRadius: borderRadius.md, borderWidth: 1, gap: spacing.sm },
  fileIcon: { width: 36, height: 36, borderRadius: borderRadius.sm, alignItems: 'center', justifyContent: 'center' },

  // Video
  videoContainer: { width: '100%', height: 180, borderRadius: borderRadius.md, overflow: 'hidden', position: 'relative' },
  videoThumb: { width: '100%', height: '100%', borderRadius: borderRadius.md },
  videoPlayOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  videoPlayBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  videoDuration: { position: 'absolute', bottom: spacing.xs, right: spacing.xs, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },

  // Chart
  chartPieRow: { gap: spacing.xs },
  chartPieItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  chartPieDot: { width: 10, height: 10, borderRadius: 5 },
  chartPieLabel: { flex: 1, fontSize: fontSize.sm },
  chartPieValue: { fontSize: fontSize.xs, fontWeight: fontWeight.medium },
  chartBars: { gap: spacing.sm },
  chartBarRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  chartBarLabel: { width: 60, fontSize: fontSize.xs },
  chartBarTrack: { flex: 1, height: 14, borderRadius: 7, overflow: 'hidden' },
  chartBarFill: { height: '100%', borderRadius: 7 },
  chartBarValue: { width: 36, fontSize: fontSize.xs, fontWeight: fontWeight.medium, textAlign: 'right' },

  // Attachments
  attachImage: { width: '100%', height: 160, borderRadius: borderRadius.md, marginTop: spacing.xs },
});
