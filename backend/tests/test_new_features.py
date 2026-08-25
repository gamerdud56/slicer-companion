"""Backend tests for this-session new features: filament pricing, moonraker, slice cost."""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://slicer-profile-suite.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
STL_PATH = "/tmp/cube.stl"


@pytest.fixture(scope="session")
def s():
    return requests.Session()


@pytest.fixture(scope="session")
def model(s):
    # Reuse an existing model to avoid uploading many
    r = s.get(f"{API}/models")
    assert r.status_code == 200
    items = r.json()
    if items:
        return items[0]
    with open(STL_PATH, "rb") as f:
        r = s.post(f"{API}/models/upload", files={"file": ("cube.stl", f, "application/sla")}, timeout=60)
    assert r.status_code == 200
    return r.json()


# ---------- Filament pricing ----------
class TestFilamentPricing:
    def test_defaults_have_pricing(self, s):
        r = s.get(f"{API}/filaments")
        assert r.status_code == 200
        items = r.json()
        # every filament has price_per_kg and spool_weight_g
        for f in items:
            assert "price_per_kg" in f, f"missing price_per_kg on {f.get('name')}"
            assert "spool_weight_g" in f, f"missing spool_weight_g on {f.get('name')}"

        expected = {"PLA": 22.0, "PETG": 26.0, "ABS": 24.0, "TPU": 35.0}
        for mat, price in expected.items():
            match = next((f for f in items if f.get("is_default") and f.get("material") == mat), None)
            assert match is not None, f"no default filament for material {mat}"
            assert float(match["price_per_kg"]) == price, f"{mat} price {match['price_per_kg']} != {price}"

    def test_create_patch_delete_with_pricing(self, s):
        # Create with custom pricing
        payload = {
            "name": "TEST_PricedFil",
            "material": "PLA",
            "color": "#123456",
            "price_per_kg": 30.0,
            "spool_weight_g": 750.0,
        }
        r = s.post(f"{API}/filaments", json=payload)
        assert r.status_code == 200
        created = r.json()
        assert float(created["price_per_kg"]) == 30.0
        assert float(created["spool_weight_g"]) == 750.0
        fid = created["id"]

        # GET to verify persistence
        r = s.get(f"{API}/filaments")
        assert r.status_code == 200
        persisted = next((f for f in r.json() if f["id"] == fid), None)
        assert persisted is not None
        assert float(persisted["price_per_kg"]) == 30.0
        assert float(persisted["spool_weight_g"]) == 750.0

        # Patch price
        r = s.patch(f"{API}/filaments/{fid}", json={"price_per_kg": 42.5})
        assert r.status_code == 200
        assert float(r.json()["price_per_kg"]) == 42.5

        # Verify patched
        r = s.get(f"{API}/filaments")
        again = next(f for f in r.json() if f["id"] == fid)
        assert float(again["price_per_kg"]) == 42.5

        # Delete non-default succeeds
        r = s.delete(f"{API}/filaments/{fid}")
        assert r.status_code == 200
        # Confirm gone
        r = s.get(f"{API}/filaments")
        assert not any(f["id"] == fid for f in r.json())


# ---------- Slice estimated_cost ----------
class TestSliceCost:
    def test_slice_without_filament_returns_null_cost(self, s, model):
        payload = {
            "model_id": model["id"],
            "settings": {"layer_height": 0.2, "infill_density": 20, "print_speed": 60, "nozzle_temp": 210, "bed_temp": 60},
        }
        r = s.post(f"{API}/slice", json=payload, timeout=90)
        assert r.status_code == 200
        data = r.json()
        assert "estimated_cost" in data
        assert data["estimated_cost"] is None

    def test_slice_with_filament_returns_cost(self, s, model):
        r = s.get(f"{API}/filaments")
        assert r.status_code == 200
        pla = next(f for f in r.json() if f.get("is_default") and f.get("material") == "PLA")
        payload = {
            "model_id": model["id"],
            "settings": {"layer_height": 0.2, "infill_density": 20, "print_speed": 60, "nozzle_temp": 210, "bed_temp": 60},
            "filament_profile_id": pla["id"],
        }
        r = s.post(f"{API}/slice", json=payload, timeout=90)
        assert r.status_code == 200
        data = r.json()
        assert data["estimated_cost"] is not None
        # Formula: grams/1000 * price_per_kg
        grams = data["filament_grams"]
        expected = round((grams / 1000.0) * float(pla["price_per_kg"]), 2)
        assert abs(data["estimated_cost"] - expected) < 0.01, f"{data['estimated_cost']} != {expected}"
        assert isinstance(data["estimated_cost"], (int, float))


# ---------- Moonraker + OctoPrint connection ----------
class TestConnectionMoonraker:
    def test_moonraker_unreachable_returns_ok_false(self, s):
        # 10.255.255.1 is unreachable in sandbox
        r = s.post(f"{API}/printers/test-connection", json={
            "type": "moonraker",
            "host": "10.255.255.1:7125",
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is False
        assert "message" in data

    def test_octoprint_unreachable_returns_ok_false(self, s):
        r = s.post(f"{API}/printers/test-connection", json={
            "type": "octoprint",
            "host": "10.255.255.1",
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is False

    def test_defaults_no_type_no_key(self, s):
        # Omit both api_key and type - should still be accepted, defaults to octoprint
        r = s.post(f"{API}/printers/test-connection", json={"host": "10.255.255.1"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is False


# ---------- Moonraker printer persistence + print job ----------
class TestMoonrakerPrinter:
    def test_create_moonraker_printer_and_print(self, s, model):
        # Create a printer with moonraker connection
        payload = {
            "name": "TEST_MRPrinter",
            "manufacturer": "Voron",
            "bed_size": [300, 300, 300],
            "connection": {"type": "moonraker", "host": "10.255.255.1:7125", "api_key": ""},
        }
        r = s.post(f"{API}/printers", json=payload)
        assert r.status_code == 200, r.text
        p = r.json()
        pid = p["id"]
        assert p.get("connection", {}).get("type") == "moonraker"
        assert p.get("connection", {}).get("host") == "10.255.255.1:7125"

        # GET verify persistence
        r = s.get(f"{API}/printers")
        found = next((x for x in r.json() if x["id"] == pid), None)
        assert found is not None
        assert found["connection"]["type"] == "moonraker"

        # Send print job -> unreachable host, should return ok:false gracefully (no 500)
        r = s.post(f"{API}/printers/print", json={
            "printer_profile_id": pid,
            "model_id": model["id"],
            "settings": {"layer_height": 0.2, "infill_density": 20, "print_speed": 60, "nozzle_temp": 210, "bed_temp": 60},
        }, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is False
        assert "message" in data

        # Cleanup
        r = s.delete(f"{API}/printers/{pid}")
        assert r.status_code == 200
