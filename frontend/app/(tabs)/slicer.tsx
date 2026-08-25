import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Line, Rect } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useTheme } from '@/src/theme/ThemeContext';
import { SPACING, RADIUS, typography, MONO } from '@/src/theme/tokens';
import { useAppState } from '@/src/state/AppState';
import { api } from '@/src/api/client';

const DEFAULT_SETTINGS = {
  layer_height: 0.2,
  initial_layer_height: 0.24,
  wall_line_count: 3,
  top_bottom_layers: 4,
  infill_density: 20,
  infill_pattern: 'grid',
  print_speed: 60,
  travel_speed: 150,
  nozzle_temp: 210,
  bed_temp: 60,
  z_offset: 0.0,
  supports: false,
  adhesion: 'skirt',
};

const SECTIONS: { title: string; fields: { key: keyof typeof DEFAULT_SETTINGS; label: string; unit?: string; step?: number; min?: number; max?: number }[] }[] = [
  {
    title: 'Quality',
    fields: [
      { key: 'layer_height', label: 'Layer height', unit: 'mm', step: 0.02, min: 0.05, max: 0.6 },
      { key: 'initial_layer_height', label: 'Initial layer', unit: 'mm', step: 0.02, min: 0.1, max: 0.6 },
    ],
  },
  {
    title: 'Shell',
    fields: [
      { key: 'wall_line_count', label: 'Wall lines', step: 1, min: 1, max: 8 },
      { key: 'top_bottom_layers', label: 'Top/Bottom layers', step: 1, min: 1, max: 12 },
    ],
  },
  {
    title: 'Infill',
    fields: [{ key: 'infill_density', label: 'Density', unit: '%', step: 5, min: 0, max: 100 }],
  },
  {
    title: 'Speed',
    fields: [
      { key: 'print_speed', label: 'Print speed', unit: 'mm/s', step: 5, min: 10, max: 300 },
      { key: 'travel_speed', label: 'Travel speed', unit: 'mm/s', step: 10, min: 50, max: 500 },
    ],
  },
  {
    title: 'Temperature',
    fields: [
      { key: 'nozzle_temp', label: 'Nozzle temp', unit: '°C', step: 5, min: 150, max: 300 },
      { key: 'bed_temp', label: 'Bed temp', unit: '°C', step: 5, min: 0, max: 120 },
      { key: 'z_offset', label: 'Z offset', unit: 'mm', step: 0.01, min: -1, max: 1 },
    ],
  },
];

