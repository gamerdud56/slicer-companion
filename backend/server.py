from fastapi import FastAPI, APIRouter, UploadFile, File, HTTPException, Form
from fastapi.responses import Response, FileResponse
from fastapi.concurrency import run_in_threadpool
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import io
import math
import struct
import logging
import uuid
import requests
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# ---------- Mongo ----------
mongo_url = os.environ["MONGO_URL"]
mongo_client = AsyncIOMotorClient(mongo_url)
db = mongo_client[os.environ["DB_NAME"]]

# ---------- Object storage ----------
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "slicer-companion"
storage_key: Optional[str] = None

def init_storage():
    global storage_key
    if storage_key:
        return storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    storage_key = resp.json()["storage_key"]
    return storage_key

def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data, timeout=180,
    )
    resp.raise_for_status()
    return resp.json()

def get_object(path: str) -> tuple[bytes, str]:
    key = init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=120)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


app = FastAPI(title="Slicer Companion API")
api_router = APIRouter(prefix="/api")


# =====================================================
#                    MODELS
# =====================================================
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class Transform(BaseModel):
    position: List[float] = [0.0, 0.0, 0.0]
    rotation: List[float] = [0.0, 0.0, 0.0]
    scale: List[float] = [1.0, 1.0, 1.0]


class ModelDoc(BaseModel):
    id: str
    filename: str
    storage_path: str
    size_bytes: int
    bounding_box: Dict[str, List[float]]  # {"min":[x,y,z], "max":[x,y,z]}
    transform: Transform = Field(default_factory=Transform)
    created_at: str


class PrinterProfile(BaseModel):
    id: str
    name: str
    manufacturer: str
    bed_size: List[float]  # [x, y, z] mm
    nozzle_diameter: float = 0.4
    max_nozzle_temp: int = 260
    max_bed_temp: int = 100
    firmware: str = "Marlin"
    is_default: bool = False
    connection: Optional[Dict[str, Any]] = None  # {type:"octoprint"|"moonraker", host, api_key}
    created_at: str


class PrinterProfileCreate(BaseModel):
    name: str
    manufacturer: str = "Custom"
    bed_size: List[float] = [220, 220, 250]
    nozzle_diameter: float = 0.4
    max_nozzle_temp: int = 260
    max_bed_temp: int = 100
    firmware: str = "Marlin"
    connection: Optional[Dict[str, Any]] = None


class PrinterProfileUpdate(BaseModel):
    name: Optional[str] = None
    manufacturer: Optional[str] = None
    bed_size: Optional[List[float]] = None
    nozzle_diameter: Optional[float] = None
    max_nozzle_temp: Optional[int] = None
    max_bed_temp: Optional[int] = None
    firmware: Optional[str] = None
    connection: Optional[Dict[str, Any]] = None


class FilamentProfile(BaseModel):
    id: str
    name: str
    material: str  # PLA / ABS / PETG / TPU / Custom
    color: str = "#F56B00"
    nozzle_temp: int = 210
    bed_temp: int = 60
    fan_speed: int = 100
    flow_multiplier: float = 1.0
    retraction_distance: float = 5.0
    retraction_speed: float = 45.0
    price_per_kg: float = 25.0
    spool_weight_g: float = 1000.0
    grams_used: float = 0.0
    is_default: bool = False
    created_at: str


class FilamentProfileCreate(BaseModel):
    name: str
    material: str = "PLA"
    color: str = "#F56B00"
    nozzle_temp: int = 210
    bed_temp: int = 60
    fan_speed: int = 100
    flow_multiplier: float = 1.0
    retraction_distance: float = 5.0
    retraction_speed: float = 45.0
    price_per_kg: float = 25.0
    spool_weight_g: float = 1000.0
    grams_used: float = 0.0


