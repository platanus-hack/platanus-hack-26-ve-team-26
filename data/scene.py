"""The place in the video: objects that matter to a robot, on the floor around the person.

From the clip's first frame, YOLO finds the COCO objects a humanoid would bump into (chairs,
tables, a fridge, a sofa...). Each one is placed on the floor with plain geometry, no depth model:

- **The floor** is the plane under the person's feet. Their 3D pose in camera space comes from the
  same camera fit the trajectory uses (data/lift.py), so the floor's height and tilt are measured in
  the person's own meters: the feet are the scale.
- **Where an object stands** is where the ray through the bottom of its box meets that floor (the
  bottom of the box is where its legs or base touch the ground). Its width is the distance between
  the rays through the two bottom corners, its height where the ray through the top of the box passes
  over that point. What the camera cannot see, how deep the object is, comes from a typical size.

The result follows the "Escenas" format of docs/contrato.md: pos = [z, x] of the PoseClip, in
the person's meters, so physics/ turns it into solid MuJoCo geometry around the robot. data.extract
and the server make one next to every clip.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

from .lift import Lifted
from .models import MODELS_DIR

# COCO detection model. The medium one: objects in a room are often small or half hidden behind
# the person, and the small model misses chairs and sinks the medium one finds; it runs once per
# video (one frame), so its cost does not matter.
DETECT_WEIGHTS = "yolo11m.pt"

# Under 0.35 YOLO's furniture guesses on a single frame are often wrong (a shadow read as a chair);
# a wrong solid object in the robot's way is worse than a missing one.
MIN_CONFIDENCE = 0.35


@dataclass(frozen=True)
class Kind:
    label: str  # what physics/ and the web call it (physics/src/scenes.js colors by label)
    shape: str  # "box" | "cylinder"
    depth: float  # m, the typical size along the camera's line of sight, which one image cannot measure
    movable: bool = False
    mass: float | None = None  # kg, for movable objects
    base: float = 0.0  # m, how high the bottom of the box usually is above the floor (0: it stands on it)
    max_width: float | None = None  # m, the widest its base gets, when the box also holds what spreads above it


# The COCO classes that are solid obstacles for a robot on the floor, with typical depths (furniture
# catalogs: a dining chair is ~0.5 m deep, a fridge ~0.7, a kitchen counter 0.6) and masses. People
# are left out (they move), and so are things that sit on other furniture (a TV, a microwave, a
# laptop): their box does not touch the floor, so nothing places them; the table under them is
# detected on its own.
KINDS: dict[str, Kind] = {
    "chair": Kind("silla", "box", 0.5, movable=True, mass=5),
    "couch": Kind("sofa", "box", 0.9),
    "bed": Kind("cama", "box", 1.9),
    "dining table": Kind("mesa", "box", 0.9),
    "toilet": Kind("inodoro", "box", 0.7),
    "refrigerator": Kind("heladera", "box", 0.7),
    "oven": Kind("cocina", "box", 0.6),
    # COCO's sink box is the basin, which sits in a counter: its bottom is ~0.7 m above the floor (a
    # counter is 0.9 m high and a basin ~0.2 m deep). The solid object is the counter under it.
    "sink": Kind("mesada", "box", 0.6, base=0.7),
    "bench": Kind("banco", "box", 0.45),
    # A plant's box holds its leaves; the solid part is the pot, at most ~0.6 m across.
    "potted plant": Kind("maceta", "cylinder", 0.0, movable=True, mass=5, max_width=0.6),
    "suitcase": Kind("valija", "box", 0.25, movable=True, mass=8),
    "fire hydrant": Kind("hidrante", "cylinder", 0.0, max_width=0.4),
    "bicycle": Kind("bicicleta", "box", 0.5, movable=True, mass=12),
    "motorcycle": Kind("moto", "box", 0.8),
    "car": Kind("auto", "box", 1.8),
}

# Rooms with these have tile floors (kitchens, bathrooms): a hint for the world's friction. 0.6 is
# rubber soles on dry ceramic tile, between "plano" (1.0) and "resbaloso" (0.25 to 0.45).
TILE_ROOMS = {"refrigerator", "oven", "sink", "toilet"}
TILE_FRICTION = 0.6

# The floor is measured over the clip's first half second: long enough for several frames of the
# planted foot, short enough that a camera panning to follow the person has barely moved.
FLOOR_WINDOW_S = 0.5

# A box within 2 px of the image edge is cut by it: the object goes on outside the picture.
EDGE_PX = 2
# Cut at the bottom, its base is outside the picture and the floor point would be too near: dropped.
# Cut at a side or the top, it is still placed, with less confidence (width or height comes out short).
CUT_CONFIDENCE = 0.6

# The person walked there, so nothing solid stood on their path: half a shoulder width (0.25 m)
# plus a margin. An object closer than that to the hips' path is a depth error along the camera
# ray, so it is moved along that ray (forward or back, whichever is shorter) until it clears.
PATH_CLEARANCE_M = 0.35
MAX_SHIFT_M = 3.0

# A ray must reach the floor within this distance; beyond it the bottom of the box is near the
# horizon and the point is meaningless (a tiny error in the floor's tilt moves it meters).
MAX_DISTANCE_M = 15.0

# MediaPipe points: shoulders, hips, and the feet (ankle, heel, toe per side).
SHOULDERS, HIPS = (11, 12), (23, 24)
FEET = (27, 28, 29, 30, 31, 32)


def detector_path() -> Path:
    # Ultralytics downloads the weights to this exact path when it does not exist yet.
    MODELS_DIR.mkdir(exist_ok=True)
    return MODELS_DIR / DETECT_WEIGHTS


def _unit(v: np.ndarray) -> np.ndarray:
    return v / (np.linalg.norm(v) + 1e-12)


def floor_plane(points: np.ndarray, fps: float) -> tuple[np.ndarray, float]:
    """(n, d): the floor is n·P = d in camera space, n pointing up, from the first FLOOR_WINDOW_S.

    Up is the median direction from hips to shoulders. People lean forward walking, so the part of
    it along the direction the hips move is removed: what remains is the true vertical, give or take
    a sideways tilt. The floor is at the median height of the lowest foot point.
    """
    k = max(2, int(round(FLOOR_WINDOW_S * fps)))
    p = points[:k]
    up = _unit(np.median(p[:, SHOULDERS].mean(axis=1) - p[:, HIPS].mean(axis=1), axis=0))
    walk = p[-1, HIPS].mean(axis=0) - p[0, HIPS].mean(axis=0)
    walk -= (walk @ up) * up
    if np.linalg.norm(walk) > 0.1:  # 10 cm in half a second: walking, not standing
        w = _unit(walk)
        up = _unit(up - (up @ w) * w)
    d = float(np.median((p[:, FEET] @ up).min(axis=1)))
    return up, d


def _ray(u: float, v: float, f: float, c: np.ndarray) -> np.ndarray:
    return _unit(np.array([(u - c[0]) / f, (v - c[1]) / f, 1.0]))


def _on_plane(ray: np.ndarray, n: np.ndarray, d: float) -> np.ndarray | None:
    """Where a ray from the camera meets n·P = d, or None if it does not (or too far away)."""
    den = ray @ n
    if abs(den) < 1e-6:
        return None
    s = d / den
    return ray * s if 0 < s < MAX_DISTANCE_M else None


def _height_over(point: np.ndarray, n: np.ndarray, ray: np.ndarray) -> float:
    """How high above `point` (along n) the ray from the camera passes: closest approach of the two lines."""
    # point + h n ≈ t ray. Least squares in (h, t).
    a = np.column_stack([n, -ray])
    (h, _), *_ = np.linalg.lstsq(a, -point, rcond=None)
    return float(h)


def _clearance(center: np.ndarray, half: np.ndarray, yaw: float, path: np.ndarray) -> float:
    """Distance from the path's points to an oriented rectangle on the floor (0 if inside)."""
    c, s = np.cos(yaw), np.sin(yaw)
    rel = path - center
    local = np.column_stack([rel @ [c, s], rel @ [-s, c]])
    out = np.maximum(np.abs(local) - half, 0)
    return float(np.linalg.norm(out, axis=1).min())


