"""Backend tests for iteration 3 new features:
- Slice Presets (Draft/Standard/Fine seed + custom CRUD)
- Filament usage tracking (grams_used, /usage endpoint, PATCH reset)
- Printer status endpoint (/printers/{id}/status)
- Print job increments grams_used only on success
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://slicer-profile-suite.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def s():
    return requests.Session()


@pytest.fixture(scope="session")
def a_model(s):
    r = s.get(f"{API}/models")
    assert r.status_code == 200
    items = r.json()
    assert items, "expected at least one existing model in DB"
    return items[0]


# =============================================================
# Slice Presets
# =============================================================
class TestSlicePresets:
    def test_defaults_seeded(self, s):
        r = s.get(f"{API}/presets")
        assert r.status_code == 200
        items = r.json()
        by_name = {p["name"]: p for p in items if p.get("is_default")}
        assert "Draft" in by_name, "Draft default missing"
        assert "Standard" in by_name, "Standard default missing"
        assert "Fine" in by_name, "Fine default missing"
        assert float(by_name["Draft"]["settings"]["layer_height"]) == 0.28
        assert float(by_name["Standard"]["settings"]["layer_height"]) == 0.2
        assert float(by_name["Fine"]["settings"]["layer_height"]) == 0.12
        for name in ("Draft", "Standard", "Fine"):
            assert by_name[name]["is_default"] is True

    def test_defaults_sorted_first(self, s):
        r = s.get(f"{API}/presets")
        items = r.json()
        default_flags = [p.get("is_default", False) for p in items]
        # is_default=True items should be at the front
        first_false = next((i for i, v in enumerate(default_flags) if not v), len(default_flags))
        assert all(default_flags[:first_false]), "defaults not sorted first"

    def test_create_custom_preset(self, s):
        payload = {
            "name": "TEST_Fast",
            "settings": {
                "layer_height": 0.32,
                "initial_layer_height": 0.32,
                "wall_line_count": 2,
                "top_bottom_layers": 3,
                "infill_density": 10,
                "infill_pattern": "grid",
                "print_speed": 100,
                "travel_speed": 200,
                "nozzle_temp": 215,
                "bed_temp": 60,
                "z_offset": 0.0,
                "supports": False,
                "adhesion": "none",
            },
        }
        r = s.post(f"{API}/presets", json=payload)
        assert r.status_code == 200, r.text
        created = r.json()
        assert created["name"] == "TEST_Fast"
        assert created["is_default"] is False
        assert float(created["settings"]["layer_height"]) == 0.32
        pid = created["id"]

        # GET verify persistence
        r = s.get(f"{API}/presets")
        found = next((p for p in r.json() if p["id"] == pid), None)
        assert found is not None, "created preset not persisted"
        assert float(found["settings"]["layer_height"]) == 0.32

        # Delete custom preset
        r = s.delete(f"{API}/presets/{pid}")
        assert r.status_code == 200

        # Verify gone
        r = s.get(f"{API}/presets")
        assert not any(p["id"] == pid for p in r.json())

    def test_delete_default_forbidden(self, s):
        r = s.get(f"{API}/presets")
        default = next(p for p in r.json() if p.get("is_default"))
        r = s.delete(f"{API}/presets/{default['id']}")
        assert r.status_code == 400

    def test_delete_unknown_returns_404(self, s):
        r = s.delete(f"{API}/presets/nonexistent-id-xyz")
        assert r.status_code == 404


# =============================================================
# Filament Usage / Spool Tracker
# =============================================================
class TestFilamentUsage:
    def test_defaults_have_grams_used_field(self, s):
        r = s.get(f"{API}/filaments")
        assert r.status_code == 200
        for f in r.json():
            assert "grams_used" in f, f"missing grams_used on {f.get('name')}"
            assert isinstance(f["grams_used"], (int, float))

    def test_usage_increments_and_persists(self, s):
        # Create a test filament so we don't pollute defaults
        r = s.post(f"{API}/filaments", json={
            "name": "TEST_UsageFil", "material": "PLA", "color": "#ABCDEF", "grams_used": 0.0,
        })
        assert r.status_code == 200
        fid = r.json()["id"]

        try:
            # Increment by 25.5 grams
            r = s.post(f"{API}/filaments/{fid}/usage", json={"grams": 25.5})
            assert r.status_code == 200, r.text
            data = r.json()
            assert abs(float(data["grams_used"]) - 25.5) < 0.001

            # Verify via GET
            r = s.get(f"{API}/filaments")
            after = next(f for f in r.json() if f["id"] == fid)
            assert abs(float(after["grams_used"]) - 25.5) < 0.001

            # Add another 10 g -> total 35.5
            r = s.post(f"{API}/filaments/{fid}/usage", json={"grams": 10.0})
            assert abs(float(r.json()["grams_used"]) - 35.5) < 0.001

            # Negative usage decrements (e.g. reset)
            r = s.post(f"{API}/filaments/{fid}/usage", json={"grams": -5.5})
            assert r.status_code == 200
            assert abs(float(r.json()["grams_used"]) - 30.0) < 0.001

            # PATCH grams_used = 0 resets
            r = s.patch(f"{API}/filaments/{fid}", json={"grams_used": 0.0})
            assert r.status_code == 200
            assert float(r.json()["grams_used"]) == 0.0

        finally:
            s.delete(f"{API}/filaments/{fid}")

    def test_usage_bad_id_returns_404(self, s):
        r = s.post(f"{API}/filaments/nonexistent-xyz/usage", json={"grams": 5.0})
        assert r.status_code == 404


# =============================================================
# Printer Status
# =============================================================
class TestPrinterStatus:
    def test_status_no_connection_returns_ok_false(self, s):
        # Any default printer has no connection
        r = s.get(f"{API}/printers")
        default = next(p for p in r.json() if p.get("is_default") and not p.get("connection"))
        r = s.get(f"{API}/printers/{default['id']}/status")
        assert r.status_code == 200
        data = r.json()
        assert data.get("ok") is False
        assert "No connection configured" in data.get("message", "")

    def test_status_unknown_printer_returns_404(self, s):
        r = s.get(f"{API}/printers/nonexistent-xyz/status")
        assert r.status_code == 404

    def test_status_unreachable_moonraker_ok_false(self, s):
        # Create a moonraker printer with unreachable host
        payload = {
            "name": "TEST_MRStatus", "manufacturer": "Voron", "bed_size": [300, 300, 300],
            "connection": {"type": "moonraker", "host": "10.255.255.1:7125", "api_key": ""},
        }
        r = s.post(f"{API}/printers", json=payload)
        assert r.status_code == 200
        pid = r.json()["id"]
        try:
            r = s.get(f"{API}/printers/{pid}/status", timeout=15)
            assert r.status_code == 200, r.text
            data = r.json()
            assert data.get("ok") is False
            assert "message" in data
        finally:
            s.delete(f"{API}/printers/{pid}")

    def test_status_unreachable_octoprint_ok_false(self, s):
        payload = {
            "name": "TEST_OPStatus", "manufacturer": "Prusa", "bed_size": [250, 210, 220],
            "connection": {"type": "octoprint", "host": "10.255.255.1", "api_key": "fakekey"},
        }
        r = s.post(f"{API}/printers", json=payload)
        assert r.status_code == 200
        pid = r.json()["id"]
        try:
            r = s.get(f"{API}/printers/{pid}/status", timeout=15)
            assert r.status_code == 200, r.text
            data = r.json()
            assert data.get("ok") is False
        finally:
            s.delete(f"{API}/printers/{pid}")


# =============================================================
# Print Job increments grams_used ONLY on success
# =============================================================
class TestPrintJobUsage:
    def test_unreachable_printer_does_not_increment_usage(self, s, a_model):
        # Create test filament with grams_used=0
        r = s.post(f"{API}/filaments", json={
            "name": "TEST_PrintFil", "material": "PLA", "color": "#112233", "grams_used": 0.0,
        })
        assert r.status_code == 200
        fid = r.json()["id"]

        # Create unreachable moonraker printer
        r = s.post(f"{API}/printers", json={
            "name": "TEST_UnreachMR", "manufacturer": "Voron", "bed_size": [300, 300, 300],
            "connection": {"type": "moonraker", "host": "10.255.255.1:7125", "api_key": ""},
        })
        assert r.status_code == 200
        pid = r.json()["id"]

        try:
            # Send print job with filament tracking
            r = s.post(f"{API}/printers/print", json={
                "printer_profile_id": pid,
                "model_id": a_model["id"],
                "settings": {"layer_height": 0.2, "infill_density": 20, "print_speed": 60, "nozzle_temp": 210, "bed_temp": 60},
                "filament_profile_id": fid,
                "filament_grams": 42.0,
            }, timeout=60)
            assert r.status_code == 200, r.text
            body = r.json()
            assert body.get("ok") is False, "expected ok:false for unreachable"

            # Verify grams_used still 0 (NOT incremented)
            r = s.get(f"{API}/filaments")
            after = next(f for f in r.json() if f["id"] == fid)
            assert float(after["grams_used"]) == 0.0, f"grams_used should stay 0 on failed print, got {after['grams_used']}"
        finally:
            s.delete(f"{API}/printers/{pid}")
            s.delete(f"{API}/filaments/{fid}")


# =============================================================
# Regression: slice with filament still returns estimated_cost
# =============================================================
class TestSliceCostRegression:
    def test_slice_with_filament_returns_cost(self, s, a_model):
        r = s.get(f"{API}/filaments")
        pla = next(f for f in r.json() if f.get("is_default") and f.get("material") == "PLA")
        r = s.post(f"{API}/slice", json={
            "model_id": a_model["id"],
            "settings": {"layer_height": 0.2, "infill_density": 20, "print_speed": 60, "nozzle_temp": 210, "bed_temp": 60},
            "filament_profile_id": pla["id"],
        }, timeout=90)
        assert r.status_code == 200
        data = r.json()
        assert data["estimated_cost"] is not None
        assert data["filament_grams"] > 0
