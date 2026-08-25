import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Modal, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useTheme } from '@/src/theme/ThemeContext';
import { SPACING, RADIUS, typography, MONO } from '@/src/theme/tokens';
import { useAppState } from '@/src/state/AppState';
import { api } from '@/src/api/client';

const MATERIALS = ['PLA', 'PETG', 'ABS', 'TPU', 'ASA', 'NYLON', 'PC', 'Custom'];
const COLORS_PALETTE = ['#F56B00', '#3AA0FF', '#34C759', '#FF3B30', '#1A1A1A', '#F6F5F2', '#FFD60A', '#AF52DE'];

export default function Filaments() {
  const { colors } = useTheme();
  const { filaments, activeFilamentId, setActiveFilament, refresh } = useAppState();
  const styles = useStyles(colors);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <View style={styles.header}>
        <View>
          <Text style={[typography.h2, { color: colors.onSurface }]}>Filaments</Text>
          <Text style={[typography.small, { color: colors.onSurfaceSecondary }]}>Manage material profiles</Text>
        </View>
        <Pressable testID="add-filament-btn" onPress={() => { setEditing(null); setOpen(true); }} style={styles.addBtn}>
          <Ionicons name="add" size={20} color={colors.onBrandPrimary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.md, paddingBottom: 40 }}>
        {filaments.map((f) => (
          <Pressable
            key={f.id}
            testID={`filament-card-${f.id}`}
            onPress={() => {
              setActiveFilament(f.id);
              Haptics.selectionAsync().catch(() => {});
            }}
            style={[styles.card, f.id === activeFilamentId && { borderColor: colors.brandPrimary, borderWidth: 2 }]}
          >
            <View style={[styles.swatch, { backgroundColor: f.color }]} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.xs }}>
                <Text style={[typography.h3, { color: colors.onSurface }]}>{f.name}</Text>
                {f.id === activeFilamentId && (
                  <View style={{ backgroundColor: colors.brandPrimary, paddingHorizontal: 8, paddingVertical: 2, borderRadius: RADIUS.pill }}>
                    <Text style={{ color: colors.onBrandPrimary, fontSize: 10, fontWeight: '700' }}>ACTIVE</Text>
                  </View>
                )}
              </View>
              <Text style={[typography.small, { color: colors.onSurfaceSecondary, marginTop: 2 }]}>{f.material} · Fan {f.fan_speed}% · ${f.price_per_kg ?? 25}/kg</Text>
              <SpoolBar filament={f} colors={colors} />
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ color: colors.brandPrimary, fontFamily: MONO, fontSize: 13 }}>{f.nozzle_temp}°</Text>
              <Text style={{ color: colors.onSurfaceSecondary, fontFamily: MONO, fontSize: 11 }}>{f.bed_temp}° bed</Text>
            </View>
            <Pressable testID={`edit-filament-${f.id}`} onPress={() => { setEditing(f); setOpen(true); }} hitSlop={8}>
              <Ionicons name="create-outline" size={20} color={colors.onSurfaceSecondary} />
            </Pressable>
          </Pressable>
        ))}
      </ScrollView>

      <FilamentModal
        visible={open}
        onClose={() => setOpen(false)}
        initial={editing}
        onSaved={async () => { await refresh(); setOpen(false); }}
        colors={colors}
      />
    </SafeAreaView>
  );
}

function SpoolBar({ filament, colors }: any) {
  const spool = filament.spool_weight_g || 1000;
  const used = filament.grams_used || 0;
  const remaining = Math.max(0, spool - used);
  const pct = Math.max(0, Math.min(1, remaining / spool));
  const low = pct < 0.1;
  return (
    <View style={{ marginTop: 6 }}>
      <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.surfaceTertiary, overflow: 'hidden' }}>
        <View style={{ width: `${pct * 100}%`, height: 4, backgroundColor: low ? colors.error : colors.success }} />
      </View>
      <Text style={{ color: low ? colors.error : colors.onSurfaceSecondary, fontSize: 10, fontFamily: MONO, marginTop: 2 }}>
        {Math.round(remaining)} g left of {Math.round(spool)} g{low ? ' · LOW' : ''}
      </Text>
    </View>
  );
}