def build_scene(detections: list[tuple[str, float, np.ndarray]], lifted: Lifted, fps: float,
                size: tuple[int, int], clip_id: str) -> dict:
    """detections: (COCO name, confidence, box xyxy px) of the clip's first frame -> the scene."""
    width, height = size
    f = lifted.focal
    c = np.array([width / 2, height / 2])
    n, d = floor_plane(lifted.camera_points, fps)

    # The PoseClip's floor axes in camera space: its x is the image's right, levelled onto the floor;
    # its z points toward the camera. The origin is under the hips of the first frame.
    ex = _unit(np.array([1.0, 0, 0]) - n[0] * n)
    ez = np.cross(ex, n)
    hips0 = lifted.camera_points[0, HIPS].mean(axis=0)
    origin = hips0 - (hips0 @ n - d) * n

    def to_robot(p: np.ndarray) -> np.ndarray:
        """Camera space -> [x, y] of the scene: [z, x] of the PoseClip."""
        rel = p - origin
        return np.array([rel @ ez, rel @ ex])

    def along_robot(v: np.ndarray) -> np.ndarray:
        return _unit(np.array([v @ ez, v @ ex]))

    # The hips' path in scene axes, from the PoseClip itself (it is what the robot follows).
    hips = lifted.joints[:, HIPS, :3].mean(axis=1)
    path = np.column_stack([hips[:, 2], hips[:, 0]])
    travel = path[-1] - path[0]
    # Furniture is laid out along the way people walk. With no real travel (in place), the image
    # plane is the best guess: objects face the camera.
    heading = np.arctan2(travel[1], travel[0]) if np.linalg.norm(travel) > 0.5 else np.pi / 2
    # At yaw 0 a box's width (size[1]) runs along the scene's y; turned so it runs along the path,
    # folded into [-90°, 90°) because a box turned 180° is the same box.
    yaw = float(heading % np.pi - np.pi / 2)

    objects, notes, skipped = [], [], []
    for name, conf, box in detections:
        kind = KINDS.get(name)
        if kind is None:
            continue
        x0, y0, x1, y1 = (float(v) for v in box)
        if y1 >= height - EDGE_PX:
            skipped.append(f"{kind.label} (cortada abajo)")
            continue
        base_d = d + kind.base
        left, right = _on_plane(_ray(x0, y1, f, c), n, base_d), _on_plane(_ray(x1, y1, f, c), n, base_d)
        mid_ray = _ray((x0 + x1) / 2, y1, f, c)
        front = _on_plane(mid_ray, n, base_d)
        if front is None or left is None or right is None:
            skipped.append(f"{kind.label} (su base no toca el piso visible)")
            continue
        w = float(np.linalg.norm(right - left))
        top = _height_over(front, n, _ray((x0 + x1) / 2, y0, f, c)) + kind.base
        if not (0.1 < w < 6 and 0.1 < top < 3):
            skipped.append(f"{kind.label} (medidas imposibles: {w:.1f} × {top:.1f} m)")
            continue
        if kind.max_width:
            w = min(w, kind.max_width)
        cut = x0 <= EDGE_PX or x1 >= width - EDGE_PX or y0 <= EDGE_PX
        depth = kind.depth if kind.shape == "box" else w
        # The bottom of the box is the object's front edge; its center is half its depth further away.
        sight = mid_ray - (mid_ray @ n) * n
        center = to_robot(front - (front @ n - d) * n) + along_robot(sight) * depth / 2
        size_xyz = [w, w, top] if kind.shape == "cylinder" else [depth, w, top]
        half = np.array(size_xyz[:2]) / 2
        # Moved off the person's path along the camera ray, if it stands on it.
        if _clearance(center, half, yaw, path) < PATH_CLEARANCE_M:
            back = along_robot(sight)
            for step in np.arange(0.05, MAX_SHIFT_M, 0.05):
                moved = next((center + sgn * step * back for sgn in (1, -1)
                              if _clearance(center + sgn * step * back, half, yaw, path) >= PATH_CLEARANCE_M), None)
                if moved is not None:
                    notes.append(f"{kind.label} corrida {step:.2f} m fuera del recorrido")
                    center = moved
                    break
            else:
                skipped.append(f"{kind.label} (encima del recorrido)")
                continue
        obj = {
            "label": kind.label,
            "kind": kind.shape,
            "size": [round(v, 2) for v in size_xyz],
            "pos": [round(float(v), 2) for v in center],
            "yaw": round(yaw, 2),
            "movable": kind.movable,
            "confidence": round(conf * (CUT_CONFIDENCE if cut else 1.0), 2),
        }
        if kind.movable:
            obj["mass"] = kind.mass
        objects.append(obj)

    names = {name for name, _, _ in detections}
    tile = bool(names & TILE_ROOMS)
    cam_height = -d
    why = (f"Detectado con {DETECT_WEIGHTS} en el primer cuadro del clip. Piso: el plano bajo los pies de la "
           f"persona, con la cámara a {cam_height:.2f} m de altura; cada objeto se apoya donde el rayo por la base "
           f"de su caja toca ese piso, su ancho y alto se miden en la imagen y el fondo es un tamaño típico. "
           f"El rumbo sigue el recorrido de la persona. Fricción: "
           + ("piso de baldosa (cocina o baño)." if tile else "sin pistas, la del mundo."))
    if notes:
        why += " " + "; ".join(notes) + "."
    if skipped:
        why += " Sin ubicar: " + ", ".join(skipped) + "."
    return {
        "id": clip_id,
        "title": "Lugar del video",
        "floor": {"friction_hint": TILE_FRICTION if tile else None},
        "objects": objects,
        "why": why,
    }


