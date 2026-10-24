"""HTTP server for uploaded videos and per-clip training.

    uv run --project data python -m data.server [--port 8000]

Videos: chunked upload -> queue -> PoseClip, with progress per stage. Camera clips arrive already
as PoseClips (POST /clips). Any clip can then be trained: a second queue, one at a time, runs
retarget -> training (every checkpoint exported to ONNX) -> data, each as a subprocess, and serves
the motion, the policies and the dataset. The API is in docs/contrato.md ("API del servidor de
video"). Only PoseClips and what training makes from them are kept; videos are deleted once
processed. Jobs and trainings live in memory: a restart forgets them (their files stay on disk).
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import os
import queue
import re
import shutil
import signal
import subprocess
import threading
import time
import uuid
import zipfile
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import cv2
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel

from .extract import VIDEO_EXTS, _clip_id, write_clip
from .lift import lift_subject
from .track import Subject, Tracking, select_subject, track_people

DATA_DIR = Path(os.environ.get("TRIDI_DATA_DIR", Path(__file__).parent / "server_data"))

# 8 MiB pieces: small enough to retry cheaply on a phone connection, big enough that a 1 GB
# video is ~128 requests instead of thousands.
CHUNK_SIZE = 8 * 1024 * 1024

# The server is reachable from the internet and runs on a laptop during a live demo. 60 MB is 30 s
# of 1080p phone video (~16 Mbit/s), enough for a walk or a run, and no visitor can fill the disk.
# Override with TRIDI_MAX_UPLOAD_MB.
MAX_UPLOAD = int(os.environ.get("TRIDI_MAX_UPLOAD_MB", 60)) * 1024 * 1024

# 30 s per video: a few gait cycles are all imitation needs, and it caps processing at ~2 min.
MAX_DURATION_S = float(os.environ.get("TRIDI_MAX_DURATION_S", 30))

# Only PoseClips are kept: they are the training data. A video stays 10 minutes after it is done,
# the time to pick another person in it (that re-runs the 3D on the same video), then it is deleted.
# Failed or cancelled videos go at once, and an upload nobody finishes goes after an hour.
KEEP_VIDEO_S = 10 * 60
UPLOAD_TTL_S = 60 * 60
JANITOR_EVERY_S = 30

# Browsers on these origins may call the API: the deployed web and the Vite dev servers.
# Override with TRIDI_CORS_ORIGINS (comma separated).
CORS_ORIGINS = os.environ.get(
    "TRIDI_CORS_ORIGINS", "https://tridi-alpha.vercel.app,http://localhost:5173,http://localhost:5174"
).split(",")

ID = re.compile(r"^[0-9a-f]{32}$")
CLIP_ID = re.compile(r"^clip_[A-Za-z0-9_-]+$")
POLICY_ID = re.compile(r"^clip_[A-Za-z0-9_-]+-step-\d+$")

ROOT = Path(__file__).resolve().parent.parent

# Camera clips (POST /clips). A 30 s PoseClip at 30 fps weighs ~0.9 MB (measured on data/clips/):
# 5 MB leaves room without accepting anything. Below 0.8 valid_ratio the body was missing in more
# than 1 frame of 5, and the robot would imitate the gaps; it applies to uploaded clips too.
MAX_CLIP_BYTES = 5 * 1024 * 1024
MIN_VALID_RATIO = 0.8
JOINTS = 33

# Training. 20 M steps is ~30 min with 64 robots on an M2 (11.4k steps/s); a checkpoint every 2 M
# steps gives the web a new robot every ~3 min. 3 waiting at ~30 min each: the last one waits an
# hour and a half, and more than that is no longer a demo. All three can be lowered to test the
# chain end to end (TRIDI_TRAIN_STEPS=20000 trains in seconds; the robot will not walk).
TRAIN_STEPS = int(os.environ.get("TRIDI_TRAIN_STEPS", 20_000_000))
TRAIN_EVERY = int(os.environ.get("TRIDI_TRAIN_EVERY", 2_000_000))
TRAIN_WAITING = int(os.environ.get("TRIDI_TRAIN_WAITING", 3))
ROLLOUT_EPISODES = int(os.environ.get("TRIDI_ROLLOUT_EPISODES", 8))
TRAIN_STEPS_PER_S = 11_400  # an M2, for the estimate before the first progress row
DATA_STAGE_S = 60  # retarget + dataset rollout, a rough estimate for eta_s
TRAIN_POLL_S = 2
UPLOAD_EXTS = VIDEO_EXTS | {".zip"}


@dataclass
class Upload:
    id: str
    filename: str
    size: int
    total_chunks: int
    received: set[int] = field(default_factory=set)
    touched: float = field(default_factory=time.time)  # last chunk, for abandoned uploads

    @property
    def dir(self) -> Path:
        return DATA_DIR / "uploads" / self.id


@dataclass
class Video:
    name: str
    path: Path
    stage: str = "waiting"  # waiting | tracking | pose3d | done | failed
    progress: float = 0.0
    frame_size: tuple[int, int] | None = None
    first_frame: int | None = None  # the frame where `people` are and the click goes
    people: list[dict] = field(default_factory=list)
    clip_id: str | None = None
    valid_ratio: float | None = None
    error: str | None = None
    tracking: Tracking | None = None  # kept so a new subject does not track again
    click: tuple[float, float] | None = None
    done_at: float | None = None
    deleted: bool = False  # the video file is gone; its clip stays

    def delete(self) -> None:
        self.path.unlink(missing_ok=True)
        self.path.with_suffix(".first.jpg").unlink(missing_ok=True)
        self.tracking = None
        self.deleted = True

    def public(self) -> dict:
        return {
            "name": self.name,
            "stage": self.stage,
            "progress": round(self.progress, 3),
            "frame_size": list(self.frame_size) if self.frame_size else None,
            "first_frame": self.first_frame,
            "people": self.people,
            "clip_id": self.clip_id,
            "valid_ratio": self.valid_ratio,
            "error": self.error,
        }


@dataclass
class Job:
    id: str
    videos: list[Video]
    state: str = "queued"  # queued | running | done | failed
    cancelled: bool = False

    @property
    def dir(self) -> Path:
        return DATA_DIR / "jobs" / self.id


uploads: dict[str, Upload] = {}
jobs: dict[str, Job] = {}
lock = threading.Lock()
# One worker: YOLO and MediaPipe already use the whole GPU (or CPU); two videos at once would
# each run at half speed and both users would wait longer for their first result.
work: queue.Queue[tuple[str, int | None]] = queue.Queue()
pending: list[str] = []  # job ids in the queue, for "position"


def _get(table: dict, key: str, what: str):
    if not ID.match(key) or key not in table:
        raise HTTPException(404, f"{what} no existe")
    return table[key]


# --- Worker -------------------------------------------------------------------------------------


def _process_video(job: Job, video: Video) -> None:
    def progress(stage: str, i: int, total: int) -> None:
        video.stage = "tracking" if stage == "tracking" else "pose3d"
        video.progress = i / total if total > 0 else 0.0

    if video.tracking is None:
        cap = cv2.VideoCapture(str(video.path))
        frames, fps = cap.get(cv2.CAP_PROP_FRAME_COUNT), cap.get(cv2.CAP_PROP_FPS) or 30.0
        cap.release()
        if frames / fps > MAX_DURATION_S:
            raise RuntimeError(f"el video dura {frames / fps:.0f} s y el máximo es {MAX_DURATION_S:.0f} s: recórtalo")
        video.stage, video.progress = "tracking", 0.0
        video.tracking = track_people(video.path, progress)
        tr = video.tracking
        video.frame_size = (tr.width, tr.height)
        video.first_frame = tr.first_frame
        cap = cv2.VideoCapture(str(video.path))
        for _ in range(tr.first_frame):  # decode up to it: seeking by index is not frame-exact
            cap.grab()
        ok, frame = cap.read()
        cap.release()
        if ok:
            cv2.imwrite(str(video.path.with_suffix(".first.jpg")), frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
    subject: Subject = select_subject(video.tracking, video.click)
    video.people = [
        {"track_id": t.id, "box": [round(float(v), 1) for v in t.boxes[0]], "selected": t.id == subject.track_id}
        for t in video.tracking.people_at_first_frame()
    ]
    video.stage, video.progress = "pose3d", 0.0
    lifted = lift_subject(video.path, video.tracking, subject, progress)
    _, clip = write_clip(video.tracking, subject, lifted, video.name, DATA_DIR / "clips")
    video.clip_id = clip["id"]
    video.valid_ratio = clip["quality"]["valid_ratio"]
    video.stage, video.progress = "done", 1.0


def _worker() -> None:
    while True:
        job_id, only = work.get()
        with lock:
            if job_id in pending:
                pending.remove(job_id)
            job = jobs.get(job_id)
        if job is None or job.cancelled:
            continue
        job.state = "running"
        targets = [job.videos[only]] if only is not None else job.videos
        for video in targets:
            if job.cancelled or video.deleted:
                break
            video.error = None
            try:
                _process_video(job, video)
                video.done_at = time.time()
            except Exception as e:  # one broken video must not stop the others
                video.stage = "failed"
                video.error = str(e) if isinstance(e, RuntimeError) else f"error inesperado: {e}"
                video.delete()
            if job.cancelled:  # cancelled while this video ran
                video.delete()
        job.state = "done" if any(v.stage == "done" for v in job.videos) else "failed"


def _janitor() -> None:
    while True:
        time.sleep(JANITOR_EVERY_S)
        sweep(time.time())


def sweep(now: float) -> None:
    """Deletes what is no longer needed: done videos after KEEP_VIDEO_S, abandoned uploads."""
    for job in list(jobs.values()):
        for v in job.videos:
            if v.done_at and not v.deleted and v.stage == "done" and now - v.done_at > KEEP_VIDEO_S:
                v.delete()
    for up in list(uploads.values()):
        if now - up.touched > UPLOAD_TTL_S:
            shutil.rmtree(up.dir, ignore_errors=True)
            uploads.pop(up.id, None)


def _enqueue(job: Job, only: int | None = None) -> None:
    with lock:
        pending.append(job.id)
    job.state = "queued"
    work.put((job.id, only))


def _unpack(upload: Upload, job_dir: Path, assembled: Path) -> list[Video]:
    """The uploaded file as a list of videos: itself, or each video inside the .zip."""
    if assembled.suffix.lower() != ".zip":
        return [Video(upload.filename, assembled)]
    try:
        zf = zipfile.ZipFile(assembled)
    except zipfile.BadZipFile:
        raise HTTPException(422, "el .zip está dañado")
    videos = []
    with zf:
        members = [
            m for m in zf.infolist()
            if not m.is_dir() and Path(m.filename).suffix.lower() in VIDEO_EXTS
            and not Path(m.filename).name.startswith(".") and "__MACOSX" not in m.filename
        ]
        if not members:
            raise HTTPException(422, "el .zip no tiene videos")
        if sum(m.file_size for m in members) > MAX_UPLOAD * 4:
            # A small .zip that expands to many times the upload limit is a zip bomb, not a dataset.
            raise HTTPException(413, "el .zip descomprimido es demasiado grande")
        for n, m in enumerate(members):
            # Member names come from the user: only the extension is kept, never the path.
            path = job_dir / f"{n}{Path(m.filename).suffix.lower()}"
            with zf.open(m) as src, open(path, "wb") as dst:
                shutil.copyfileobj(src, dst, 1 << 20)
            videos.append(Video(Path(m.filename).name, path))
    assembled.unlink()
    return videos


# --- API ----------------------------------------------------------------------------------------


app = FastAPI(title="Tridi data server")
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])


class NewUpload(BaseModel):
    filename: str
    size: int


class Click(BaseModel):
    x: float
    y: float


@app.get("/health")
def health() -> dict:
    return {"ok": True, "queue": len(pending), "train_queue": len(train_pending)}


@app.post("/uploads", status_code=201)
def create_upload(body: NewUpload) -> dict:
    ext = Path(body.filename).suffix.lower()
    if ext not in UPLOAD_EXTS:
        raise HTTPException(415, f"tipo no soportado ({ext or 'sin extensión'}): sube {', '.join(sorted(UPLOAD_EXTS))}")
    if not 0 < body.size <= MAX_UPLOAD:
        raise HTTPException(413, f"el archivo debe pesar entre 1 byte y {MAX_UPLOAD // 2**20} MB")
    up = Upload(uuid.uuid4().hex, Path(body.filename).name, body.size, -(-body.size // CHUNK_SIZE))
    up.dir.mkdir(parents=True)
    uploads[up.id] = up
    return {"upload_id": up.id, "chunk_size": CHUNK_SIZE, "total_chunks": up.total_chunks}


@app.put("/uploads/{upload_id}/chunks/{index}")
async def put_chunk(upload_id: str, index: int, request: Request) -> dict:
    up: Upload = _get(uploads, upload_id, "la subida")
    if not 0 <= index < up.total_chunks:
        raise HTTPException(416, f"el pedazo {index} no existe (son {up.total_chunks})")
    expected = min(CHUNK_SIZE, up.size - index * CHUNK_SIZE)
    data = bytearray()
    async for part in request.stream():
        data += part
        if len(data) > expected:
            raise HTTPException(413, f"el pedazo {index} debe tener {expected} bytes")
    if len(data) != expected:
        raise HTTPException(400, f"el pedazo {index} llegó con {len(data)} bytes de {expected}")
    (up.dir / f"{index:06d}.part").write_bytes(data)
    up.received.add(index)
    up.touched = time.time()
    return {"received": sorted(up.received), "total_chunks": up.total_chunks}


@app.delete("/uploads/{upload_id}", status_code=204)
def cancel_upload(upload_id: str) -> Response:
    up: Upload = _get(uploads, upload_id, "la subida")
    shutil.rmtree(up.dir, ignore_errors=True)
    del uploads[up.id]
    return Response(status_code=204)


@app.get("/uploads/{upload_id}")
def get_upload(upload_id: str) -> dict:
    up: Upload = _get(uploads, upload_id, "la subida")
    return {"received": sorted(up.received), "total_chunks": up.total_chunks}


@app.post("/uploads/{upload_id}/complete", status_code=202)
def complete_upload(upload_id: str) -> dict:
    up: Upload = _get(uploads, upload_id, "la subida")
    missing = sorted(set(range(up.total_chunks)) - up.received)
    if missing:
        raise HTTPException(409, f"faltan {len(missing)} pedazos, el primero es el {missing[0]}")
    job = Job(uuid.uuid4().hex, [])
    job.dir.mkdir(parents=True)
    assembled = job.dir / f"upload{Path(up.filename).suffix.lower()}"
    with open(assembled, "wb") as dst:
        for i in range(up.total_chunks):
            with open(up.dir / f"{i:06d}.part", "rb") as src:
                shutil.copyfileobj(src, dst, 1 << 20)
    shutil.rmtree(up.dir)
    del uploads[up.id]
    try:
        job.videos = _unpack(up, job.dir, assembled)
    except HTTPException:
        shutil.rmtree(job.dir)
        raise
    jobs[job.id] = job
    _enqueue(job)
    return {"job_id": job.id}


@app.get("/jobs/{job_id}")
def get_job(job_id: str) -> dict:
    job: Job = _get(jobs, job_id, "el trabajo")
    with lock:
        position = pending.index(job_id) if job_id in pending else 0
    return {"job_id": job.id, "state": job.state, "position": position, "videos": [v.public() for v in job.videos]}


@app.delete("/jobs/{job_id}", status_code=204)
def cancel_job(job_id: str) -> Response:
    job: Job = _get(jobs, job_id, "el trabajo")
    job.cancelled = True
    with lock:
        if job_id in pending:
            pending.remove(job_id)
        del jobs[job_id]
    for v in job.videos:
        if v.stage not in ("tracking", "pose3d"):  # the one running is deleted by the worker when it stops
            v.delete()
    return Response(status_code=204)


def _video(job_id: str, n: int) -> tuple[Job, Video]:
    job: Job = _get(jobs, job_id, "el trabajo")
    if not 0 <= n < len(job.videos):
        raise HTTPException(404, f"el video {n} no existe")
    return job, job.videos[n]


@app.get("/jobs/{job_id}/videos/{n}/first-frame.jpg")
def first_frame(job_id: str, n: int) -> FileResponse:
    _, video = _video(job_id, n)
    if video.deleted:
        raise HTTPException(410, "el video ya se borró: solo se guardan los clips")
    path = video.path.with_suffix(".first.jpg")
    if not path.exists():
        raise HTTPException(409, "el primer cuadro está listo cuando termina la etapa tracking")
    return FileResponse(path, media_type="image/jpeg")


@app.post("/jobs/{job_id}/videos/{n}/subject", status_code=202)
def choose_subject(job_id: str, n: int, body: Click) -> dict:
    job, video = _video(job_id, n)
    if video.deleted:
        raise HTTPException(410, "el video ya se borró (se guarda 10 minutos): súbelo de nuevo para elegir a otra persona")
    if video.tracking is None or video.stage in ("tracking", "pose3d", "waiting"):
        raise HTTPException(409, "se puede elegir otra persona cuando el video termina de procesarse")
    first = video.tracking.people_at_first_frame()
    if not any(t.boxes[0][0] <= body.x <= t.boxes[0][2] and t.boxes[0][1] <= body.y <= t.boxes[0][3] for t in first):
        raise HTTPException(422, "no hay ninguna persona en ese punto del cuadro")
    video.click = (body.x, body.y)
    video.stage, video.progress = "waiting", 0.0
    _enqueue(job, n)
    return {"job_id": job.id}


@app.get("/clips/{clip_id}.json")
def get_clip(clip_id: str) -> Response:
    return Response(_clip_path(clip_id).read_bytes(), media_type="application/json")


# --- Camera clips -------------------------------------------------------------------------------


def _number(x) -> bool:
    return isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x)


def _check_clip(clip) -> str | None:
    """What is wrong with a PoseClip's shape (docs/contrato.md), or None."""
    if not isinstance(clip, dict):
        return "el cuerpo debe ser un PoseClip (un objeto JSON)"
    if clip.get("skeleton") != "mediapipe33":
        return 'skeleton debe ser "mediapipe33"'
    if not _number(clip.get("fps")) or clip["fps"] <= 0:
        return "fps debe ser un número mayor que 0"
    frames = clip.get("frames")
    if not isinstance(frames, list) or len(frames) < 2:
        return "frames debe tener al menos 2 cuadros"
    for i, f in enumerate(frames):
        joints = f.get("joints") if isinstance(f, dict) else None
        if not isinstance(f, dict) or not _number(f.get("t")) or not isinstance(joints, list) or len(joints) != JOINTS:
            return f"el cuadro {i} debe tener t y {JOINTS} joints"
        if not all(isinstance(j, list) and len(j) == 4 and all(_number(v) for v in j) for j in joints):
            return f"cada joint del cuadro {i} debe ser [x, y, z, visibility]"
    if not isinstance(clip.get("quality"), dict) or not _number(clip["quality"].get("valid_ratio")):
        return "falta quality.valid_ratio"
    return None


