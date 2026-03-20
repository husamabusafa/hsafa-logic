import { useColorScheme } from 'react-native';
import { createContext, useContext } from 'react';

// =============================================================================
// Color Palette — matches the web app's design system
// =============================================================================

const lightColors = {
  // Backgrounds
  background: '#ffffff',
  surface: '#f8fafc',
  surfaceHover: '#f1f5f9',
  card: '#ffffff',
  muted: '#f1f5f9',

  // Text
  text: '#0f172a',
  textSecondary: '#64748b',
  textMuted: '#94a3b8',
  textInverse: '#ffffff',

  // Primary
  primary: '#6366f1',
  primaryForeground: '#ffffff',
  primaryLight: '#e0e7ff',

  // Borders
  border: '#e2e8f0',
  borderLight: '#f1f5f9',
  separator: '#e2e8f0',

  // Status
  success: '#22c55e',
  successLight: '#dcfce7',
  error: '#ef4444',
  errorLight: '#fef2f2',
  warning: '#f59e0b',
  warningLight: '#fefce8',
  info: '#3b82f6',
  infoLight: '#dbeafe',

  // Chat
  messageMine: '#6366f1',
  messageMineFg: '#ffffff',
  messageOther: '#f1f5f9',
  messageOtherFg: '#0f172a',
  messageAgent: '#ecfdf5',
  messageAgentFg: '#0f172a',

  // Misc
  overlay: 'rgba(0, 0, 0, 0.5)',
  tabBar: '#ffffff',
  tabBarBorder: '#e2e8f0',
  badge: '#ef4444',
  badgeFg: '#ffffff',
  skeleton: '#e2e8f0',
};

const darkColors: typeof lightColors = {
  // Backgrounds
  background: '#0f172a',
  surface: '#1e293b',
  surfaceHover: '#334155',
  card: '#1e293b',
  muted: '#1e293b',

  // Text
  text: '#f8fafc',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
  textInverse: '#0f172a',

  // Primary
  primary: '#818cf8',
  primaryForeground: '#0f172a',
  primaryLight: '#312e81',

  // Borders
  border: '#334155',
  borderLight: '#1e293b',
  separator: '#334155',

  // Status
  success: '#4ade80',
  successLight: '#052e16',
  error: '#f87171',
  errorLight: '#450a0a',
  warning: '#fbbf24',
  warningLight: '#422006',
  info: '#60a5fa',
  infoLight: '#172554',

  // Chat
  messageMine: '#6366f1',
  messageMineFg: '#ffffff',
  messageOther: '#1e293b',
  messageOtherFg: '#f8fafc',
  messageAgent: '#064e3b',
  messageAgentFg: '#f8fafc',

  // Misc
  overlay: 'rgba(0, 0, 0, 0.7)',
  tabBar: '#0f172a',
  tabBarBorder: '#1e293b',
  badge: '#ef4444',
  badgeFg: '#ffffff',
  skeleton: '#334155',
};

export type ThemeColors = typeof lightColors;

export interface Theme {
  dark: boolean;
  colors: ThemeColors;
}

export function useAppTheme(): Theme {
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  return {
    dark,
    colors: dark ? darkColors : lightColors,
  };
}

// Context for sharing theme across the app
export const ThemeContext = createContext<Theme>({
  dark: false,
  colors: lightColors,
});

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

// =============================================================================
// Spacing & Typography
// =============================================================================

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
} as const;

export const fontSize = {
  xs: 11,
  sm: 13,
  base: 15,
  lg: 17,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
} as const;

export const fontWeight = {
  normal: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};

export const borderRadius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 18,
  full: 9999,
};
