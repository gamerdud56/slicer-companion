"""Backend tests for Slicer Companion API"""
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
def uploaded_model(s):
    with open(STL_PATH, "rb") as f:
        r = s.post(f"{API}/models/upload", files={"file": ("cube.stl", f, "application/sla")}, timeout=60)
    assert r.status_code == 200, r.text
    return r.json()


# ---------- Health ----------
class TestHealth:
    def test_root(self, s):
        r = s.get(f"{API}/")
        assert r.status_code == 200
        assert r.json().get("status") == "ok"


# ---------- Seeds ----------
class TestSeeds:
    def test_printers_seeded(self, s):
        r = s.get(f"{API}/printers")
        assert r.status_code == 200
        items = r.json()
        defaults = [p for p in items if p.get("is_default")]
        assert len(defaults) == 5, f"expected 5 default printers, got {len(defaults)}"

    def test_filaments_seeded(self, s):
        r = s.get(f"{API}/filaments")
        assert r.status_code == 200
        items = r.json()
        defaults = [f for f in items if f.get("is_default")]
        assert len(defaults) == 4, f"expected 4 default filaments, got {len(defaults)}"


# ---------- Models ----------
class TestModels:
    def test_upload(self, uploaded_model):
        m = uploaded_model
        assert "id" in m and "bounding_box" in m and "storage_path" in m
        assert m["size_bytes"] > 0
        bb = m["bounding_box"]
        assert "min" in bb and "max" in bb

    def test_download_file(self, s, uploaded_model):
        r = s.get(f"{API}/models/{uploaded_model['id']}/file")
        assert r.status_code == 200
        with open(STL_PATH, "rb") as f:
            orig = f.read()
        assert r.content == orig, "downloaded STL differs from uploaded"

    def test_transform_update(self, s, uploaded_model):
        payload = {"transform": {"position": [1, 2, 3], "rotation": [0, 0, 90], "scale": [2, 2, 2]}}
        r = s.patch(f"{API}/models/{uploaded_model['id']}/transform", json=payload)
        assert r.status_code == 200
        doc = r.json()
        assert doc["transform"]["position"] == [1, 2, 3]
        assert doc["transform"]["scale"] == [2, 2, 2]
        # reset
        s.patch(f"{API}/models/{uploaded_model['id']}/transform",
                json={"transform": {"position": [0,0,0], "rotation": [0,0,0], "scale":[1,1,1]}})


# ---------- Printers CRUD ----------
class TestPrintersCRUD:
    def test_full_crud(self, s):
        # Create
        r = s.post(f"{API}/printers", json={"name": "TEST_Printer", "manufacturer": "TestCo", "bed_size": [200,200,200]})
        assert r.status_code == 200
        p = r.json()
        assert p["is_default"] is False
        pid = p["id"]

        # Patch
        r = s.patch(f"{API}/printers/{pid}", json={"name": "TEST_Printer_Updated"})
        assert r.status_code == 200
        assert r.json()["name"] == "TEST_Printer_Updated"

        # Delete non-default
        r = s.delete(f"{API}/printers/{pid}")
        assert r.status_code == 200

    def test_delete_default_forbidden(self, s):
        r = s.get(f"{API}/printers")
        default = next(p for p in r.json() if p.get("is_default"))
        r = s.delete(f"{API}/printers/{default['id']}")
        assert r.status_code == 400


# ---------- Filaments CRUD ----------
class TestFilamentsCRUD:
    def test_full_crud(self, s):
        r = s.post(f"{API}/filaments", json={"name": "TEST_Filament", "material": "PLA", "color": "#FF0000"})
        assert r.status_code == 200
        f = r.json()
        fid = f["id"]
        r = s.patch(f"{API}/filaments/{fid}", json={"color": "#00FF00"})
        assert r.status_code == 200
        assert r.json()["color"] == "#00FF00"
        r = s.delete(f"{API}/filaments/{fid}")
        assert r.status_code == 200

    def test_delete_default_forbidden(self, s):
        r = s.get(f"{API}/filaments")
        default = next(f for f in r.json() if f.get("is_default"))
        r = s.delete(f"{API}/filaments/{default['id']}")
        assert r.status_code == 400


# ---------- Slicing ----------
class TestSlicing:
    def test_slice(self, s, uploaded_model):
        payload = {
            "model_id": uploaded_model["id"],
            "settings": {"layer_height": 0.2, "infill_density": 20, "print_speed": 60, "nozzle_temp": 210, "bed_temp": 60}
        }
        r = s.post(f"{API}/slice", json=payload, timeout=90)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["layer_count"] > 0
        assert isinstance(data["layers"], list) and len(data["layers"]) > 0
        assert "segments" in data["layers"][0]
        assert data["filament_length_mm"] > 0
        assert data["filament_grams"] > 0
        assert data["estimated_time_min"] > 0


# ---------- Discovery / Connection ----------
class TestPrinterConn:
    def test_discover(self, s):
        r = s.get(f"{API}/printers/discover")
        assert r.status_code == 200
        assert "note" in r.json()

    def test_test_connection_fake_host(self, s):
        r = s.post(f"{API}/printers/test-connection", json={"host": "http://192.0.2.1:5000", "api_key": "fake"})
        assert r.status_code == 200
        data = r.json()
        assert data.get("ok") is False
