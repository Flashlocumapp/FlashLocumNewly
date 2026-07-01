import { Platform } from 'react-native';

// FlashLocum brand palette — medical/professional
export const COLORS = {
  // Brand
  primary: '#0066CC',
  primaryMuted: 'rgba(0, 102, 204, 0.10)',
  primaryDark: '#0052A3',
  accent: '#00A878',
  accentMuted: 'rgba(0, 168, 120, 0.10)',

  // Semantic
  danger: '#E63946',
  dangerMuted: 'rgba(230, 57, 70, 0.10)',
  warning: '#F4A261',
  warningMuted: 'rgba(244, 162, 97, 0.10)',
  success: '#2DC653',
  successMuted: 'rgba(45, 198, 83, 0.10)',

  // Light mode surfaces
  background: '#F0F4F8',
  surface: '#FFFFFF',
  surfaceSecondary: '#EBF0F5',
  surfaceElevated: '#FFFFFF',

  // Text (light mode)
  text: '#0D1B2A',
  textSecondary: '#4A6080',
  textTertiary: '#8FA3B8',
  textInverse: '#FFFFFF',

  // Borders
  border: 'rgba(0, 102, 204, 0.12)',
  divider: 'rgba(0, 102, 204, 0.06)',

  // Dark mode surfaces
  dark: {
    background: '#0A1628',
    surface: '#0F1E35',
    surfaceSecondary: '#162540',
    surfaceElevated: '#1A2D4A',
    text: '#E8F0F8',
    textSecondary: '#7A9BBF',
    textTertiary: '#4A6A8A',
    border: 'rgba(100, 160, 220, 0.12)',
    divider: 'rgba(100, 160, 220, 0.06)',
  },
};

export const TYPOGRAPHY = {
  // Display
  display: { fontSize: 32, fontFamily: 'Inter_700Bold', letterSpacing: -0.5, lineHeight: 38 },
  // Headings
  h1: { fontSize: 28, fontFamily: 'Inter_700Bold', letterSpacing: -0.4, lineHeight: 34 },
  h2: { fontSize: 22, fontFamily: 'Inter_700Bold', letterSpacing: -0.3, lineHeight: 28 },
  h3: { fontSize: 18, fontFamily: 'Inter_600SemiBold', letterSpacing: -0.2, lineHeight: 24 },
  h4: { fontSize: 16, fontFamily: 'Inter_600SemiBold', letterSpacing: -0.1, lineHeight: 22 },
  // Body
  body: { fontSize: 15, fontFamily: 'Inter_400Regular', lineHeight: 22 },
  bodyMedium: { fontSize: 15, fontFamily: 'Inter_500Medium', lineHeight: 22 },
  bodySemibold: { fontSize: 15, fontFamily: 'Inter_600SemiBold', lineHeight: 22 },
  // Small
  caption: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 18 },
  captionMedium: { fontSize: 13, fontFamily: 'Inter_500Medium', lineHeight: 18 },
  // Label
  label: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5, lineHeight: 16 },
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
};

export const SHADOWS = {
  sm: Platform.select({
    ios: { boxShadow: '0 1px 3px rgba(0, 102, 204, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)' },
    android: { elevation: 2 },
    default: {},
  }),
  md: Platform.select({
    ios: { boxShadow: '0 2px 8px rgba(0, 102, 204, 0.08), 0 1px 3px rgba(0, 0, 0, 0.06)' },
    android: { elevation: 4 },
    default: {},
  }),
  lg: Platform.select({
    ios: { boxShadow: '0 4px 16px rgba(0, 102, 204, 0.12), 0 2px 6px rgba(0, 0, 0, 0.08)' },
    android: { elevation: 8 },
    default: {},
  }),
};
