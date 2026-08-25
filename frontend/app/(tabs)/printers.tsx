import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useTheme } from '@/src/theme/ThemeContext';
import { SPACING, RADIUS, typography, MONO } from '@/src/theme/tokens';
import { useAppState } from '@/src/state/AppState';
import { api } from '@/src/api/client';

export default function Printers() {
  const { colors } = useTheme();
  const { printers, activePrinterId, setActivePrinter, refresh } = useAppState();
  const styles = useStyles(colors);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [scanning, setScanning] = useState(false);
  const [discoverMsg, setDiscoverMsg] = useState<string | null>(null);

  const discover = useCallback(async () => {
    setScanning(true);
    setDiscoverMsg(null);
    try {
      const res = await api.discover();
      setDiscoverMsg(res.note || 'Scan complete');
    } catch (e: any) {
      setDiscoverMsg(e.message);
    } finally {
      setScanning(false);
    }
  }, []);

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <View style={styles.header}>
        <View>
          <Text style={[typography.h2, { color: colors.onSurface }]}>Printers</Text>
          <Text style={[typography.small, { color: colors.onSurfaceSecondary }]}>Manage your 3D printers</Text>
        </View>
        <Pressable
          testID="add-printer-btn"
          onPress={() => {
            setEditing(null);
            setAddOpen(true);
          }}
          style={styles.addBtn}
        >
          <Ionicons name="add" size={20} color={colors.onBrandPrimary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.md, paddingBottom: 40 }}>
        <View style={styles.discoverCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
            <Ionicons name="wifi" size={20} color={colors.brandPrimary} />
            <Text style={[typography.h3, { color: colors.onSurface }]}>Discover on network</Text>
          </View>
          <Text style={[typography.small, { color: colors.onSurfaceSecondary, marginTop: 4 }]}>
            Find OctoPrint / Klipper printers on your local WiFi.
          </Text>
          <Pressable testID="discover-btn" onPress={discover} style={styles.discoverBtn}>
            {scanning ? <ActivityIndicator color={colors.onBrandPrimary} /> : (
              <>
                <Ionicons name="scan" size={16} color={colors.onBrandPrimary} />
                <Text style={{ color: colors.onBrandPrimary, fontWeight: '600' }}>Scan</Text>
              </>
            )}
          </Pressable>
          {discoverMsg && <Text style={[typography.small, { color: colors.onSurfaceSecondary, marginTop: 6 }]}>{discoverMsg}</Text>}
        </View>

        {printers.map((p) => (
          <PrinterCard
            key={p.id}
            printer={p}
            active={p.id === activePrinterId}
            colors={colors}
            onSelect={() => {
              setActivePrinter(p.id);
              Haptics.selectionAsync().catch(() => {});
            }}
            onEdit={() => {
              setEditing(p);
              setAddOpen(true);
            }}
            onDelete={async () => {
              try {
                await api.deletePrinter(p.id);
                await refresh();
              } catch {}
            }}
          />
        ))}
      </ScrollView>

      <PrinterEditModal
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        initial={editing}
        onSaved={async () => {
          await refresh();
          setAddOpen(false);
        }}
        colors={colors}
      />
    </SafeAreaView>
  );
}