class FilamentProfileUpdate(BaseModel):
    name: Optional[str] = None
    material: Optional[str] = None
    color: Optional[str] = None
    nozzle_temp: Optional[int] = None
    bed_temp: Optional[int] = None
    fan_speed: Optional[int] = None
    flow_multiplier: Optional[float] = None
    retraction_distance: Optional[float] = None
    retraction_speed: Optional[float] = None
    price_per_kg: Optional[float] = None
    spool_weight_g: Optional[float] = None
    grams_used: Optional[float] = None


class PrintSettings(BaseModel):
    layer_height: float = 0.2
    initial_layer_height: float = 0.24
    wall_line_count: int = 3
    top_bottom_layers: int = 4
    infill_density: int = 20  # %
    infill_pattern: str = "grid"
    print_speed: int = 60
    travel_speed: int = 150
    nozzle_temp: int = 210
    bed_temp: int = 60
    z_offset: float = 0.0
    supports: bool = False
    adhesion: str = "none"  # none / skirt / brim / raft


class SliceRequest(BaseModel):
    model_id: str
    settings: PrintSettings
    printer_profile_id: Optional[str] = None
    filament_profile_id: Optional[str] = None


class TransformUpdate(BaseModel):
    transform: Transform


class UsageLog(BaseModel):
    grams: float


class PresetCreate(BaseModel):
    name: str
    settings: PrintSettings


class OctoPrintTest(BaseModel):
    host: str
    api_key: str = ""
    type: str = "octoprint"  # octoprint | moonraker


class OctoPrintPrintRequest(BaseModel):
    printer_profile_id: str
    model_id: str
    settings: PrintSettings
    filament_profile_id: Optional[str] = None
    filament_grams: Optional[float] = None


# =====================================================
#                    STL PARSING
# =====================================================
def parse_stl_binary(data: bytes):
    """Parse a binary STL file. Returns list of triangles [(v0,v1,v2), ...]"""
    if len(data) < 84:
        raise ValueError("STL too small")
    n = struct.unpack("<I", data[80:84])[0]
    expected = 84 + n * 50
    triangles = []
    if expected == len(data):
        # Binary STL
        for i in range(n):
            off = 84 + i * 50
            # skip normal (12) - read 3 vertices (36) - skip attribute (2)
            v = struct.unpack("<9f", data[off + 12: off + 48])
            triangles.append(((v[0], v[1], v[2]), (v[3], v[4], v[5]), (v[6], v[7], v[8])))
        return triangles
    # ASCII STL
    text = data.decode("utf-8", errors="ignore")
    tri = []
    verts = []
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("vertex"):
            parts = line.split()
            verts.append((float(parts[1]), float(parts[2]), float(parts[3])))
            if len(verts) == 3:
                tri.append(tuple(verts))
                verts = []
    return tri


def compute_bounds(triangles):
    if not triangles:
        return {"min": [0, 0, 0], "max": [0, 0, 0]}
    xs, ys, zs = [], [], []
    for t in triangles:
        for v in t:
            xs.append(v[0]); ys.append(v[1]); zs.append(v[2])
    return {"min": [min(xs), min(ys), min(zs)], "max": [max(xs), max(ys), max(zs)]}


def slice_triangles_at_z(triangles, z, transform: Transform):
    """Return list of line segments [ [(x1,y1),(x2,y2)], ... ] at horizontal plane z."""
    sx, sy, sz = transform.scale
    px, py, pz = transform.position
    segs = []
    for tri in triangles:
        # apply scale + position (rotation omitted for perf; z rotation approx)
        pts = [(v[0] * sx + px, v[1] * sy + py, v[2] * sz + pz) for v in tri]
        above = [p for p in pts if p[2] > z]
        below = [p for p in pts if p[2] <= z]
        if len(above) == 0 or len(below) == 0:
            continue
        # Find intersecting edges
        inter = []
        for i in range(3):
            a = pts[i]; b = pts[(i + 1) % 3]
            if (a[2] > z) != (b[2] > z):
                t = (z - a[2]) / (b[2] - a[2]) if b[2] != a[2] else 0
                x = a[0] + t * (b[0] - a[0])
                y = a[1] + t * (b[1] - a[1])
                inter.append((x, y))
        if len(inter) == 2:
            segs.append([list(inter[0]), list(inter[1])])
    return segs


