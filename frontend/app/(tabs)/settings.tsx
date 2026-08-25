import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/src/theme/ThemeContext';
import { SPACING, RADIUS, typography, MONO } from '@/src/theme/tokens';
import { useAppState } from '@/src/state/AppState';

const PRIVACY_POLICY_URL = 'https://slicercompanion.app/privacy';
const TERMS_URL = 'https://slicercompanion.app/terms';

export default function Settings() {
  const { colors, mode, toggle } = useTheme();
  const { printers, filaments, models, activePrinterId, activeFilamentId, activeModelId } = useAppState();
  const styles = useStyles(colors);
  const activePrinter = printers.find((p) => p.id === activePrinterId);
  const activeFilament = filaments.find((f) => f.id === activeFilamentId);
  const activeModel = models.find((m) => m.id === activeModelId);

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <View style={{ padding: SPACING.lg }}>
        <Text style={[typography.h2, { color: colors.onSurface }]}>Settings</Text>
        <Text style={[typography.small, { color: colors.onSurfaceSecondary }]}>Preferences and app info</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.md, paddingBottom: 40 }}>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[typography.h3, { color: colors.onSurface }]}>Appearance</Text>
              <Text style={[typography.small, { color: colors.onSurfaceSecondary }]}>{mode === 'dark' ? 'Dark mode' : 'Light mode'}</Text>
            </View>
            <Pressable testID="theme-toggle" onPress={toggle} style={[styles.switch, mode === 'dark' && { backgroundColor: colors.brandPrimary }]}>
              <View style={[styles.knob, { transform: [{ translateX: mode === 'dark' ? 22 : 0 }] }]}>
                <Ionicons name={mode === 'dark' ? 'moon' : 'sunny'} size={12} color={colors.brandPrimary} />
              </View>
            </Pressable>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={[typography.h3, { color: colors.onSurface, marginBottom: 8 }]}>Active profiles</Text>
          <Row label="Printer" value={activePrinter?.name || '—'} colors={colors} />
          <Row label="Filament" value={activeFilament?.name || '—'} colors={colors} />
          <Row label="Model" value={activeModel?.filename || '—'} colors={colors} />
        </View>

        <View style={styles.card}>
          <Text style={[typography.h3, { color: colors.onSurface, marginBottom: 8 }]}>Library</Text>
          <Row label="Printers" value={String(printers.length)} colors={colors} />
          <Row label="Filaments" value={String(filaments.length)} colors={colors} />
          <Row label="Models" value={String(models.length)} colors={colors} />
        </View>

        <View style={styles.card}>
          <Text style={[typography.h3, { color: colors.onSurface, marginBottom: 8 }]}>About</Text>
          <Text style={[typography.small, { color: colors.onSurfaceSecondary }]}>Slicer Companion · v1.0.0</Text>
          <Text style={[typography.small, { color: colors.onSurfaceSecondary, marginTop: 4 }]}>Mobile slicing preview & OctoPrint control</Text>
        </View>

        <View style={styles.card}>
          <Text style={[typography.h3, { color: colors.onSurface, marginBottom: 8 }]}>Legal</Text>
          <Pressable onPress={() => Linking.openURL(PRIVACY_POLICY_URL)} style={styles.linkRow}>
            <Text style={[typography.small, { color: colors.brandPrimary }]}>Privacy Policy</Text>
            <Ionicons name="open-outline" size={14} color={colors.brandPrimary} />
          </Pressable>
          <Pressable onPress={() => Linking.openURL(TERMS_URL)} style={styles.linkRow}>
            <Text style={[typography.small, { color: colors.brandPrimary }]}>Terms of Service</Text>
            <Ionicons name="open-outline" size={14} color={colors.brandPrimary} />
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value, colors }: any) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
      <Text style={{ color: colors.onSurfaceSecondary, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: colors.onSurface, fontFamily: MONO, fontSize: 12 }} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function useStyles(colors: any) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.surface },
    card: {
      backgroundColor: colors.surfaceSecondary,
      borderRadius: RADIUS.md,
      padding: SPACING.md,
      marginBottom: SPACING.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    row: { flexDirection: 'row', alignItems: 'center' },
    linkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    switch: {
      width: 48,
      height: 26,
      borderRadius: 13,
      backgroundColor: colors.surfaceTertiary,
      padding: 3,
    },
    knob: {
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: '#fff',
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