function PrinterCard({ printer, active, colors, onSelect, onEdit, onDelete }: any) {
  const styles = useStyles(colors);
  return (
    <Pressable
      testID={`printer-card-${printer.id}`}
      onPress={onSelect}
      style={[styles.card, active && { borderColor: colors.brandPrimary, borderWidth: 2 }]}
    >
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.xs }}>
          <Text style={[typography.h3, { color: colors.onSurface }]}>{printer.name}</Text>
          {active && (
            <View style={{ backgroundColor: colors.brandPrimary, paddingHorizontal: 8, paddingVertical: 2, borderRadius: RADIUS.pill }}>
              <Text style={{ color: colors.onBrandPrimary, fontSize: 10, fontWeight: '700' }}>ACTIVE</Text>
            </View>
          )}
          {printer.is_default && (
            <View style={{ backgroundColor: colors.surfaceTertiary, paddingHorizontal: 8, paddingVertical: 2, borderRadius: RADIUS.pill }}>
              <Text style={{ color: colors.onSurfaceSecondary, fontSize: 10 }}>Default</Text>
            </View>
          )}
        </View>
        <Text style={[typography.small, { color: colors.onSurfaceSecondary, marginTop: 4 }]}>{printer.manufacturer} · {printer.firmware}</Text>
        <View style={{ flexDirection: 'row', gap: SPACING.md, marginTop: 6 }}>
          <Text style={{ color: colors.onSurface, fontFamily: MONO, fontSize: 11 }}>
            {printer.bed_size[0]}×{printer.bed_size[1]}×{printer.bed_size[2]}
          </Text>
          <Text style={{ color: colors.onSurface, fontFamily: MONO, fontSize: 11 }}>
            Ø{printer.nozzle_diameter}
          </Text>
          {printer.connection?.host && (
            <Text style={{ color: colors.success, fontFamily: MONO, fontSize: 11 }} numberOfLines={1}>
              {printer.connection.type === 'moonraker' ? 'MR' : 'OP'} {printer.connection.host}
            </Text>
          )}
        </View>
        {printer.connection?.host && <StatusRow printerId={printer.id} colors={colors} />}
      </View>
      <View style={{ gap: 6 }}>
        <Pressable testID={`edit-printer-${printer.id}`} onPress={onEdit} hitSlop={8}>
          <Ionicons name="create-outline" size={22} color={colors.onSurfaceSecondary} />
        </Pressable>
        {!printer.is_default && (
          <Pressable testID={`delete-printer-${printer.id}`} onPress={onDelete} hitSlop={8}>
            <Ionicons name="trash-outline" size={22} color={colors.error} />
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

function StatusRow({ printerId, colors }: any) {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setStatus(await api.printerStatus(printerId));
    } catch (e: any) {
      setStatus({ ok: false, message: e.message });
    } finally {
      setLoading(false);
    }
  }, [printerId]);
  useEffect(() => {
    load();
  }, [load]);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
      {loading ? (
        <ActivityIndicator size="small" color={colors.brandPrimary} />
      ) : status?.ok ? (
        <>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success }} />
          <Text style={{ color: colors.onSurface, fontFamily: MONO, fontSize: 11 }} numberOfLines={1}>
            Nozzle {Math.round(status.nozzle?.actual ?? 0)}°/{Math.round(status.nozzle?.target ?? 0)}° · Bed {Math.round(status.bed?.actual ?? 0)}°/{Math.round(status.bed?.target ?? 0)}°
          </Text>
        </>
      ) : (
        <>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.error }} />
          <Text style={{ color: colors.onSurfaceSecondary, fontFamily: MONO, fontSize: 11 }}>Offline</Text>
        </>
      )}
      <Pressable testID={`refresh-status-${printerId}`} onPress={load} hitSlop={8} disabled={loading}>
        <Ionicons name="refresh" size={14} color={colors.onSurfaceSecondary} />
      </Pressable>
    </View>
  );
}