def _clip_path(clip_id: str) -> Path:
    if not CLIP_ID.match(clip_id):
        raise HTTPException(404, "el clip no existe")
    path = DATA_DIR / "clips" / f"{clip_id}.json"
    if not path.exists():
        raise HTTPException(404, "el clip no existe")
    return path


@app.post("/clips", status_code=201)
async def post_clip(request: Request) -> dict:
    body = bytearray()
    async for part in request.stream():
        body += part
        if len(body) > MAX_CLIP_BYTES:
            raise HTTPException(413, f"el clip pesa más de {MAX_CLIP_BYTES // 2**20} MB")
    try:
        clip = json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(400, "el cuerpo no es JSON")
    problem = _check_clip(clip)
    if problem:
        raise HTTPException(400, problem)
    duration = clip["frames"][-1]["t"] - clip["frames"][0]["t"]
    if duration > MAX_DURATION_S:
        raise HTTPException(422, f"el clip dura {duration:.0f} s y el máximo es {MAX_DURATION_S:.0f} s")
    ratio = clip["quality"]["valid_ratio"]
    if ratio < MIN_VALID_RATIO:
        raise HTTPException(422, f"el cuerpo se vio en el {ratio:.0%} de los cuadros y hace falta el {MIN_VALID_RATIO:.0%}: "
                                 "graba con el cuerpo entero en cuadro")
    # Ids name files: the browser's id is replaced by the server's own.
    with lock:
        (DATA_DIR / "clips").mkdir(parents=True, exist_ok=True)
        clip_id = _clip_id("camara", DATA_DIR / "clips")
        clip.update({"id": clip_id, "source": "camera", "source_file": None})
        (DATA_DIR / "clips" / f"{clip_id}.json").write_text(json.dumps(clip, separators=(",", ":")))
    return {"clip_id": clip_id}