def generate_layers(triangles, transform: Transform, layer_height: float, max_layers: int = 400):
    bb = compute_bounds(triangles)
    sx, sy, sz = transform.scale
    px, py, pz = transform.position
    zmin = bb["min"][2] * sz + pz
    zmax = bb["max"][2] * sz + pz
    height = max(zmax - zmin, 0.1)
    total = min(max_layers, max(2, int(math.ceil(height / max(layer_height, 0.05)))))
    step = height / total
    layers = []
    for i in range(total):
        z = zmin + step * (i + 0.5)
        segs = slice_triangles_at_z(triangles, z, transform)
        layers.append({"z": round(z, 3), "segments": segs})
    return layers, bb, height


# =====================================================
#                    STARTUP SEED
# =====================================================
DEFAULT_PRINTERS = [
    {"name": "Prusa MK4", "manufacturer": "Prusa Research", "bed_size": [250, 210, 220], "nozzle_diameter": 0.4, "max_nozzle_temp": 290, "max_bed_temp": 120, "firmware": "Marlin/Buddy"},
    {"name": "Bambu Lab X1 Carbon", "manufacturer": "Bambu Lab", "bed_size": [256, 256, 256], "nozzle_diameter": 0.4, "max_nozzle_temp": 300, "max_bed_temp": 120, "firmware": "Bambu"},
    {"name": "Creality Ender 3 V3", "manufacturer": "Creality", "bed_size": [220, 220, 250], "nozzle_diameter": 0.4, "max_nozzle_temp": 260, "max_bed_temp": 110, "firmware": "Marlin"},
    {"name": "Voron 2.4 R2", "manufacturer": "Voron", "bed_size": [350, 350, 350], "nozzle_diameter": 0.4, "max_nozzle_temp": 300, "max_bed_temp": 120, "firmware": "Klipper"},
    {"name": "Anycubic Kobra 2 Pro", "manufacturer": "Anycubic", "bed_size": [220, 220, 250], "nozzle_diameter": 0.4, "max_nozzle_temp": 260, "max_bed_temp": 110, "firmware": "Marlin"},
]

DEFAULT_FILAMENTS = [
    {"name": "Generic PLA", "material": "PLA", "color": "#F56B00", "nozzle_temp": 210, "bed_temp": 60, "fan_speed": 100, "price_per_kg": 22.0},
    {"name": "Generic PETG", "material": "PETG", "color": "#3AA0FF", "nozzle_temp": 235, "bed_temp": 80, "fan_speed": 50, "price_per_kg": 26.0},
    {"name": "Generic ABS", "material": "ABS", "color": "#1A1A1A", "nozzle_temp": 245, "bed_temp": 100, "fan_speed": 20, "price_per_kg": 24.0},
    {"name": "Generic TPU", "material": "TPU", "color": "#34C759", "nozzle_temp": 225, "bed_temp": 50, "fan_speed": 70, "retraction_distance": 2.0, "price_per_kg": 35.0},
]

DEFAULT_PRESETS = [
    {"name": "Draft", "settings": {"layer_height": 0.28, "initial_layer_height": 0.3, "wall_line_count": 2, "top_bottom_layers": 3, "infill_density": 15, "infill_pattern": "grid", "print_speed": 80, "travel_speed": 175, "nozzle_temp": 210, "bed_temp": 60, "z_offset": 0.0, "supports": False, "adhesion": "skirt"}},
    {"name": "Standard", "settings": {"layer_height": 0.2, "initial_layer_height": 0.24, "wall_line_count": 3, "top_bottom_layers": 4, "infill_density": 20, "infill_pattern": "grid", "print_speed": 60, "travel_speed": 150, "nozzle_temp": 210, "bed_temp": 60, "z_offset": 0.0, "supports": False, "adhesion": "skirt"}},
    {"name": "Fine", "settings": {"layer_height": 0.12, "initial_layer_height": 0.16, "wall_line_count": 4, "top_bottom_layers": 5, "infill_density": 25, "infill_pattern": "grid", "print_speed": 45, "travel_speed": 150, "nozzle_temp": 205, "bed_temp": 60, "z_offset": 0.0, "supports": False, "adhesion": "skirt"}},
]


