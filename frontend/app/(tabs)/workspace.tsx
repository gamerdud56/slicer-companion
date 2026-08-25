import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';

import { useTheme } from '@/src/theme/ThemeContext';
import { SPACING, RADIUS, typography, MONO } from '@/src/theme/tokens';
import { useAppState } from '@/src/state/AppState';
import { api, NetworkError } from '@/src/api/client';

type Tool = 'move' | 'scale' | 'rotate';

function ThreeJsHTML(modelUrl: string | null, transform: { position: number[]; rotation: number[]; scale: number[] }, dark: boolean, bed: number[] | null) {
  const bg = dark ? '#121212' : '#F6F5F2';
  const grid = dark ? 0x333333 : 0xC7C7CC;
  const gridCenter = dark ? 0x555555 : 0x888888;
  const model = 0xF56B00;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"/>
<style>html,body{margin:0;padding:0;height:100%;background:${bg};overflow:hidden;}#c{width:100vw;height:100vh;display:block;}#loading{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:${dark?'#EDEDED':'#1A1A1A'};font-family:monospace;font-size:12px;}#warn{position:absolute;top:10px;left:50%;transform:translateX(-50%);display:none;color:#fff;background:#E53935;font-family:monospace;font-size:11px;padding:4px 12px;border-radius:12px;letter-spacing:1px;}</style>
</head><body><canvas id="c"></canvas><div id="loading">LOADING…</div><div id="warn">EXCEEDS BED</div>
<script src="${api.base}/api/viewer/three.min.js"></script>
<script src="${api.base}/api/viewer/OrbitControls.js"></script>
<script src="${api.base}/api/viewer/STLLoader.js"></script>
<script>
(function(){
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(${dark ? '0x121212' : '0xF6F5F2'});
  const canvas = document.getElementById('c');
  const renderer = new THREE.WebGLRenderer({canvas:canvas,antialias:true});
  renderer.setPixelRatio(window.devicePixelRatio||1);
  renderer.setSize(window.innerWidth, window.innerHeight);
  const camera = new THREE.PerspectiveCamera(45, window.innerWidth/window.innerHeight, 0.1, 5000);
  camera.position.set(180,180,180);
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor=0.1;

  // lights
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const dl = new THREE.DirectionalLight(0xffffff, 0.9); dl.position.set(120,180,60); scene.add(dl);
  const dl2 = new THREE.DirectionalLight(0xffffff, 0.35); dl2.position.set(-100,-60,-80); scene.add(dl2);

  // bed + grid
  const BED = ${JSON.stringify(bed)};
  const gridSize = BED ? Math.ceil(Math.max(BED[0], BED[1]) / 10) * 10 + 60 : 300;
  const grid = new THREE.GridHelper(gridSize, Math.round(gridSize / 10), ${gridCenter}, ${grid});
  scene.add(grid);
  const axes = new THREE.AxesHelper(60); scene.add(axes);
  if(BED){
    const bx = BED[0], by = BED[1], bz = BED[2];
    const pts = [new THREE.Vector3(-bx/2,0.1,-by/2), new THREE.Vector3(bx/2,0.1,-by/2), new THREE.Vector3(bx/2,0.1,by/2), new THREE.Vector3(-bx/2,0.1,by/2)];
    const bedLine = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({color:0x00B8D4}));
    scene.add(bedLine);
    const vol = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(bx,bz,by)), new THREE.LineBasicMaterial({color:0x00B8D4, transparent:true, opacity:0.25}));
    vol.position.set(0, bz/2, 0);
    scene.add(vol);
  }

  let mesh = null;
  const material = new THREE.MeshStandardMaterial({color:${model}, metalness:0.15, roughness:0.55, flatShading:false});

  function fitCamera(obj){
    const box = new THREE.Box3().setFromObject(obj);
    const size = new THREE.Vector3(); box.getSize(size);
    const center = new THREE.Vector3(); box.getCenter(center);
    obj.position.sub(center); // center at origin
    const maxDim = Math.max(size.x, size.y, size.z);
    const dist = maxDim * 2.2;
    camera.position.set(dist, dist*0.8, dist);
    controls.target.set(0,0,0); controls.update();
  }

  function loadSTL(url){
    const loader = new THREE.STLLoader();
    loader.load(url, function(geo){
      geo.computeVertexNormals();
      if(mesh){ scene.remove(mesh); }
      mesh = new THREE.Mesh(geo, material);
      mesh.rotation.x = -Math.PI/2; // STL Z-up to Y-up for viewing
      scene.add(mesh);
      applyTransform();
      fitCamera(mesh);
      document.getElementById('loading').style.display='none';
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({type:'loaded'}));
    }, function(){}, function(err){
      document.getElementById('loading').innerText='FAILED TO LOAD';
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({type:'error', error:String(err)}));
    });
  }

  let currentTransform = ${JSON.stringify(transform)};
  function checkFit(){
    if(!mesh) return;
    const warn = document.getElementById('warn');
    if(!BED){ warn.style.display='none'; return; }
    const box = new THREE.Box3().setFromObject(mesh);
    const size = new THREE.Vector3(); box.getSize(size);
    const fits = size.x <= BED[0] + 0.5 && size.z <= BED[1] + 0.5 && size.y <= BED[2] + 0.5;
    material.color.setHex(fits ? ${model} : 0xE53935);
    warn.style.display = fits ? 'none' : 'block';
  }
  function applyTransform(){
    if(!mesh) return;
    // We stored the base rotation.x=-PI/2. Combine user rotation on top.
    mesh.rotation.set(-Math.PI/2 + (currentTransform.rotation[0]||0), (currentTransform.rotation[1]||0), (currentTransform.rotation[2]||0));
    mesh.scale.set(currentTransform.scale[0]||1, currentTransform.scale[1]||1, currentTransform.scale[2]||1);
    mesh.position.set(currentTransform.position[0]||0, currentTransform.position[1]||0, currentTransform.position[2]||0);
    checkFit();
  }
  function autoArrange(){
    if(!mesh) return;
    mesh.rotation.set(-Math.PI/2, 0, 0);
    mesh.scale.set(currentTransform.scale[0]||1, currentTransform.scale[1]||1, currentTransform.scale[2]||1);
    mesh.position.set(0,0,0);
    const box = new THREE.Box3().setFromObject(mesh);
    const c = new THREE.Vector3(); box.getCenter(c);
    currentTransform = { position: [-c.x, -box.min.y, -c.z], rotation: [0,0,0], scale: currentTransform.scale };
    applyTransform();
    const payload = JSON.stringify({type:'arranged', transform: currentTransform});
    if(window.ReactNativeWebView){ window.ReactNativeWebView.postMessage(payload); }
    else if(window.parent && window.parent !== window){ window.parent.postMessage(payload, '*'); }
  }

  window.addEventListener('message', function(e){
    try{
      const msg = JSON.parse(e.data);
      if(msg.type==='setTransform'){ currentTransform = msg.transform; applyTransform(); }
      if(msg.type==='loadUrl'){ document.getElementById('loading').style.display='block'; document.getElementById('loading').innerText='LOADING…'; loadSTL(msg.url); }
      if(msg.type==='setTheme'){ scene.background = new THREE.Color(msg.dark?0x121212:0xF6F5F2); }
      if(msg.type==='autoArrange'){ autoArrange(); }
    }catch(err){}
  });
  document.addEventListener('message', function(e){
    try{
      const msg = JSON.parse(e.data);
      if(msg.type==='setTransform'){ currentTransform = msg.transform; applyTransform(); }
      if(msg.type==='loadUrl'){ document.getElementById('loading').style.display='block'; loadSTL(msg.url); }
      if(msg.type==='autoArrange'){ autoArrange(); }
    }catch(err){}
  });

  function animate(){ requestAnimationFrame(animate); controls.update(); renderer.render(scene,camera); }
  animate();
  window.addEventListener('resize', function(){
    camera.aspect = window.innerWidth/window.innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  ${modelUrl ? `loadSTL(${JSON.stringify(modelUrl)});` : `document.getElementById('loading').innerText='NO MODEL LOADED';`}
})();
</script></body></html>`;
}

const AXES = ['X', 'Y', 'Z'] as const;

export default function Workspace() {
  const router = useRouter();
  const { colors, mode } = useTheme();
  const { models, activeModelId, setActiveModel, refresh, printers, activePrinterId } = useAppState();
  const webviewRef = useRef<WebView>(null);
  const iframeRef = useRef<any>(null);
  const [tool, setTool] = useState<Tool>('move');
  const [snap, setSnap] = useState(false);
  const [uniform, setUniform] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [transform, setTransform] = useState({ position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });

  const activeModel = useMemo(() => models.find((m) => m.id === activeModelId), [models, activeModelId]);
  const activePrinter = useMemo(() => printers.find((p) => p.id === activePrinterId), [printers, activePrinterId]);
  const bed: number[] | null = activePrinter?.bed_size || null;
  const modelUrl = activeModelId ? `${api.base}/api/models/${activeModelId}/file` : null;
  const viewerKey = `${activeModelId || 'none'}-${bed ? bed.join('x') : 'nobed'}`;

  const postToViewer = useCallback((msg: any) => {
    const data = JSON.stringify(msg);
    if (Platform.OS === 'web') {
      iframeRef.current?.contentWindow?.postMessage(data, '*');
    } else {
      webviewRef.current?.postMessage(data);
    }
  }, []);

  useEffect(() => {
    if (activeModel?.transform) setTransform(activeModel.transform);
  }, [activeModelId]);

  // Push transform to viewer on change
  useEffect(() => {
    postToViewer({ type: 'setTransform', transform });
  }, [transform, postToViewer]);

  // Push theme
  useEffect(() => {
    postToViewer({ type: 'setTheme', dark: mode === 'dark' });
  }, [mode, postToViewer]);

  const upload = useCallback(async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/sla', 'application/vnd.ms-pki.stl', 'model/stl', '*/*'],
        copyToCacheDirectory: true,
      });
      if (res.canceled) return;
      const asset = res.assets[0];
      setUploading(true);
      const form = new FormData();
      if (Platform.OS === 'web') {
        const blob = await (await fetch(asset.uri)).blob();
        form.append('file', blob, asset.name);
      } else {
        form.append('file', { uri: asset.uri, name: asset.name || 'model.stl', type: 'application/sla' } as any);
      }
      const Network = await import('expo-network');
      const net = await Network.getNetworkStateAsync();
      if (!net.isConnected || !net.isInternetReachable) {
        throw new NetworkError();
      }
      const r = await fetch(`${api.base}/api/models/upload`, { method: 'POST', body: form });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(t);
      }
      const doc = await r.json();
      await refresh();
      setActiveModel(doc.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e: any) {
      const msg = e instanceof NetworkError
        ? e.message
        : `Upload failed: ${e?.message || 'Unknown error'}`;
      Alert.alert('Error', msg);
    } finally {
      setUploading(false);
    }
  }, [refresh, setActiveModel]);

  const commitTransform = useCallback(async (t: any) => {
    if (!activeModelId) return;
    try {
      await api.updateTransform(activeModelId, t);
    } catch (e) {}
  }, [activeModelId]);

  const handleViewerMessage = useCallback((data: string) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'arranged' && msg.transform) {
        setTransform(msg.transform);
        commitTransform(msg.transform);
      }
    } catch {}
  }, [commitTransform]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const h = (e: any) => {
      if (typeof e.data === 'string') handleViewerMessage(e.data);
    };
    window.addEventListener('message', h);
    return () => window.removeEventListener('message', h);
  }, [handleViewerMessage]);

  const applyValue = (axis: number, val: number) => {
    const t = { ...transform, position: [...transform.position], rotation: [...transform.rotation], scale: [...transform.scale] };
    let v = val;
    if (snap) {
      if (tool === 'move') v = Math.round(v / 5) * 5;
      if (tool === 'rotate') v = (Math.round((v * 180 / Math.PI) / 15) * 15) * Math.PI / 180;
      if (tool === 'scale') v = Math.round(v * 10) / 10;
    }
    if (tool === 'move') t.position[axis] = v;
    if (tool === 'rotate') t.rotation[axis] = v;
    if (tool === 'scale') {
      if (uniform) {
        t.scale = [v, v, v];
      } else {
        t.scale[axis] = v;
      }
    }
    setTransform(t);
    commitTransform(t);
    if (snap) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  };

  const slice = () => {
    if (!activeModelId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    router.push('/(tabs)/slicer');
  };

  const ranges = tool === 'move' ? { min: -125, max: 125 } : tool === 'rotate' ? { min: -Math.PI, max: Math.PI } : { min: 0.1, max: 3 };
  const values = tool === 'move' ? transform.position : tool === 'rotate' ? transform.rotation : transform.scale;

  const styles = useStyles(colors);

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={[typography.h2, { color: colors.onSurface }]}>Workspace</Text>
          <Text style={[typography.small, { color: colors.onSurfaceSecondary }]} numberOfLines={1}>
            {activeModel ? activeModel.filename : 'No model loaded'}
          </Text>
        </View>
        <Pressable
          testID="upload-model-btn"
          onPress={upload}
          style={({ pressed }) => [styles.uploadBtn, pressed && { opacity: 0.8 }]}
        >
          {uploading ? (
            <ActivityIndicator color={colors.onBrandPrimary} />
          ) : (
            <>
              <Ionicons name="cloud-upload-outline" size={15} color={colors.onBrandPrimary} />
              <Text style={styles.uploadBtnText}>Upload STL</Text>
            </>
          )}
        </Pressable>
      </View>

      {/* 3D Viewer */}
      <View style={styles.viewer}>
        {activeModelId ? (
          Platform.OS === 'web' ? (
            React.createElement('iframe', {
              key: viewerKey,
              ref: iframeRef,
              srcDoc: ThreeJsHTML(modelUrl, transform, mode === 'dark', bed),
              style: { border: 'none', width: '100%', height: '100%', backgroundColor: colors.surface },
            })
          ) : (
            <WebView
              key={viewerKey}
              ref={webviewRef}
              testID="viewer-webview"
              originWhitelist={['*']}
              javaScriptEnabled
              domStorageEnabled
              source={{ html: ThreeJsHTML(modelUrl, transform, mode === 'dark', bed) }}
              style={{ flex: 1, backgroundColor: colors.surface }}
              allowFileAccess
              mixedContentMode="always"
              onMessage={(e) => handleViewerMessage(e.nativeEvent.data)}
            />
          )
        ) : (
          <View style={styles.empty}>
            <Ionicons name="cube-outline" size={64} color={colors.onSurfaceSecondary} />
            <Text style={[typography.bodyLg, { color: colors.onSurface, marginTop: SPACING.md }]}>Import an STL to begin</Text>
            <Text style={[typography.small, { color: colors.onSurfaceSecondary, marginTop: SPACING.xs, textAlign: 'center' }]}>
              Tap Upload STL to start slicing
            </Text>
          </View>
        )}
      </View>

      {/* Model library */}
      {models.length > 0 && (
        <View style={styles.libraryWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SPACING.sm, paddingHorizontal: SPACING.md }}>
            {models.map((m) => (
              <View
                key={m.id}
                style={[styles.modelChip, m.id === activeModelId && { borderColor: colors.brandPrimary, borderWidth: 1.5 }]}
              >
                <Pressable
                  testID={`model-chip-${m.id}`}
                  onPress={() => {
                    setActiveModel(m.id);
                    Haptics.selectionAsync().catch(() => {});
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
                >
                  <Ionicons name="cube-outline" size={14} color={m.id === activeModelId ? colors.brandPrimary : colors.onSurfaceSecondary} />
                  <Text numberOfLines={1} style={[styles.modelChipText, { color: m.id === activeModelId ? colors.onSurface : colors.onSurfaceSecondary }]}>
                    {m.filename}
                  </Text>
                </Pressable>
                <Pressable
                  testID={`model-delete-${m.id}`}
                  hitSlop={8}
                  onPress={async () => {
                    try {
                      await api.deleteModel(m.id);
                      await refresh();
                    } catch {}
                  }}
                >
                  <Ionicons name="close" size={14} color={colors.onSurfaceSecondary} />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Transform panel */}
      {activeModelId && (
        <View style={styles.panel}>
          <View style={styles.toolRow}>
            {(['move', 'scale', 'rotate'] as Tool[]).map((t) => (
              <Pressable
                key={t}
                testID={`tool-${t}-btn`}
                onPress={() => {
                  setTool(t);
                  Haptics.selectionAsync().catch(() => {});
                }}
                style={[styles.toolPill, tool === t && { backgroundColor: colors.brandPrimary }]}
              >
                <Ionicons
                  name={t === 'move' ? 'move-outline' : t === 'scale' ? 'resize-outline' : 'sync-outline'}
                  size={13}
                  color={tool === t ? colors.onBrandPrimary : colors.onSurface}
                />
                <Text style={[styles.toolPillText, { color: tool === t ? colors.onBrandPrimary : colors.onSurface }]}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </Text>
              </Pressable>
            ))}
            <View style={{ flex: 1 }} />
            <Pressable
              testID="arrange-btn"
              onPress={() => {
                postToViewer({ type: 'autoArrange' });
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
              }}
              style={styles.togglePill}
            >
              <Text style={[styles.togglePillText, { color: colors.onSurface }]}>Arrange</Text>
            </Pressable>
            <Pressable
              testID="snap-toggle"
              onPress={() => setSnap((s) => !s)}
              style={[styles.togglePill, snap && { backgroundColor: colors.brandPrimary }]}
            >
              <Text style={[styles.togglePillText, { color: snap ? colors.onBrandPrimary : colors.onSurface }]}>Snap</Text>
            </Pressable>
            {tool === 'scale' && (
              <Pressable
                testID="uniform-toggle"
                onPress={() => setUniform((u) => !u)}
                style={[styles.togglePill, uniform && { backgroundColor: colors.brandPrimary }]}
              >
                <Text style={[styles.togglePillText, { color: uniform ? colors.onBrandPrimary : colors.onSurface }]}>Uniform</Text>
              </Pressable>
            )}
          </View>

          <ScrollView style={{ maxHeight: 220 }}>
            {AXES.map((label, i) => (
              <AxisRow
                key={label}
                label={label}
                value={values[i]}
                min={ranges.min}
                max={ranges.max}
                unit={tool === 'move' ? 'mm' : tool === 'rotate' ? 'rad' : '×'}
                colors={colors}
                onChange={(v) => applyValue(i, v)}
              />
            ))}
          </ScrollView>

          <Pressable testID="slice-btn" onPress={slice} style={styles.sliceBtn}>
            <Ionicons name="layers" size={15} color={colors.onBrandPrimary} />
            <Text style={styles.sliceBtnText}>Slice</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

function AxisRow({
  label,
  value,
  min,
  max,
  unit,
  colors,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  colors: any;
  onChange: (v: number) => void;
}) {
  const [text, setText] = useState(value.toFixed(2));
  useEffect(() => {
    setText(value.toFixed(2));
  }, [value]);

  const [dragging, setDragging] = useState(false);
  const [width, setWidth] = useState(1);
  const pct = Math.max(0, Math.min(1, (value - min) / (max - min)));

  const styles = useStyles(colors);
  return (
    <View style={styles.axisRow}>
      <Text style={[styles.axisLabel, { color: colors.brandPrimary }]}>{label}</Text>
      <View
        style={styles.sliderTrack}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => {
          setDragging(true);
          const x = e.nativeEvent.locationX;
          const p = Math.max(0, Math.min(1, x / width));
          onChange(min + p * (max - min));
        }}
        onResponderMove={(e) => {
          const x = e.nativeEvent.locationX;
          const p = Math.max(0, Math.min(1, x / width));
          onChange(min + p * (max - min));
        }}
        onResponderRelease={() => setDragging(false)}
      >
        <View style={[styles.sliderFill, { width: `${pct * 100}%` }]} />
        <View style={[styles.sliderThumb, { left: `${pct * 100}%` }]} />
      </View>
      <TextInput
        testID={`axis-${label}-input`}
        value={text}
        onChangeText={setText}
        onEndEditing={() => {
          const n = parseFloat(text);
          if (!isNaN(n)) onChange(Math.max(min, Math.min(max, n)));
          else setText(value.toFixed(2));
        }}
        keyboardType="numbers-and-punctuation"
        style={[styles.axisInput, { color: colors.onSurface, borderColor: colors.border, fontFamily: MONO }]}
      />
      <Text style={[styles.axisUnit, { color: colors.onSurfaceSecondary }]}>{unit}</Text>
    </View>
  );
}

function useStyles(colors: any) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.surface },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.md,
    },
    uploadBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      backgroundColor: colors.brandPrimary,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: RADIUS.pill,
    },
    uploadBtnText: { color: colors.onBrandPrimary, fontWeight: '600', fontSize: 12 },
    viewer: { flex: 1, backgroundColor: colors.surface, marginHorizontal: SPACING.md, borderRadius: RADIUS.md, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl },
    libraryWrap: { paddingVertical: SPACING.sm },
    modelChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.surfaceSecondary,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.pill,
      paddingHorizontal: 12,
      paddingVertical: 8,
      maxWidth: 220,
    },
    modelChipText: { fontSize: 12, fontWeight: '600', maxWidth: 140 },
    panel: {
      backgroundColor: colors.surfaceSecondary,
      borderTopWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: SPACING.md,
      paddingTop: SPACING.md,
      paddingBottom: SPACING.sm,
    },
    toolRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: SPACING.sm },
    toolPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: RADIUS.pill,
      backgroundColor: colors.surfaceTertiary,
    },
    toolPillText: { fontSize: 11, fontWeight: '600' },
    togglePill: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: RADIUS.pill,
      backgroundColor: colors.surfaceTertiary,
    },
    togglePillText: { fontSize: 11, fontWeight: '600' },
    axisRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: 4 },
    axisLabel: { width: 18, fontFamily: MONO, fontWeight: '700', fontSize: 13 },
    sliderTrack: { flex: 1, height: 28, justifyContent: 'center', backgroundColor: colors.surfaceTertiary, borderRadius: RADIUS.pill, paddingHorizontal: 6 },
    sliderFill: { position: 'absolute', left: 6, top: 12, height: 4, backgroundColor: colors.brandPrimary, borderRadius: 2 },
    sliderThumb: { position: 'absolute', width: 16, height: 16, borderRadius: 8, backgroundColor: colors.brandPrimary, top: 6, marginLeft: -3 },
    axisInput: {
      width: 58,
      height: 28,
      borderWidth: 1,
      borderRadius: RADIUS.sm,
      paddingHorizontal: 4,
      fontSize: 11,
      textAlign: 'center',
    },
    axisUnit: { width: 22, fontFamily: MONO, fontSize: 10 },
    sliceBtn: {
      marginTop: SPACING.sm,
      backgroundColor: colors.brandPrimary,
      borderRadius: RADIUS.pill,
      paddingVertical: 10,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: SPACING.xs,
    },
    sliceBtnText: { color: colors.onBrandPrimary, fontWeight: '700', fontSize: 13 },
  });
}
