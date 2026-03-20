import React, { useRef, type ReactNode } from 'react';
import { View, StyleSheet, Animated, PanResponder, type GestureResponderEvent, type PanResponderGestureState } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface SwipeableRowProps {
  children: ReactNode;
  onSwipeRight?: () => void;
  enabled?: boolean;
  iconColor?: string;
}

const SWIPE_THRESHOLD = 80;
const MAX_TRANSLATE = 100;

export function SwipeableRow({ children, onSwipeRight, enabled = true, iconColor = '#999' }: SwipeableRowProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  const hasTriggered = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        if (!enabled || !onSwipeRight) return false;
        // Only respond to horizontal movement greater than vertical
        return Math.abs(gestureState.dx) > Math.abs(gestureState.dy) && Math.abs(gestureState.dx) > 10;
      },
      onPanResponderMove: (_, gestureState) => {
        // Only allow right swipe (positive dx)
        if (gestureState.dx > 0) {
          const clamped = Math.min(gestureState.dx, MAX_TRANSLATE);
          translateX.setValue(clamped);

          // Trigger haptic when crossing threshold
          if (clamped >= SWIPE_THRESHOLD && !hasTriggered.current) {
            hasTriggered.current = true;
          }
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx >= SWIPE_THRESHOLD && onSwipeRight) {
          // Trigger the callback
          onSwipeRight();
        }
        // Reset position
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          friction: 8,
          tension: 40,
        }).start(() => {
          hasTriggered.current = false;
        });
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          friction: 8,
          tension: 40,
        }).start(() => {
          hasTriggered.current = false;
        });
      },
    })
  ).current;

  const animatedStyle = {
    transform: [{ translateX: translateX }],
  };

  // Interpolate opacity for the icon based on translateX
  const iconOpacity = translateX.interpolate({
    inputRange: [0, SWIPE_THRESHOLD],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const iconScale = translateX.interpolate({
    inputRange: [0, SWIPE_THRESHOLD],
    outputRange: [0.5, 1],
    extrapolate: 'clamp',
  });

  if (!enabled || !onSwipeRight) {
    return <>{children}</>;
  }

  return (
    <View style={styles.container}>
      {/* Reply icon behind the row */}
      <View style={styles.iconContainer}>
        <Animated.View style={{ opacity: iconOpacity, transform: [{ scale: iconScale }] }}>
          <Ionicons name="arrow-undo" size={20} color={iconColor} />
        </Animated.View>
      </View>
      {/* Actual message content */}
      <Animated.View style={[animatedStyle]} {...panResponder.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  iconContainer: {
    position: 'absolute',
    left: 12,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    width: 40,
    zIndex: 0,
  },
});
