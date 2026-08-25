# Slicer Companion — 3D Printing Mobile App

## Overview
A React Native Expo mobile app that acts as a companion slicer for 3D printing. Users can upload STL models, manipulate them (move/scale/rotate), configure print settings, manage printer & filament profiles, preview G-code layers, and print via WiFi through OctoPrint.

## Core Features Implemented (MVP)
- **STL upload** via device file picker (Emergent Object Storage backend)
- **3D viewer** with orbit-controls (WebView + Three.js) that renders uploaded STL and honors live transforms
- **Transform tools**: Move / Scale / Rotate with per-axis sliders + numeric input, Snap toggle, Uniform scale toggle
- **Print settings** with accordion sections: Quality, Shell, Infill, Speed, Temperature (Nozzle, Bed, Z-Offset), Supports, Adhesion
- **Backend slicing simulation** — layer-by-layer horizontal slicing of STL geometry with time / filament / weight estimates
- **G-code layer preview** — scrubbable SVG rendering of every layer
- **Printer profiles** — 5 default printers seeded (Prusa MK4, Bambu X1C, Ender 3 V3, Voron 2.4, Anycubic Kobra 2 Pro), CRUD for custom profiles, editable via modal
- **Filament profiles** — 4 defaults (PLA/PETG/ABS/TPU), full CRUD, editable temps/fan/flow/retraction, color palette
- **Printer discovery** — network scan endpoint + manual add via IP
- **OctoPrint integration** — test connection + send-to-print job to `/api/files/local`
- **Light / Dark theme toggle** with AsyncStorage persistence

## Tech Stack
- Backend: FastAPI + MongoDB + Emergent Object Storage (STL files)
- Frontend: Expo Router, react-native-webview (three.js STL viewer), react-native-svg (layer preview), expo-document-picker, expo-haptics

## Auth
None — local-only profiles per user request.

## Notes
- Slicing is a **geometric simulation** (horizontal cross-sections of the STL mesh + engineering-formula estimates), not full G-code generation. A real slicer requires a native C++ engine which cannot run inside an Expo app. G-code sent to OctoPrint is a minimal placeholder header for demo purposes.
- Network mDNS discovery is not available in the sandboxed container — the UI directs users to add printers by IP.

## Session 2 (June 2026) — Shipped
- **Moonraker (Klipper) support**: printer connection type picker (OctoPrint / Moonraker) in the printer modal; backend tests via `/printer/info` and prints via `/server/files/upload`; API key optional for Moonraker; cards show `MR`/`OP` prefix on host.
- **Print cost estimate**: filaments now carry `price_per_kg` + `spool_weight_g` (editable, material-specific defaults: PLA $22, PETG $26, ABS $24, TPU $35); `/api/slice` returns `estimated_cost`; Slicer stats row shows Cost.
- **Model library strip**: horizontal chip strip on Workspace to switch between uploaded STLs in one tap, with per-model delete.
- **Bed preview**: cyan bed outline + build-volume wireframe of the active printer drawn in the 3D viewer; model turns red with "EXCEEDS BED" badge if it doesn't fit.
- **Web 3D viewer**: web preview now renders the real Three.js viewer via iframe (removed the placeholder box / WebView error).
- **Compact UI**: workspace tool pills, toggles, sliders, Slice and Upload buttons resized so everything fits on a 390px screen.
- Testing: iteration_2 — 21/21 backend pytest, 9/9 frontend flows pass.