function PrinterEditModal({ visible, onClose, initial, onSaved, colors }: any) {
  const styles = useStyles(colors);
  const [name, setName] = useState('');
  const [manufacturer, setManufacturer] = useState('Custom');
  const [bx, setBx] = useState('220');
  const [by, setBy] = useState('220');
  const [bz, setBz] = useState('250');
  const [nozzle, setNozzle] = useState('0.4');
  const [connType, setConnType] = useState<'octoprint' | 'moonraker'>('octoprint');
  const [host, setHost] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  React.useEffect(() => {
    if (initial) {
      setName(initial.name);
      setManufacturer(initial.manufacturer);
      setBx(String(initial.bed_size[0]));
      setBy(String(initial.bed_size[1]));
      setBz(String(initial.bed_size[2]));
      setNozzle(String(initial.nozzle_diameter));
      setHost(initial.connection?.host || '');
      setApiKey(initial.connection?.api_key || '');
      setConnType(initial.connection?.type === 'moonraker' ? 'moonraker' : 'octoprint');
    } else {
      setName(''); setManufacturer('Custom'); setBx('220'); setBy('220'); setBz('250');
      setNozzle('0.4'); setHost(''); setApiKey(''); setConnType('octoprint');
    }
    setTestMsg(null);
  }, [initial, visible]);

  const test = async () => {
    if (!host) return;
    setTesting(true);
    setTestMsg(null);
    try {
      const r = await api.testConnection(host, apiKey, connType);
      setTestMsg(r.ok ? `Connected: ${r.version?.server || 'OK'}` : `Failed: ${r.message || r.status}`);
    } catch (e: any) {
      setTestMsg(`Failed: ${e.message}`);
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const body: any = {
        name,
        manufacturer,
        bed_size: [parseFloat(bx) || 220, parseFloat(by) || 220, parseFloat(bz) || 250],
        nozzle_diameter: parseFloat(nozzle) || 0.4,
      };
      if (host) body.connection = { type: connType, host, api_key: apiKey };
      if (initial) await api.updatePrinter(initial.id, body);
      else await api.createPrinter(body);
      await onSaved();
    } catch (e) {
      console.warn(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: SPACING.lg, maxHeight: '90%' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md }}>
            <Text style={[typography.h2, { color: colors.onSurface }]}>{initial ? 'Edit printer' : 'Add printer'}</Text>
            <Pressable onPress={onClose} testID="close-printer-modal">
              <Ionicons name="close" size={24} color={colors.onSurface} />
            </Pressable>
          </View>

          <ScrollView>
            <Field label="Name" colors={colors}>
              <TextInput testID="printer-name-input" value={name} onChangeText={setName} style={styles.input} placeholder="My Printer" placeholderTextColor={colors.onSurfaceSecondary} />
            </Field>
            <Field label="Manufacturer" colors={colors}>
              <TextInput value={manufacturer} onChangeText={setManufacturer} style={styles.input} placeholderTextColor={colors.onSurfaceSecondary} />
            </Field>
            <Text style={[typography.small, { color: colors.onSurfaceSecondary, marginTop: SPACING.sm }]}>Bed size (mm)</Text>
            <View style={{ flexDirection: 'row', gap: SPACING.sm, marginTop: 4 }}>
              <TextInput value={bx} onChangeText={setBx} keyboardType="numeric" style={[styles.input, { flex: 1, fontFamily: MONO }]} />
              <TextInput value={by} onChangeText={setBy} keyboardType="numeric" style={[styles.input, { flex: 1, fontFamily: MONO }]} />
              <TextInput value={bz} onChangeText={setBz} keyboardType="numeric" style={[styles.input, { flex: 1, fontFamily: MONO }]} />
            </View>
            <Field label="Nozzle diameter" colors={colors}>
              <TextInput value={nozzle} onChangeText={setNozzle} keyboardType="numeric" style={[styles.input, { fontFamily: MONO }]} />
            </Field>

            <View style={{ marginTop: SPACING.lg, paddingTop: SPACING.md, borderTopWidth: 1, borderColor: colors.border }}>
              <Text style={[typography.h3, { color: colors.onSurface }]}>WiFi Connection</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: SPACING.sm }}>
                {(['octoprint', 'moonraker'] as const).map((t) => (
                  <Pressable
                    key={t}
                    testID={`conn-type-${t}`}
                    onPress={() => setConnType(t)}
                    style={[styles.typeChip, connType === t && { backgroundColor: colors.brandPrimary }]}
                  >
                    <Text style={{ color: connType === t ? colors.onBrandPrimary : colors.onSurface, fontWeight: '600', fontSize: 12 }}>
                      {t === 'octoprint' ? 'OctoPrint' : 'Moonraker (Klipper)'}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Field label="Host / IP" colors={colors}>
                <TextInput testID="printer-host-input" value={host} onChangeText={setHost} placeholder={connType === 'moonraker' ? 'http://192.168.1.42:7125' : 'http://192.168.1.42'} placeholderTextColor={colors.onSurfaceSecondary} autoCapitalize="none" style={[styles.input, { fontFamily: MONO }]} />
              </Field>
              <Field label={connType === 'moonraker' ? 'API Key (optional)' : 'API Key'} colors={colors}>
                <TextInput testID="printer-apikey-input" value={apiKey} onChangeText={setApiKey} placeholder={connType === 'moonraker' ? 'Moonraker API Key (if set)' : 'OctoPrint API Key'} placeholderTextColor={colors.onSurfaceSecondary} autoCapitalize="none" style={[styles.input, { fontFamily: MONO }]} />
              </Field>
              <Pressable testID="test-connection-btn" onPress={test} disabled={!host || testing} style={[styles.secondaryBtn, (!host || testing) && { opacity: 0.5 }]}>
                {testing ? <ActivityIndicator color={colors.brandPrimary} /> : <Text style={{ color: colors.brandPrimary, fontWeight: '600' }}>Test Connection</Text>}
              </Pressable>
              {testMsg && <Text style={[typography.small, { color: testMsg.startsWith('Connected') ? colors.success : colors.error, marginTop: 6 }]}>{testMsg}</Text>}
            </View>
          </ScrollView>

          <Pressable testID="save-printer-btn" onPress={save} disabled={saving || !name.trim()} style={[styles.primaryBtn, (!name.trim() || saving) && { opacity: 0.5 }]}>
            {saving ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={{ color: colors.onBrandPrimary, fontWeight: '700' }}>Save Printer</Text>}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function Field({ label, colors, children }: any) {
  return (
    <View style={{ marginTop: SPACING.sm }}>
      <Text style={{ color: colors.onSurfaceSecondary, fontSize: 12, marginBottom: 4 }}>{label}</Text>
      {children}
    </View>
  );
}

function useStyles(colors: any) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.surface },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: SPACING.lg },
    addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandPrimary, alignItems: 'center', justifyContent: 'center' },
    discoverCard: {
      backgroundColor: colors.surfaceSecondary,
      borderRadius: RADIUS.md,
      padding: SPACING.md,
      marginBottom: SPACING.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    discoverBtn: {
      alignSelf: 'flex-start',
      marginTop: SPACING.sm,
      flexDirection: 'row',
      gap: 6,
      paddingHorizontal: SPACING.md,
      paddingVertical: 8,
      borderRadius: RADIUS.pill,
      backgroundColor: colors.brandPrimary,
      alignItems: 'center',
    },
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
    input: {
      backgroundColor: colors.surfaceSecondary,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.sm,
      padding: 10,
      color: colors.onSurface,
      fontSize: 14,
    },
    primaryBtn: {
      backgroundColor: colors.brandPrimary,
      borderRadius: RADIUS.pill,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: SPACING.md,
    },
    secondaryBtn: {
      borderWidth: 1,
      borderColor: colors.brandPrimary,
      borderRadius: RADIUS.pill,
      paddingVertical: 10,
      alignItems: 'center',
      marginTop: SPACING.sm,
    },
    typeChip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: RADIUS.pill,
      backgroundColor: colors.surfaceTertiary,
    },
  });
}