export default function Slicer() {
  const { colors } = useTheme();
  const { activeModelId, activePrinterId, activeFilamentId, models, printers, filaments, refresh } = useAppState();
  const [settings, setSettings] = useState<any>(DEFAULT_SETTINGS);
  const [open, setOpen] = useState<Record<string, boolean>>({ Quality: true, Temperature: true });
  const [slicing, setSlicing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [layerIdx, setLayerIdx] = useState(0);
  const [presets, setPresets] = useState<any[]>([]);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [savingPreset, setSavingPreset] = useState(false);
  const [usageLogged, setUsageLogged] = useState(false);

  const styles = useStyles(colors);
  const activeModel = useMemo(() => models.find((m) => m.id === activeModelId), [models, activeModelId]);
  const activePrinter = useMemo(() => printers.find((p) => p.id === activePrinterId), [printers, activePrinterId]);
  const activeFilament = useMemo(() => filaments.find((f) => f.id === activeFilamentId), [filaments, activeFilamentId]);

  const setField = (k: string, v: any) => {
    setSettings((s: any) => ({ ...s, [k]: v }));
    setActivePresetId(null);
  };

  const loadPresets = useCallback(async () => {
    try {
      setPresets(await api.listPresets());
    } catch {}
  }, []);

  useEffect(() => {
    loadPresets();
  }, [loadPresets]);

  const applyPreset = (p: any) => {
    setSettings({ ...DEFAULT_SETTINGS, ...p.settings });
    setActivePresetId(p.id);
    Haptics.selectionAsync().catch(() => {});
  };

  const removePreset = async (p: any) => {
    try {
      await api.deletePreset(p.id);
      if (activePresetId === p.id) setActivePresetId(null);
      await loadPresets();
    } catch {}
  };

  const savePreset = async () => {
    if (!presetName.trim()) return;
    setSavingPreset(true);
    try {
      const doc = await api.createPreset({ name: presetName.trim(), settings });
      await loadPresets();
      setActivePresetId(doc.id);
      setSaveOpen(false);
      setPresetName('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch {}
    finally {
      setSavingPreset(false);
    }
  };

  const logUsage = async () => {
    if (!activeFilamentId || !result) return;
    try {
      await api.logUsage(activeFilamentId, result.filament_grams);
      setUsageLogged(true);
      await refresh();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch {}
  };

  const doSlice = useCallback(async () => {
    if (!activeModelId) return;
    setSlicing(true);
    setResult(null);
    setUsageLogged(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      const merged = {
        ...settings,
        nozzle_temp: activeFilament?.nozzle_temp ?? settings.nozzle_temp,
        bed_temp: activeFilament?.bed_temp ?? settings.bed_temp,
      };
      const res = await api.slice({
        model_id: activeModelId,
        settings: merged,
        printer_profile_id: activePrinterId,
        filament_profile_id: activeFilamentId,
      });
      setResult(res);
      setLayerIdx(Math.max(0, res.layer_count - 1));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e: any) {
      console.warn('slice error', e?.message);
    } finally {
      setSlicing(false);
    }
  }, [activeModelId, activePrinterId, activeFilamentId, settings, activeFilament]);

  const printJob = useCallback(async () => {
    if (!activePrinterId || !activeModelId) return;
    if (!activePrinter?.connection) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      return;
    }
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
      const r = await api.sendPrint({
        printer_profile_id: activePrinterId,
        model_id: activeModelId,
        settings,
        filament_profile_id: activeFilamentId,
        filament_grams: result?.filament_grams ?? null,
      });
      if (r?.ok) await refresh();
      console.log('print result', r);
    } catch (e) {
      console.warn('print failed', e);
    }
  }, [activePrinterId, activeModelId, activePrinter, settings, activeFilamentId, result, refresh]);

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <View style={styles.header}>
        <View>
          <Text style={[typography.h2, { color: colors.onSurface }]}>Slicer</Text>
          <Text style={[typography.small, { color: colors.onSurfaceSecondary }]} numberOfLines={1}>
            {activeModel ? activeModel.filename : 'No model'} · {activePrinter?.name || 'No printer'} · {activeFilament?.material || 'No filament'}
          </Text>
        </View>
        <Pressable
          testID="run-slice-btn"
          disabled={!activeModelId || slicing}
          onPress={doSlice}
          style={({ pressed }) => [styles.sliceBtn, (!activeModelId || slicing) && { opacity: 0.5 }, pressed && { opacity: 0.85 }]}
        >
          {slicing ? <ActivityIndicator color={colors.onBrandPrimary} /> : <><Ionicons name="layers" size={16} color={colors.onBrandPrimary} /><Text style={styles.sliceBtnText}>Slice</Text></>}
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} testID="slicer-scroll">
        {/* Presets */}
        <View style={{ paddingVertical: SPACING.sm }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: SPACING.md }}>
            {presets.map((p) => (
              <View key={p.id} style={[styles.presetChip, activePresetId === p.id && { backgroundColor: colors.brandPrimary }]}>
                <Pressable testID={`preset-${p.name}`} onPress={() => applyPreset(p)}>
                  <Text style={{ color: activePresetId === p.id ? colors.onBrandPrimary : colors.onSurface, fontWeight: '600', fontSize: 12 }}>{p.name}</Text>
                </Pressable>
                {!p.is_default && (
                  <Pressable testID={`preset-delete-${p.id}`} hitSlop={8} onPress={() => removePreset(p)}>
                    <Ionicons name="close" size={12} color={activePresetId === p.id ? colors.onBrandPrimary : colors.onSurfaceSecondary} />
                  </Pressable>
                )}
              </View>
            ))}
            <Pressable testID="save-preset-btn" onPress={() => setSaveOpen(true)} style={[styles.presetChip, { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.brandPrimary }]}>
              <Ionicons name="add" size={12} color={colors.brandPrimary} />
              <Text style={{ color: colors.brandPrimary, fontWeight: '600', fontSize: 12 }}>Save</Text>
            </Pressable>
          </ScrollView>
        </View>

        {/* Preview */}
        {result && (
          <View style={styles.previewCard}>
            <View style={styles.previewHeader}>
              <Text style={[typography.h3, { color: colors.onSurface }]}>G-code Preview</Text>
              <Text style={[typography.monoSm, { color: colors.onSurfaceSecondary }]}>
                Layer {layerIdx + 1}/{result.layer_count}
              </Text>
            </View>
            <LayerCanvas
              layer={result.layers[layerIdx]}
              bbox={result.bounding_box}
              color={colors.brandPrimary}
              bg={colors.surfaceTertiary}
            />
            <View style={styles.layerSliderRow}>
              <Ionicons name="chevron-down-outline" size={14} color={colors.onSurfaceSecondary} />
              <LayerSlider max={result.layer_count - 1} value={layerIdx} onChange={setLayerIdx} colors={colors} />
              <Ionicons name="chevron-up-outline" size={14} color={colors.onSurfaceSecondary} />
            </View>
            <View style={styles.statsRow}>
              <Stat label="Time" value={`${result.estimated_time_min} min`} colors={colors} />
              <Stat label="Filament" value={`${result.filament_length_mm} mm`} colors={colors} />
              <Stat label="Weight" value={`${result.filament_grams} g`} colors={colors} />
              <Stat label="Cost" value={result.estimated_cost != null ? `$${result.estimated_cost.toFixed(2)}` : '—'} colors={colors} />
              <Stat label="Height" value={`${result.height_mm} mm`} colors={colors} />
            </View>
            {activeFilamentId != null && (
              <Pressable testID="log-usage-btn" disabled={usageLogged} onPress={logUsage} style={[styles.logBtn, usageLogged && { opacity: 0.6 }]}>
                <Ionicons name={usageLogged ? 'checkmark-circle' : 'analytics-outline'} size={15} color={colors.brandPrimary} />
                <Text style={{ color: colors.brandPrimary, fontWeight: '600', fontSize: 13 }}>
                  {usageLogged ? 'Usage logged to spool' : `Log ${result.filament_grams} g to spool`}
                </Text>
              </Pressable>
            )}
            <Pressable
              testID="print-wifi-btn"
              onPress={printJob}
              style={[styles.printBtn, !activePrinter?.connection && { opacity: 0.5 }]}
              disabled={!activePrinter?.connection}
            >
              <Ionicons name="wifi" size={16} color={colors.onBrandPrimary} />
              <Text style={styles.printBtnText}>
                {activePrinter?.connection ? 'Print via WiFi' : 'Add printer connection first'}
              </Text>
            </Pressable>
          </View>
        )}

        {/* Settings sections */}
        {SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <Pressable
              testID={`section-${section.title.toLowerCase()}`}
              onPress={() => setOpen((o) => ({ ...o, [section.title]: !o[section.title] }))}
              style={styles.sectionHead}
            >
              <Text style={[typography.h3, { color: colors.onSurface }]}>{section.title}</Text>
              <Ionicons
                name={open[section.title] ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={colors.onSurfaceSecondary}
              />
            </Pressable>
            {open[section.title] && (
              <View style={styles.sectionBody}>
                {section.fields.map((f) => (
                  <SettingRow
                    key={f.key as string}
                    label={f.label}
                    unit={f.unit}
                    value={settings[f.key]}
                    step={f.step || 1}
                    min={f.min ?? 0}
                    max={f.max ?? 999}
                    colors={colors}
                    onChange={(v) => setField(f.key as string, v)}
                    testID={`field-${f.key as string}`}
                  />
                ))}
                {section.title === 'Quality' && (
                  <ToggleRow
                    label="Supports"
                    value={settings.supports}
                    colors={colors}
                    onChange={(v) => setField('supports', v)}
                  />
                )}
                {section.title === 'Quality' && (
                  <PickerRow
                    label="Adhesion"
                    options={['none', 'skirt', 'brim', 'raft']}
                    value={settings.adhesion}
                    colors={colors}
                    onChange={(v) => setField('adhesion', v)}
                  />
                )}
              </View>
            )}
          </View>
        ))}
      </ScrollView>

      <Modal visible={saveOpen} transparent animationType="fade" onRequestClose={() => setSaveOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: SPACING.lg }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: RADIUS.md, padding: SPACING.lg }}>
            <Text style={[typography.h3, { color: colors.onSurface }]}>Save preset</Text>
            <Text style={[typography.small, { color: colors.onSurfaceSecondary, marginTop: 4 }]}>Saves the current slicer settings for one-tap reuse.</Text>
            <TextInput
              testID="preset-name-input"
              value={presetName}
              onChangeText={setPresetName}
              placeholder="e.g. Fast PETG"
              placeholderTextColor={colors.onSurfaceSecondary}
              style={{ marginTop: SPACING.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: RADIUS.sm, padding: 10, color: colors.onSurface, fontSize: 14 }}
            />
            <View style={{ flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md }}>
              <Pressable testID="cancel-preset-btn" onPress={() => setSaveOpen(false)} style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: RADIUS.pill, paddingVertical: 10, alignItems: 'center' }}>
                <Text style={{ color: colors.onSurface, fontWeight: '600' }}>Cancel</Text>
              </Pressable>
              <Pressable testID="confirm-preset-btn" onPress={savePreset} disabled={!presetName.trim() || savingPreset} style={{ flex: 1, backgroundColor: colors.brandPrimary, borderRadius: RADIUS.pill, paddingVertical: 10, alignItems: 'center', opacity: !presetName.trim() || savingPreset ? 0.5 : 1 }}>
                {savingPreset ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={{ color: colors.onBrandPrimary, fontWeight: '700' }}>Save</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function LayerCanvas({ layer, bbox, color, bg }: any) {
  const W = 320;
  const H = 220;
  const pad = 12;
  const minX = bbox.min[0], maxX = bbox.max[0], minY = bbox.min[1], maxY = bbox.max[1];
  const dx = Math.max(maxX - minX, 1);
  const dy = Math.max(maxY - minY, 1);
  const scale = Math.min((W - pad * 2) / dx, (H - pad * 2) / dy);
  const cx = (W - dx * scale) / 2;
  const cy = (H - dy * scale) / 2;
  const toX = (x: number) => cx + (x - minX) * scale;
  const toY = (y: number) => H - (cy + (y - minY) * scale);
  return (
    <View style={{ backgroundColor: bg, borderRadius: RADIUS.md, alignSelf: 'center', overflow: 'hidden' }}>
      <Svg width={W} height={H}>
        <Rect x={0} y={0} width={W} height={H} fill={bg} />
        {layer?.segments?.map((seg: any, i: number) => (
          <Line key={i} x1={toX(seg[0][0])} y1={toY(seg[0][1])} x2={toX(seg[1][0])} y2={toY(seg[1][1])} stroke={color} strokeWidth={1.2} />
        ))}
      </Svg>
    </View>
  );
}

function LayerSlider({ max, value, onChange, colors }: any) {
  const [width, setWidth] = useState(1);
  const pct = max > 0 ? value / max : 0;
  return (
    <View
      style={{ flex: 1, height: 32, justifyContent: 'center', marginHorizontal: 8 }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={(e) => {
        const x = e.nativeEvent.locationX;
        onChange(Math.round((x / width) * max));
      }}
      onResponderMove={(e) => {
        const x = e.nativeEvent.locationX;
        onChange(Math.max(0, Math.min(max, Math.round((x / width) * max))));
      }}
    >
      <View style={{ height: 4, backgroundColor: colors.surfaceTertiary, borderRadius: 2 }} />
      <View style={{ position: 'absolute', height: 4, backgroundColor: colors.brandPrimary, borderRadius: 2, width: `${pct * 100}%` }} />
      <View style={{ position: 'absolute', width: 16, height: 16, borderRadius: 8, backgroundColor: colors.brandPrimary, left: `${pct * 100}%`, marginLeft: -8 }} />
    </View>
  );
}

function Stat({ label, value, colors }: any) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ color: colors.onSurfaceSecondary, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</Text>
      <Text style={{ color: colors.onSurface, fontFamily: MONO, fontSize: 13, marginTop: 2 }}>{value}</Text>
    </View>
  );
}