# --- Training queue -----------------------------------------------------------------------------


@dataclass
class Train:
    id: str
    clip_id: str
    duration_s: float
    total_steps: int = TRAIN_STEPS
    state: str = "queued"  # queued | running | done | failed
    stage: str | None = None  # retarget | training | data
    steps: int = 0
    steps_per_s: float = TRAIN_STEPS_PER_S
    followed_s: float | None = None
    checkpoints: list[dict] = field(default_factory=list)
    error: str | None = None
    cancelled: bool = False
    proc: subprocess.Popen | None = None
    started_at: str = ""  # UTC ISO, like policy.json created_at: older exports are not this training's

    @property
    def dir(self) -> Path:
        return DATA_DIR / "train" / self.id

    def remaining_s(self) -> float:
        """Seconds until this training is done, if it started now or is running."""
        if self.state == "done":
            return 0.0
        left = (self.total_steps - self.steps) / max(self.steps_per_s, 1.0)
        return left + (DATA_STAGE_S if self.stage != "data" else DATA_STAGE_S / 2)

    def public(self, position: int, eta_s: float) -> dict:
        return {
            "train_id": self.id,
            "clip_id": self.clip_id,
            "state": self.state,
            "position": position,
            "stage": self.stage,
            "steps": self.steps,
            "total_steps": self.total_steps,
            "followed_s": self.followed_s,
            "duration_s": self.duration_s,
            "checkpoints": self.checkpoints,
            "eta_s": round(eta_s),
            "error": self.error,
        }