@app.on_event("startup")
async def on_startup():
    # storage init (non-fatal)
    try:
        await run_in_threadpool(init_storage)
    except Exception as e:
        logging.warning(f"Storage init failed: {e}")
    # seed printers
    count_p = await db.printer_profiles.count_documents({"is_default": True})
    if count_p == 0:
        for p in DEFAULT_PRINTERS:
            doc = {"id": str(uuid.uuid4()), "is_default": True, "connection": None, "created_at": now_iso(), **p}
            await db.printer_profiles.insert_one(doc)
    count_f = await db.filament_profiles.count_documents({"is_default": True})
    if count_f == 0:
        for f in DEFAULT_FILAMENTS:
            doc = {
                "id": str(uuid.uuid4()), "is_default": True, "created_at": now_iso(),
                "flow_multiplier": 1.0, "retraction_distance": 5.0, "retraction_speed": 45.0,
                "price_per_kg": 25.0, "spool_weight_g": 1000.0,
                **f,
            }
            await db.filament_profiles.insert_one(doc)
    # migrate existing filaments missing pricing fields
    await db.filament_profiles.update_many(
        {"price_per_kg": {"$exists": False}},
        {"$set": {"price_per_kg": 25.0, "spool_weight_g": 1000.0}},
    )
    await db.filament_profiles.update_many(
        {"grams_used": {"$exists": False}}, {"$set": {"grams_used": 0.0}}
    )
    # seed slice presets
    count_pr = await db.slice_presets.count_documents({"is_default": True})
    if count_pr == 0:
        for pr in DEFAULT_PRESETS:
            await db.slice_presets.insert_one({"id": str(uuid.uuid4()), "is_default": True, "created_at": now_iso(), **pr})


@app.on_event("shutdown")
async def on_shutdown():
    mongo_client.close()


# =====================================================
#                    ROUTES
# =====================================================
@api_router.get("/")
async def root():
    return {"service": "Slicer Companion API", "status": "ok"}


# ---------- Viewer assets (self-hosted Three.js, no CDN dependency) ----------
VIEWER_DIR = ROOT_DIR / "static" / "viewer"
VIEWER_FILES = {"three.min.js", "OrbitControls.js", "STLLoader.js"}


@api_router.get("/viewer/{filename}")
async def viewer_asset(filename: str):
    if filename not in VIEWER_FILES:
        raise HTTPException(status_code=404, detail="Not found")
    path = VIEWER_DIR / filename
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(path, media_type="application/javascript")