function SettingRow({ label, unit, value, step, min, max, colors, onChange, testID }: any) {
  const [text, setText] = useState(String(value));
  React.useEffect(() => setText(String(value)), [value]);
  const dec = () => onChange(Math.max(min, +(value - step).toFixed(2)));
  const inc = () => onChange(Math.min(max, +(value + step).toFixed(2)));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}>
      <Text style={{ flex: 1, color: colors.onSurface, fontSize: 14 }}>{label}</Text>
      <Pressable onPress={dec} style={{ paddingHorizontal: 8, paddingVertical: 4, backgroundColor: colors.surfaceTertiary, borderRadius: RADIUS.sm }}>
        <Ionicons name="remove" size={14} color={colors.onSurface} />
      </Pressable>
      <TextInput
        testID={testID}
        value={text}
        onChangeText={setText}
        onEndEditing={() => {
          const n = parseFloat(text);
          if (!isNaN(n)) onChange(Math.max(min, Math.min(max, n)));
          else setText(String(value));
        }}
        keyboardType="numbers-and-punctuation"
        style={{
          width: 62,
          height: 32,
          marginHorizontal: 6,
          textAlign: 'center',
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: RADIUS.sm,
          color: colors.onSurface,
          fontFamily: MONO,
          fontSize: 13,
        }}
      />
      <Pressable onPress={inc} style={{ paddingHorizontal: 8, paddingVertical: 4, backgroundColor: colors.surfaceTertiary, borderRadius: RADIUS.sm }}>
        <Ionicons name="add" size={14} color={colors.onSurface} />
      </Pressable>
      <Text style={{ width: 34, textAlign: 'right', color: colors.onSurfaceSecondary, fontFamily: MONO, fontSize: 11 }}>{unit || ''}</Text>
    </View>
  );
}

