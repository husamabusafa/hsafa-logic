import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, type ViewStyle } from 'react-native';
import { useTheme, borderRadius, spacing } from '../lib/theme';

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

function SkeletonBox({ width = '100%', height = 16, borderRadius: br = borderRadius.md, style }: SkeletonProps) {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        { width: width as any, height, borderRadius: br, backgroundColor: colors.border, opacity },
        style,
      ]}
    />
  );
}

export function ListItemSkeleton() {
  return (
    <View style={styles.listItem}>
      <SkeletonBox width={44} height={44} borderRadius={borderRadius.lg} />
      <View style={styles.listItemText}>
        <SkeletonBox width="60%" height={14} />
        <SkeletonBox width="40%" height={10} style={{ marginTop: 6 }} />
      </View>
    </View>
  );
}

export function ListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <View style={styles.listContainer}>
      {Array.from({ length: count }).map((_, i) => (
        <ListItemSkeleton key={i} />
      ))}
    </View>
  );
}

export function DetailSkeleton() {
  return (
    <View style={styles.detailContainer}>
      <View style={styles.detailHeader}>
        <SkeletonBox width={80} height={80} borderRadius={borderRadius.xl} />
        <SkeletonBox width={120} height={14} style={{ marginTop: spacing.md }} />
      </View>
      <View style={styles.detailSection}>
        <SkeletonBox width="30%" height={10} />
        <SkeletonBox height={40} style={{ marginTop: spacing.sm }} />
        <SkeletonBox width="30%" height={10} style={{ marginTop: spacing.lg }} />
        <SkeletonBox height={72} style={{ marginTop: spacing.sm }} />
      </View>
    </View>
  );
}

export { SkeletonBox };

const styles = StyleSheet.create({
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  listItemText: { flex: 1 },
  listContainer: { paddingTop: spacing.sm },
  detailContainer: { padding: spacing.lg, gap: spacing.xl },
  detailHeader: { alignItems: 'center' },
  detailSection: { gap: spacing.xs },
});