function FilamentModal({ visible, onClose, initial, onSaved, colors }: any) {
  const styles = useStyles(colors);
  const [name, setName] = useState('');
  const [material, setMaterial] = useState('PLA');
  const [color, setColor] = useState('#F56B00');
  const [nt, setNt] = useState('210');
  const [bt, setBt] = useState('60');
  const [fan, setFan] = useState('100');
  const [flow, setFlow] = useState('1.0');
  const [retDist, setRetDist] = useState('5.0');
  const [retSpeed, setRetSpeed] = useState('45');
  const [price, setPrice] = useState('25');
  const [spool, setSpool] = useState('1000');
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (initial) {
      setName(initial.name); setMaterial(initial.material); setColor(initial.color);
      setNt(String(initial.nozzle_temp)); setBt(String(initial.bed_temp)); setFan(String(initial.fan_speed));
      setFlow(String(initial.flow_multiplier)); setRetDist(String(initial.retraction_distance)); setRetSpeed(String(initial.retraction_speed));
      setPrice(String(initial.price_per_kg ?? 25)); setSpool(String(initial.spool_weight_g ?? 1000));
    } else {
      setName(''); setMaterial('PLA'); setColor('#F56B00'); setNt('210'); setBt('60'); setFan('100'); setFlow('1.0'); setRetDist('5.0'); setRetSpeed('45');
      setPrice('25'); setSpool('1000');
    }
  }, [initial, visible]);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const body = {
        name, material, color,
        nozzle_temp: parseInt(nt) || 210, bed_temp: parseInt(bt) || 60, fan_speed: parseInt(fan) || 100,
        flow_multiplier: parseFloat(flow) || 1.0, retraction_distance: parseFloat(retDist) || 5.0, retraction_speed: parseFloat(retSpeed) || 45,
        price_per_kg: parseFloat(price) || 25, spool_weight_g: parseFloat(spool) || 1000,
      };
      if (initial) await api.updateFilament(initial.id, body);
      else await api.createFilament(body);
      await onSaved();
    } catch (e) { console.warn(e); }
    finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: SPACING.lg, maxHeight: '92%' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md }}>
            <Text style={[typography.h2, { color: colors.onSurface }]}>{initial ? 'Edit filament' : 'New filament'}</Text>
            <Pressable testID="close-filament-modal" onPress={onClose}><Ionicons name="close" size={24} color={colors.onSurface} /></Pressable>
          </View>

          <ScrollView>
            <Text style={styles.fieldLabel}>Name</Text>
            <TextInput testID="filament-name-input" value={name} onChangeText={setName} placeholder="e.g. Prusament PLA Orange" placeholderTextColor={colors.onSurfaceSecondary} style={styles.input} />

            <Text style={styles.fieldLabel}>Material</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
              {MATERIALS.map((m) => (
                <Pressable key={m} onPress={() => setMaterial(m)} style={[styles.chip, material === m && { backgroundColor: colors.brandPrimary }, { flexShrink: 0 }]}>
                  <Text style={{ color: material === m ? colors.onBrandPrimary : colors.onSurface, fontWeight: '600', fontSize: 12 }}>{m}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={styles.fieldLabel}>Color</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {COLORS_PALETTE.map((c) => (
                <Pressable key={c} onPress={() => setColor(c)} style={[styles.colorSwatch, { backgroundColor: c }, color === c && { borderColor: colors.brandPrimary, borderWidth: 3 }]} />
              ))}
            </View>

            <View style={{ flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Nozzle °C</Text>
                <TextInput value={nt} onChangeText={setNt} keyboardType="numeric" style={[styles.input, { fontFamily: MONO }]} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Bed °C</Text>
                <TextInput value={bt} onChangeText={setBt} keyboardType="numeric" style={[styles.input, { fontFamily: MONO }]} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Fan %</Text>
                <TextInput value={fan} onChangeText={setFan} keyboardType="numeric" style={[styles.input, { fontFamily: MONO }]} />
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Flow multiplier</Text>
                <TextInput value={flow} onChangeText={setFlow} keyboardType="numeric" style={[styles.input, { fontFamily: MONO }]} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Retract mm</Text>
                <TextInput value={retDist} onChangeText={setRetDist} keyboardType="numeric" style={[styles.input, { fontFamily: MONO }]} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Retract mm/s</Text>
                <TextInput value={retSpeed} onChangeText={setRetSpeed} keyboardType="numeric" style={[styles.input, { fontFamily: MONO }]} />
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Price per kg ($)</Text>
                <TextInput testID="filament-price-input" value={price} onChangeText={setPrice} keyboardType="numeric" style={[styles.input, { fontFamily: MONO }]} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Spool weight (g)</Text>
                <TextInput testID="filament-spool-input" value={spool} onChangeText={setSpool} keyboardType="numeric" style={[styles.input, { fontFamily: MONO }]} />
              </View>
            </View>

            {initial && (
              <Pressable
                testID="reset-spool-btn"
                onPress={async () => {
                  try {
                    await api.updateFilament(initial.id, { grams_used: 0 });
                    await onSaved();
                  } catch {}
                }}
                style={{ marginTop: SPACING.md, borderWidth: 1, borderColor: colors.border, borderRadius: RADIUS.pill, paddingVertical: 10, alignItems: 'center' }}
              >
                <Text style={{ color: colors.brandPrimary, fontWeight: '600', fontSize: 13 }}>
                  Reset spool · {Math.round(initial.grams_used || 0)} g used
                </Text>
              </Pressable>
            )}
          </ScrollView>

          <Pressable testID="save-filament-btn" onPress={save} disabled={saving || !name.trim()} style={[styles.saveBtn, (!name.trim() || saving) && { opacity: 0.5 }]}>
            {saving ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={{ color: colors.onBrandPrimary, fontWeight: '700' }}>Save Filament</Text>}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function useStyles(colors: any) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.surface },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: SPACING.lg },
    addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandPrimary, alignItems: 'center', justifyContent: 'center' },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceSecondary,
      borderRadius: RADIUS.md,
      padding: SPACING.md,
      marginBottom: SPACING.sm,
      borderWidth: 1,
      borderColor: colors.border,
      gap: SPACING.md,
    },
    swatch: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.border },
    fieldLabel: { color: colors.onSurfaceSecondary, fontSize: 12, marginBottom: 4, marginTop: SPACING.sm },
    input: {
      backgroundColor: colors.surfaceSecondary,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.sm,
      padding: 10,
      color: colors.onSurface,
      fontSize: 14,
    },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: RADIUS.pill,
      backgroundColor: colors.surfaceTertiary,
    },
    colorSwatch: {
      width: 36,
      height: 36,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
    },
    saveBtn: { backgroundColor: colors.brandPrimary, borderRadius: RADIUS.pill, paddingVertical: 14, alignItems: 'center', marginTop: SPACING.md },
  });
}