function ToggleRow({ label, value, colors, onChange }: any) {
  return (
    <Pressable onPress={() => onChange(!value)} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10 }}>
      <Text style={{ flex: 1, color: colors.onSurface, fontSize: 14 }}>{label}</Text>
      <View
        style={{
          width: 44,
          height: 26,
          borderRadius: 13,
          backgroundColor: value ? colors.brandPrimary : colors.surfaceTertiary,
          padding: 3,
        }}
      >
        <View
          style={{
            width: 20,
            height: 20,
            borderRadius: 10,
            backgroundColor: '#fff',
            transform: [{ translateX: value ? 18 : 0 }],
          }}
        />
      </View>
    </Pressable>
  );
}

function PickerRow({ label, options, value, colors, onChange }: any) {
  return (
    <View style={{ paddingVertical: 8 }}>
      <Text style={{ color: colors.onSurface, fontSize: 14, marginBottom: 6 }}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {options.map((o: string) => (
          <Pressable
            key={o}
            onPress={() => onChange(o)}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: RADIUS.pill,
              backgroundColor: value === o ? colors.brandPrimary : colors.surfaceTertiary,
              flexShrink: 0,
            }}
          >
            <Text style={{ color: value === o ? colors.onBrandPrimary : colors.onSurface, fontSize: 12, textTransform: 'capitalize' }}>{o}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function useStyles(colors: any) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.surface },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.md,
    },
    sliceBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.brandPrimary,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderRadius: RADIUS.pill,
    },
    sliceBtnText: { color: colors.onBrandPrimary, fontWeight: '700' },
    previewCard: {
      margin: SPACING.md,
      padding: SPACING.md,
      backgroundColor: colors.surfaceSecondary,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    previewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
    layerSliderRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.sm },
    statsRow: { flexDirection: 'row', gap: SPACING.md, paddingVertical: SPACING.sm },
    printBtn: {
      marginTop: SPACING.sm,
      backgroundColor: colors.brandPrimary,
      borderRadius: RADIUS.pill,
      paddingVertical: 12,
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 6,
    },
    printBtnText: { color: colors.onBrandPrimary, fontWeight: '700' },
    presetChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: RADIUS.pill,
      backgroundColor: colors.surfaceTertiary,
    },
    logBtn: {
      marginTop: SPACING.sm,
      borderWidth: 1,
      borderColor: colors.brandPrimary,
      borderRadius: RADIUS.pill,
      paddingVertical: 9,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 6,
    },
    section: {
      marginHorizontal: SPACING.md,
      marginBottom: SPACING.sm,
      backgroundColor: colors.surfaceSecondary,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    sectionHead: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: SPACING.md,
    },
    sectionBody: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.sm },
  });
}
