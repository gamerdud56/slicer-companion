import { StyleSheet } from 'react-native';

export const LIGHT = {
  surface: '#F6F5F2',
  onSurface: '#1A1A1A',
  surfaceSecondary: '#FFFFFF',
  onSurfaceSecondary: '#4A4A4A',
  surfaceTertiary: '#EFECE7',
  onSurfaceTertiary: '#1A1A1A',
  surfaceInverse: '#1A1A1A',
  onSurfaceInverse: '#F6F5F2',
  brand: '#F56B00',
  brandPrimary: '#F56B00',
  onBrandPrimary: '#FFFFFF',
  brandSecondary: '#FFDBC2',
  onBrandSecondary: '#C45600',
  success: '#34C759',
  warning: '#FFCC00',
  error: '#FF3B30',
  info: '#3A3A3C',
  border: '#E5E5EA',
  borderStrong: '#C7C7CC',
  divider: '#E5E5EA',
  glassBg: 'rgba(255,255,255,0.7)',
};

export const DARK = {
  surface: '#121212',
  onSurface: '#EDEDED',
  surfaceSecondary: '#1E1E1E',
  onSurfaceSecondary: '#A0A0A0',
  surfaceTertiary: '#2C2C2E',
  onSurfaceTertiary: '#EDEDED',
  surfaceInverse: '#EDEDED',
  onSurfaceInverse: '#121212',
  brand: '#F56B00',
  brandPrimary: '#F56B00',
  onBrandPrimary: '#FFFFFF',
  brandSecondary: '#3D1A00',
  onBrandSecondary: '#FF9955',
  success: '#30D158',
  warning: '#FFD60A',
  error: '#FF453A',
  info: '#8E8E93',
  border: '#38383A',
  borderStrong: '#48484A',
  divider: '#38383A',
  glassBg: 'rgba(30,30,30,0.7)',
};

export type ThemePalette = typeof LIGHT;

export const SPACING = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };
export const RADIUS = { sm: 6, md: 12, lg: 20, pill: 999 };

export const MONO = 'SpaceMono';

export const typography = StyleSheet.create({
  h1: { fontSize: 24, fontWeight: '700' as const },
  h2: { fontSize: 20, fontWeight: '700' as const },
  h3: { fontSize: 16, fontWeight: '600' as const },
  body: { fontSize: 14 },
  bodyLg: { fontSize: 16 },
  small: { fontSize: 12 },
  mono: { fontFamily: MONO, fontSize: 14 },
  monoLg: { fontFamily: MONO, fontSize: 16 },
  monoSm: { fontFamily: MONO, fontSize: 12 },
});