# ---------- Models ----------
@api_router.post("/models/upload")
async def upload_model(file: UploadFile = File(...)):
    data = await file.read()
    if len(data) > 50 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (>50MB)")
    try:
        triangles = parse_stl_binary(data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid STL: {e}")
    if not triangles:
        raise HTTPException(status_code=400, detail="STL contains no triangles")

    bb = compute_bounds(triangles)
    model_id = str(uuid.uuid4())
    ext = "stl"
    storage_path = f"{APP_NAME}/uploads/local/{model_id}.{ext}"
    try:
        await run_in_threadpool(put_object, storage_path, data, "application/sla")
    except Exception as e:
        logging.exception("storage upload failed")
        raise HTTPException(status_code=500, detail=f"Storage upload failed: {e}")

    doc = {
        "id": model_id,
        "filename": file.filename or f"{model_id}.stl",
        "storage_path": storage_path,
        "size_bytes": len(data),
        "bounding_box": bb,
        "transform": Transform().dict(),
        "triangle_count": len(triangles),
        "created_at": now_iso(),
    }
    await db.models.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/models")
async def list_models():
    docs = await db.models.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return docs


@api_router.get("/models/{model_id}")
async def get_model(model_id: str):
    doc = await db.models.find_one({"id": model_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Model not found")
    return doc


@api_router.get("/models/{model_id}/file")
async def download_model_file(model_id: str):
    doc = await db.models.find_one({"id": model_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Model not found")
    content, ctype = await run_in_threadpool(get_object, doc["storage_path"])
    return Response(content=content, media_type=ctype or "application/sla")


@api_router.patch("/models/{model_id}/transform")
async def update_model_transform(model_id: str, payload: TransformUpdate):
    res = await db.models.update_one({"id": model_id}, {"$set": {"transform": payload.transform.dict()}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Model not found")
    doc = await db.models.find_one({"id": model_id}, {"_id": 0})
    return doc


@api_router.delete("/models/{model_id}")
async def delete_model(model_id: str):
    res = await db.models.delete_one({"id": model_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Model not found")
    return {"ok": True}


# ---------- Printer Profiles ----------
@api_router.get("/printers")
async def list_printers():
    return await db.printer_profiles.find({}, {"_id": 0}).sort("is_default", -1).to_list(200)


@api_router.post("/printers")
async def create_printer(payload: PrinterProfileCreate):
    doc = {"id": str(uuid.uuid4()), "is_default": False, "created_at": now_iso(), **payload.dict()}
    await db.printer_profiles.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.patch("/printers/{printer_id}")
async def update_printer(printer_id: str, payload: PrinterProfileUpdate):
    updates = {k: v for k, v in payload.dict().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No updates")
    res = await db.printer_profiles.update_one({"id": printer_id}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Printer not found")
    doc = await db.printer_profiles.find_one({"id": printer_id}, {"_id": 0})
    return doc


@api_router.delete("/printers/{printer_id}")
async def delete_printer(printer_id: str):
    doc = await db.printer_profiles.find_one({"id": printer_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Printer not found")
    if doc.get("is_default"):
        raise HTTPException(status_code=400, detail="Cannot delete default profiles")
    await db.printer_profiles.delete_one({"id": printer_id})
    return {"ok": True}


# ---------- Filament Profiles ----------
@api_router.get("/filaments")
async def list_filaments():
    return await db.filament_profiles.find({}, {"_id": 0}).sort("is_default", -1).to_list(200)


@api_router.post("/filaments")
async def create_filament(payload: FilamentProfileCreate):
    doc = {"id": str(uuid.uuid4()), "is_default": False, "created_at": now_iso(), **payload.dict()}
    await db.filament_profiles.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.patch("/filaments/{filament_id}")
async def update_filament(filament_id: str, payload: FilamentProfileUpdate):
    updates = {k: v for k, v in payload.dict().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No updates")
    res = await db.filament_profiles.update_one({"id": filament_id}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Filament not found")
    doc = await db.filament_profiles.find_one({"id": filament_id}, {"_id": 0})
    return doc


@api_router.delete("/filaments/{filament_id}")
async def delete_filament(filament_id: str):
    doc = await db.filament_profiles.find_one({"id": filament_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Filament not found")
    if doc.get("is_default"):
        raise HTTPException(status_code=400, detail="Cannot delete default profiles")
    await db.filament_profiles.delete_one({"id": filament_id})
    return {"ok": True}


@api_router.post("/filaments/{filament_id}/usage")
async def log_filament_usage(filament_id: str, payload: UsageLog):
    res = await db.filament_profiles.update_one({"id": filament_id}, {"$inc": {"grams_used": float(payload.grams)}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Filament not found")
    return await db.filament_profiles.find_one({"id": filament_id}, {"_id": 0})


# ---------- Slice Presets ----------
@api_router.get("/presets")
async def list_presets():
    return await db.slice_presets.find({}, {"_id": 0}).sort([("is_default", -1), ("created_at", 1)]).to_list(100)


@api_router.post("/presets")
async def create_preset(payload: PresetCreate):
    doc = {"id": str(uuid.uuid4()), "name": payload.name, "settings": payload.settings.dict(), "is_default": False, "created_at": now_iso()}
    await db.slice_presets.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.delete("/presets/{preset_id}")
async def delete_preset(preset_id: str):
    doc = await db.slice_presets.find_one({"id": preset_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Preset not found")
    if doc.get("is_default"):
        raise HTTPException(status_code=400, detail="Cannot delete default presets")
    await db.slice_presets.delete_one({"id": preset_id})
    return {"ok": True}


# ---------- Slicing ----------
@api_router.post("/slice")
async def slice_model(req: SliceRequest):
    model = await db.models.find_one({"id": req.model_id}, {"_id": 0})
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
    printer = None
    if req.printer_profile_id:
        printer = await db.printer_profiles.find_one({"id": req.printer_profile_id}, {"_id": 0})
    filament = None
    if req.filament_profile_id:
        filament = await db.filament_profiles.find_one({"id": req.filament_profile_id}, {"_id": 0})

    content, _ = await run_in_threadpool(get_object, model["storage_path"])
    triangles = parse_stl_binary(content)
    transform = Transform(**model.get("transform", {}))

    layer_height = max(req.settings.layer_height, 0.05)
    layers, bb, height = generate_layers(triangles, transform, layer_height)

    # Simple estimates
    volume_mm3 = max((bb["max"][0] - bb["min"][0]) * (bb["max"][1] - bb["min"][1]) * (bb["max"][2] - bb["min"][2]), 1.0)
    infill_factor = 0.15 + (req.settings.infill_density / 100.0) * 0.85
    filament_volume = volume_mm3 * infill_factor * 0.35
    filament_length_mm = filament_volume / (math.pi * (1.75 / 2) ** 2)
    filament_grams = filament_volume * 0.00124
    est_time_min = (len(layers) * 45) / max(req.settings.print_speed, 20)
    estimated_cost = None
    if filament and filament.get("price_per_kg"):
        estimated_cost = round((filament_grams / 1000.0) * float(filament["price_per_kg"]), 2)

    result = {
        "model_id": req.model_id,
        "settings": req.settings.dict(),
        "printer": printer,
        "filament": filament,
        "layer_count": len(layers),
        "layers": layers,
        "bounding_box": bb,
        "height_mm": round(height, 2),
        "filament_length_mm": round(filament_length_mm, 1),
        "filament_grams": round(filament_grams, 1),
        "estimated_cost": estimated_cost,
        "estimated_time_min": round(est_time_min, 1),
        "created_at": now_iso(),
    }
    return result


# ---------- Printer Discovery & Connection ----------
@api_router.get("/printers/discover")
async def discover_printers():
    """Best-effort local network scan. On sandboxed environments returns hints for manual add."""
    # Real mDNS scan requires zeroconf and multicast, which our container doesn't have.
    # Return a helpful response for the UI.
    return {
        "note": "Local network discovery requires the app to be on the same WiFi as your printer. If nothing is found, add manually via IP.",
        "discovered": [],
    }


@api_router.post("/printers/test-connection")
async def test_printer_connection(payload: OctoPrintTest):
    host = payload.host.rstrip("/")
    if not host.startswith("http"):
        host = "http://" + host
    headers = {"X-Api-Key": payload.api_key} if payload.api_key else {}
    try:
        if payload.type == "moonraker":
            r = await run_in_threadpool(requests.get, f"{host}/printer/info", headers=headers, timeout=8)
            if r.status_code == 200:
                info = r.json().get("result", {})
                server = ("Klipper " + str(info.get("software_version", ""))).strip()
                return {"ok": True, "host": host, "version": {"server": server, "type": "moonraker"}}
            return {"ok": False, "status": r.status_code, "message": r.text[:200]}
        r = await run_in_threadpool(
            requests.get, f"{host}/api/version", headers=headers, timeout=8
        )
        if r.status_code == 200:
            data = r.json()
            return {"ok": True, "host": host, "version": data}
        return {"ok": False, "status": r.status_code, "message": r.text[:200]}
    except Exception as e:
        return {"ok": False, "message": str(e)}


@api_router.get("/printers/{printer_id}/status")
async def printer_status(printer_id: str):
    printer = await db.printer_profiles.find_one({"id": printer_id}, {"_id": 0})
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")
    conn = printer.get("connection")
    if not conn or not conn.get("host"):
        return {"ok": False, "message": "No connection configured"}
    host = conn.get("host", "").rstrip("/")
    if not host.startswith("http"):
        host = "http://" + host
    api_key = conn.get("api_key", "")
    headers = {"X-Api-Key": api_key} if api_key else {}
    try:
        if conn.get("type") == "moonraker":
            r = await run_in_threadpool(
                requests.get, f"{host}/printer/objects/query?extruder&heater_bed", headers=headers, timeout=6
            )
            if r.status_code == 200:
                st = r.json().get("result", {}).get("status", {})
                ex = st.get("extruder", {})
                hb = st.get("heater_bed", {})
                return {
                    "ok": True,
                    "nozzle": {"actual": ex.get("temperature"), "target": ex.get("target")},
                    "bed": {"actual": hb.get("temperature"), "target": hb.get("target")},
                }
            return {"ok": False, "status": r.status_code, "message": r.text[:200]}
        r = await run_in_threadpool(requests.get, f"{host}/api/printer", headers=headers, timeout=6)
        if r.status_code == 200:
            t = r.json().get("temperature", {})
            tool = t.get("tool0", {})
            bed = t.get("bed", {})
            return {
                "ok": True,
                "nozzle": {"actual": tool.get("actual"), "target": tool.get("target")},
                "bed": {"actual": bed.get("actual"), "target": bed.get("target")},
            }
        return {"ok": False, "status": r.status_code, "message": r.text[:200]}
    except Exception as e:
        return {"ok": False, "message": str(e)}


@api_router.post("/printers/print")
async def send_print_job(req: OctoPrintPrintRequest):
    printer = await db.printer_profiles.find_one({"id": req.printer_profile_id}, {"_id": 0})
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")
    if not printer.get("connection"):
        raise HTTPException(status_code=400, detail="Printer has no connection config. Add via IP first.")
    model = await db.models.find_one({"id": req.model_id}, {"_id": 0})
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")

    connection = printer["connection"]
    host = connection.get("host", "").rstrip("/")
    if not host.startswith("http"):
        host = "http://" + host
    api_key = connection.get("api_key", "")

    # Build minimal G-code header (real printers slice locally, this is a stub for demo)
    gcode = f"""; SlicerCompanion Print Job
; Model: {model['filename']}
; Layer height: {req.settings.layer_height}mm
; Infill: {req.settings.infill_density}%
M104 S{req.settings.nozzle_temp}
M140 S{req.settings.bed_temp}
M109 S{req.settings.nozzle_temp}
M190 S{req.settings.bed_temp}
G28
G1 Z{req.settings.z_offset + 0.2} F600
; ... (slicing engine placeholder)
M104 S0
M140 S0
M84
""".encode("utf-8")

    files = {"file": (f"{model['id']}.gcode", gcode, "text/plain")}
    headers = {"X-Api-Key": api_key} if api_key else {}
    conn_type = connection.get("type", "octoprint")
    upload_url = f"{host}/server/files/upload" if conn_type == "moonraker" else f"{host}/api/files/local"
    try:
        r = await run_in_threadpool(
            requests.post,
            upload_url,
            headers=headers,
            files=files,
            data={"print": "true"},
            timeout=30,
        )
        if r.status_code in (200, 201):
            if req.filament_profile_id and req.filament_grams:
                await db.filament_profiles.update_one(
                    {"id": req.filament_profile_id}, {"$inc": {"grams_used": float(req.filament_grams)}}
                )
            return {"ok": True, "message": "Print job sent", "response": r.json() if r.text else {}}
        return {"ok": False, "status": r.status_code, "message": r.text[:200]}
    except Exception as e:
        return {"ok": False, "message": str(e)}


app.include_router(api_router)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)