def detect(frame: np.ndarray) -> list[tuple[str, float, np.ndarray]]:
    from ultralytics import YOLO  # heavy import, only when a scene is made

    res = YOLO(str(detector_path()))(frame, verbose=False, conf=MIN_CONFIDENCE)[0]
    return [(res.names[int(k)], float(p), b) for k, p, b in zip(res.boxes.cls, res.boxes.conf, res.boxes.xyxy.cpu().numpy())]


def read_frame(video: Path, index: int) -> np.ndarray:
    cap = cv2.VideoCapture(str(video))
    # Decode up to the frame: seeking by index is not frame-exact on every codec (as in lift.py).
    for _ in range(index):
        cap.grab()
    ok, frame = cap.read()
    cap.release()
    if not ok:
        raise RuntimeError(f"no se pudo leer el cuadro {index} del video")
    return frame


def scene_of(video: Path, lifted: Lifted, fps: float, clip_id: str) -> dict:
    """The scene of a clip from its video. Never fails the clip: a problem gives an empty scene."""
    try:
        frame = read_frame(video, int(lifted.frame_index[0]))
        h, w = frame.shape[:2]
        return build_scene(detect(frame), lifted, fps, (w, h), clip_id)
    except Exception as e:  # the PoseClip is what matters; a scene is a bonus
        return empty_scene(clip_id, f"No se pudo estimar el lugar: {e}")


def empty_scene(clip_id: str, why: str) -> dict:
    return {"id": clip_id, "title": "Lugar del video", "floor": {"friction_hint": None}, "objects": [], "why": why}


def write_scene(scene: dict, out: Path) -> Path:
    out.mkdir(parents=True, exist_ok=True)
    path = out / f"{scene['id']}.json"
    path.write_text(json.dumps(scene, ensure_ascii=False, indent=2) + "\n")
    return path