trains: dict[str, Train] = {}
train_by_clip: dict[str, str] = {}  # a clip queued, running or done is not trained twice
train_work: queue.Queue[str] = queue.Queue()
train_pending: list[str] = []
running_train: list[str] = []  # 0 or 1 id


class StageFailed(RuntimeError):
    pass


def _run_stage(t: Train, stage: str, cmd: list[str], watch=None) -> None:
    """Runs one step of the chain as a subprocess in its own process group (training spawns worker
    processes, and cancelling must stop them all), logging to train/<id>/<stage>.log."""
    t.stage = stage
    log_path = t.dir / f"{stage}.log"
    with open(log_path, "w") as log:
        t.proc = subprocess.Popen(cmd, cwd=ROOT, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        while t.proc.poll() is None:
            time.sleep(TRAIN_POLL_S)
            if watch:
                watch()
    code, t.proc = t.proc.returncode, None
    if watch:
        watch()
    if t.cancelled:
        raise StageFailed("cancelado")
    if code != 0:
        tail = log_path.read_text(errors="replace").strip().splitlines()[-1:] or ["sin salida"]
        raise StageFailed(f"falló la etapa {stage} (código {code}): {tail[0][:300]}")


def _read_progress(t: Train) -> None:
    """Steps from training/runs/<id>/progress.csv and checkpoints from the exported policy .json files."""
    csv_path = ROOT / "training" / "runs" / t.id / "progress.csv"
    if csv_path.exists():
        rows = list(csv.DictReader(csv_path.read_text().splitlines()))
        if rows:
            t.steps = min(int(rows[-1]["step"]), t.total_steps)
            seconds = float(rows[-1]["seconds"])
            if seconds > 0:
                t.steps_per_s = int(rows[-1]["step"]) / seconds
    found = []
    for path in (DATA_DIR / "policies").glob(f"{t.clip_id}-step-*.json"):
        try:
            meta = json.loads(path.read_text())
        except json.JSONDecodeError:  # being written right now
            continue
        if not path.with_suffix(".onnx").exists() or meta.get("created_at", "") < t.started_at:
            continue  # a leftover of an earlier training of the same clip
        found.append(meta)
    found.sort(key=lambda m: m["steps"])
    t.checkpoints = [{"steps": m["steps"], "policy_id": m["id"]} for m in found]
    if found:
        t.followed_s = found[-1].get("followed_s")
        t.duration_s = found[-1].get("duration_s", t.duration_s)


def _train(t: Train) -> None:
    for sub in ("motions", "policies", "datasets"):
        (DATA_DIR / sub).mkdir(parents=True, exist_ok=True)
    t.dir.mkdir(parents=True, exist_ok=True)
    clip = DATA_DIR / "clips" / f"{t.clip_id}.json"
    motion = DATA_DIR / "motions" / f"{t.clip_id}.json"
    policies = DATA_DIR / "policies"
    _run_stage(t, "retarget", ["node", "physics/scripts/retarget-clip.mjs", str(clip), "--out", str(motion.parent)])
    _run_stage(t, "training", [
        "uv", "run", "--project", "training", "python", "-m", "training.ppo", "--task", "mimic",
        "--motion", str(motion), "--run", t.id, "--steps", str(t.total_steps), "--every", str(TRAIN_EVERY),
        "--export-dir", str(policies), "--policy-prefix", t.clip_id,
    ], lambda: _read_progress(t))
    if not t.checkpoints:
        raise StageFailed("el entrenamiento terminó sin exportar ninguna política")
    t.steps = t.total_steps
    final = policies / f"{t.checkpoints[-1]['policy_id']}.json"
    _run_stage(t, "data", [
        "uv", "run", "--project", "training", "python", "-m", "training.rollout", str(final),
        "--motion", str(motion), "--episodes", str(ROLLOUT_EPISODES),
        "--out", str(DATA_DIR / "datasets" / f"{t.clip_id}.zip"),
    ])


def _train_worker() -> None:
    while True:
        train_id = train_work.get()
        with lock:
            if train_id in train_pending:
                train_pending.remove(train_id)
            t = trains.get(train_id)
            if t is None or t.cancelled:
                continue
            t.state = "running"
            running_train.append(t.id)
        t.started_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
        try:
            _train(t)
            t.state = "done"
        except Exception as e:  # one broken clip must not stop the queue
            t.state = "failed"
            t.error = str(e) if isinstance(e, RuntimeError) else f"error inesperado: {e}"
            with lock:
                if train_by_clip.get(t.clip_id) == t.id:
                    del train_by_clip[t.clip_id]  # a failed clip can be trained again
        finally:
            with lock:
                running_train.clear()


def _position_eta(t: Train) -> tuple[int, float]:
    with lock:
        ahead = train_pending.index(t.id) if t.id in train_pending else 0
        before = [trains[i] for i in running_train if i != t.id] + [trains[i] for i in train_pending[:ahead]]
    if t.state in ("done", "failed"):
        return 0, 0.0
    return ahead, sum(o.remaining_s() for o in before) + t.remaining_s()


@app.post("/clips/{clip_id}/train", status_code=202)
def train_clip(clip_id: str) -> dict:
    path = _clip_path(clip_id)
    with lock:
        existing = train_by_clip.get(clip_id)
        if existing:
            return {"train_id": existing}
        if len(train_pending) >= TRAIN_WAITING:
            raise HTTPException(409, f"la cola de entrenamiento está llena ({TRAIN_WAITING} en espera): prueba en un rato")
    clip = json.loads(path.read_text())
    ratio = clip.get("quality", {}).get("valid_ratio", 0)
    if ratio < MIN_VALID_RATIO:
        raise HTTPException(422, f"el cuerpo se vio en el {ratio:.0%} de los cuadros y hace falta el {MIN_VALID_RATIO:.0%} para entrenar")
    frames = clip["frames"]
    t = Train(uuid.uuid4().hex, clip_id, round(frames[-1]["t"] - frames[0]["t"], 2))
    with lock:
        trains[t.id] = t
        train_by_clip[clip_id] = t.id
        train_pending.append(t.id)
    train_work.put(t.id)
    return {"train_id": t.id}


@app.get("/train/{train_id}")
def get_train(train_id: str) -> dict:
    t: Train = _get(trains, train_id, "el entrenamiento")
    return t.public(*_position_eta(t))


@app.delete("/train/{train_id}", status_code=204)
def cancel_train(train_id: str) -> Response:
    t: Train = _get(trains, train_id, "el entrenamiento")
    t.cancelled = True
    with lock:
        if train_id in train_pending:
            train_pending.remove(train_id)
        if train_by_clip.get(t.clip_id) == t.id:
            del train_by_clip[t.clip_id]
        del trains[train_id]
    proc = t.proc
    if proc and proc.poll() is None:
        os.killpg(proc.pid, signal.SIGTERM)  # the worker sees `cancelled` and moves on
    return Response(status_code=204)


# --- What training made -------------------------------------------------------------------------


def _served(folder: str, name: str, pattern: re.Pattern, what: str) -> Path:
    stem = name.rsplit(".", 1)[0]
    path = DATA_DIR / folder / name
    if not pattern.match(stem) or not path.exists():
        raise HTTPException(404, f"{what} no existe")
    return path


@app.get("/motions/{clip_id}.json")
def get_motion(clip_id: str) -> FileResponse:
    return FileResponse(_served("motions", f"{clip_id}.json", CLIP_ID, "el movimiento"), media_type="application/json")


@app.get("/policies/{policy_id}.onnx")
def get_policy_onnx(policy_id: str) -> FileResponse:
    return FileResponse(_served("policies", f"{policy_id}.onnx", POLICY_ID, "la política"), media_type="application/octet-stream")


@app.get("/policies/{policy_id}.json")
def get_policy_json(policy_id: str) -> FileResponse:
    return FileResponse(_served("policies", f"{policy_id}.json", POLICY_ID, "la política"), media_type="application/json")


@app.get("/datasets/{clip_id}.zip")
def get_dataset(clip_id: str) -> FileResponse:
    path = _served("datasets", f"{clip_id}.zip", CLIP_ID, "el dataset")
    return FileResponse(path, media_type="application/zip", filename=f"{clip_id}.zip")


threading.Thread(target=_worker, daemon=True, name="tridi-worker").start()
threading.Thread(target=_train_worker, daemon=True, name="tridi-train-worker").start()
threading.Thread(target=_janitor, daemon=True, name="tridi-janitor").start()


def main() -> None:
    import uvicorn

    p = argparse.ArgumentParser(prog="python -m data.server", description=__doc__.split("\n")[0])
    # Render and similar hosts pass the port in $PORT.
    p.add_argument("--port", type=int, default=int(os.environ.get("PORT", 8000)))
    p.add_argument("--host", default=os.environ.get("HOST", "127.0.0.1"))
    args = p.parse_args()
    for sub in ("uploads", "jobs", "clips", "motions", "policies", "datasets", "train"):
        (DATA_DIR / sub).mkdir(parents=True, exist_ok=True)
    print(json.dumps({"data_dir": str(DATA_DIR), "cors": CORS_ORIGINS}))
    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
