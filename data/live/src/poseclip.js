// Recorded camera samples -> PoseClip (docs/contrato.md). Pure math, no browser APIs, so
// `npm run check` tests it in Node. Same steps and thresholds as data/lift.py, so a clip from
// the camera and one from an uploaded video mean the same thing.

// MediaPipe body joints shared with the video pipeline's checks: shoulders, elbows, wrists,
// hips, knees, ankles. The face is left out: it is small and noisy.
export const BODY = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];

// MediaPipe foot points per side: ankle, heel, toe.
const FEET = [
  [27, 29, 31],
  [28, 30, 32],
];

// Frames where MediaPipe's mean visibility of the body joints is under 0.5 are mostly occluded or
// out of frame; their 3D is a guess.
export const MIN_VISIBILITY = 0.5;

// Laptop webcams film about 60-70 degrees across the long side; it only sets the scale of the
// camera-based trajectory (data/lift.py assumes 65 degrees for phones, the same).
const HFOV_DEG = 65;

// A real turn around takes well over a second, a misread lasts a few frames.
const FLIP_WINDOW_S = 1.0;

// The hips' trajectory gets the same Savitzky-Golay filter as data/lift.py (0.6 s, quadratic), where
// the reasoning is. The clip is built when the recording stops, so the whole trajectory is there.
// The points themselves were already smoothed live by the One Euro filter (src/oneeuro.js).
const ROOT_WINDOW_S = 0.6;
const ROOT_ORDER = 2;

// A camera fit far from its neighbors' median is a fit error (the body cut by the image edge), not
// motion: same window and threshold as data/lift.py, where the reasoning is.
const CAM_WINDOW_S = 0.5;
const CAM_OUTLIER_M = 1.5;

// The contract fixes one fps per clip; webcams deliver uneven frame times, so the clip is resampled.
export const CLIP_FPS = 30;

/**
 * @param samples  [{ t: seconds, world: [33][3] MediaPipe world landmarks (m, y down, hip-centered),
 *                    image: [33][3] (x px, y px, visibility) }] in time order; samples where the
 *                    body was not visible enough are left out by the caller or passed with valid: false
 * @param options  { width, height } of the camera image in px, { id } for the clip
 * @returns PoseClip, or throws if fewer than 2 usable frames
 */
export function buildPoseClip(samples, { width, height, id = defaultId() }) {
  const f = Math.max(width, height) / (2 * Math.tan(((HFOV_DEG * Math.PI) / 180) / 2));
  const c = [width / 2, height / 2];

  let items = samples.map((s) => {
    const ok = s.valid !== false;
    const cam = ok ? fitTranslation(s.world, s.image, f, c) : null;
    return { ...s, cam, valid: ok && cam !== null };
  });
  const flips = facingFlips(items);
  items.forEach((s, k) => (s.valid = s.valid && !flips[k]));
  fixCameraOutliers(items);

  const validIdx = items.flatMap((s, k) => (s.valid ? [k] : []));
  if (validIdx.length < 2) throw new Error(`se vio el cuerpo en ${validIdx.length} cuadros y hacen falta al menos 2: que se vea el cuerpo entero`);
  items = items.slice(validIdx[0], validIdx.at(-1) + 1);

  // Resample to CLIP_FPS. Each output frame interpolates between the valid samples around it;
  // it counts as valid when the nearest sample was valid.
  const valid = items.filter((s) => s.valid);
  const t0 = valid[0].t;
  const n = Math.floor((valid.at(-1).t - t0) * CLIP_FPS) + 1;
  const frames = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const t = t0 + k / CLIP_FPS;
    while (j < valid.length - 2 && valid[j + 1].t <= t) j++;
    const a = valid[j];
    const b = valid[Math.min(j + 1, valid.length - 1)];
    const w = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 0;
    const nearest = items.reduce((best, s) => (Math.abs(s.t - t) < Math.abs(best.t - t) ? s : best));
    frames.push({
      world: lerp2(a.world, b.world, w),
      cam: lerp(a.cam, b.cam, w),
      vis: a.image.map((p, i) => (nearest.valid ? p[2] + (b.image[i][2] - p[2]) * w : 0)),
      valid: nearest.valid,
    });
  }

  // Camera space (x right, y down, z away) -> contract space (x right, y up, z toward the camera):
  // a 180 degree turn about x, which keeps the axes right-handed.
  const flip = (p) => [p[0], -p[1], -p[2]];
  const rel = frames.map((fr) => fr.world.map(flip));
  const feet = rootFromFeet(rel);
  const cam0 = frames[0].cam;
  const camera = frames.map((fr) => flip(fr.cam.map((v, i) => v - cam0[i])));
  // Each estimate fails by seeing too little motion: the camera one when the camera pans to follow
  // the person, the feet one along the depth axis. On each ground axis keep the one that travelled
  // further; height always comes from the feet.
  const root = feet.map((p) => [...p]);
  for (const axis of [0, 2]) {
    if (range(camera, axis) > range(feet, axis)) root.forEach((p, k) => (p[axis] = camera[k][axis]));
  }
  const smooth = savgol(root, Math.round(ROOT_WINDOW_S * CLIP_FPS) | 1, ROOT_ORDER);

  const pos = rel.map((joints, k) => joints.map((p) => p.map((v, i) => v + smooth[k][i])));
  // The contract's origin is the hips' center of the first frame.
  const hips0 = pos[0][23].map((v, i) => (v + pos[0][24][i]) / 2);
  const round = (v) => Math.round(v * 1e4) / 1e4;
  return {
    id,
    source: 'camera',
    source_file: null,
    fps: CLIP_FPS,
    skeleton: 'mediapipe33',
    units: 'm',
    origin: 'hips',
    // One person, no tracker: MediaPipe follows the most prominent body, and the id is always 0.
    subject: { track_id: 0, selected_by: 'auto' },
    frames: pos.map((joints, k) => ({
      t: round(k / CLIP_FPS),
      joints: joints.map((p, i) => [...p.map((v, a) => round(v - hips0[a])), round(frames[k].vis[i])]),
    })),
    quality: { valid_ratio: Math.round((frames.filter((fr) => fr.valid).length / n) * 1000) / 1000 },
  };
}

function defaultId() {
  const now = new Date();
  const pad = (v) => String(v).padStart(2, '0');
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `clip_${day}_camara-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}_01`;
}

/**
 * Camera-space translation t so that the hip-centered 3D pose, moved by t, projects onto the image.
 * With a pinhole camera, u = f (X + tx) / (Z + tz) + cx is linear in t after multiplying out, so t
 * is a weighted least squares over the visible body joints (3x3 normal equations).
 */
export function fitTranslation(world, image, f, c) {
  const ata = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const atb = [0, 0, 0];
  for (const i of BODY) {
    const w = image[i][2];
    const du = image[i][0] - c[0];
    const dv = image[i][1] - c[1];
    const rows = [
      [[f, 0, -du], du * world[i][2] - f * world[i][0]],
      [[0, f, -dv], dv * world[i][2] - f * world[i][1]],
    ];
    for (const [a, b] of rows) {
      for (let r = 0; r < 3; r++) {
        atb[r] += w * a[r] * b;
        for (let s = 0; s < 3; s++) ata[r][s] += w * a[r] * a[s];
      }
    }
  }
  const t = solve3(ata, atb);
  return t && t[2] > 0 ? t : null; // the person must be in front of the camera
}

function solve3(m, b) {
  const det = (a) =>
    a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) -
    a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) +
    a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
  const d = det(m);
  if (Math.abs(d) < 1e-9) return null;
  return [0, 1, 2].map((col) => det(m.map((row, r) => row.map((v, s) => (s === col ? b[r] : v)))) / d);
}

/**
 * Replaces the camera fit of outlier samples with one interpolated in time from the good ones. The
 * pose of those samples is fine, so they stay valid.
 */
function fixCameraOutliers(items) {
  const ok = items.filter((s) => s.valid);
  const bad = ok.filter((s) => {
    const near = ok.filter((o) => Math.abs(o.t - s.t) <= CAM_WINDOW_S / 2);
    const mid = [0, 1, 2].map((a) => median(near.map((o) => o.cam[a])));
    return Math.hypot(...s.cam.map((v, a) => v - mid[a])) > CAM_OUTLIER_M;
  });
  const good = ok.filter((s) => !bad.includes(s));
  if (!good.length) return;
  for (const s of bad) {
    const before = good.findLast((g) => g.t < s.t);
    const after = good.find((g) => g.t > s.t);
    s.cam = !before ? [...after.cam] : !after ? [...before.cam] : lerp(before.cam, after.cam, (s.t - before.t) / (after.t - before.t));
  }
}

/**
 * Samples whose body faces the opposite way of the samples around them. MediaPipe sometimes reads a
 * person seen from behind as facing the camera for a few frames; nobody turns around that fast.
 */
function facingFlips(items) {
  const facing = items.map((s) => {
    if (!s.valid) return null;
    const p = s.world;
    const across = [0, 1, 2].map((a) => p[11][a] - p[12][a] + p[23][a] - p[24][a]);
    const up = [0, 1, 2].map((a) => (p[11][a] + p[12][a] - p[23][a] - p[24][a]) / 2);
    const v = cross(up, across);
    v[1] = 0; // only the heading on the ground matters
    const norm = Math.hypot(...v) + 1e-9;
    return v.map((x) => x / norm);
  });
  return items.map((s, k) => {
    if (!facing[k]) return false;
    const near = facing.filter((v, j) => v && Math.abs(items[j].t - s.t) <= FLIP_WINDOW_S / 2);
    const ref = [0, 1, 2].map((a) => median(near.map((v) => v[a])));
    return facing[k][0] * ref[0] + facing[k][2] * ref[2] < 0;
  });
}

/**
 * Hips trajectory from foot contacts, starting at (0, 0, 0). MediaPipe world landmarks are centered
 * on the hips every frame, so they hold the pose but not where the body goes. The lower foot is
 * planted: whatever it moves relative to the hips is the body moving the other way.
 */
function rootFromFeet(rel) {
  const contact = rel.map((joints) =>
    FEET.map((idx) => idx.map((i) => joints[i]).reduce((low, p) => (p[1] < low[1] ? p : low))),
  );
  const stance = contact.map((c) => (c[0][1] <= c[1][1] ? 0 : 1)); // the lower foot carries the weight
  const root = [[0, 0, 0]];
  for (let k = 1; k < rel.length; k++) {
    const s = stance[k]; // the same foot in both frames, so a change of stance foot does not jump
    const prev = root[k - 1];
    root.push([
      prev[0] - (contact[k][s][0] - contact[k - 1][s][0]),
      contact[0][stance[0]][1] - contact[k][s][1],
      prev[2] - (contact[k][s][2] - contact[k - 1][s][2]),
    ]);
  }
  return root;
}

/**
 * Savitzky-Golay filter over rows of numbers, the same as data/smooth.py: each row is the value at its
 * frame of the polynomial fitted to the window around it; at the edges, of the first or last window.
 */
export function savgol(rows, window, order) {
  const n = rows.length;
  window = Math.min(window, n % 2 ? n : n - 1);
  if (window <= order) return rows.map((r) => [...r]);
  const half = window >> 1;
  // Least squares fit of a polynomial in t = -half..half: coefficients = (VᵀV)⁻¹ Vᵀ · window.
  const V = Array.from({ length: window }, (_, i) => Array.from({ length: order + 1 }, (_, q) => (i - half) ** q));
  const VtV = V[0].map((_, r) => V[0].map((_, c) => V.reduce((sum, row) => sum + row[r] * row[c], 0)));
  const inv = invert(VtV);
  const fit = inv.map((row) => V.map((v) => row.reduce((sum, x, c) => sum + x * v[c], 0))); // [order+1][window]
  const coeffs = (start) => fit.map((w) => rows[0].map((_, ax) => w.reduce((sum, x, i) => sum + x * rows[start + i][ax], 0)));
  const at = (cs, t) => cs[0].map((_, ax) => cs.reduce((sum, c, q) => sum + c[ax] * t ** q, 0));
  const first = coeffs(0);
  const last = coeffs(n - window);
  return rows.map((_, k) => {
    if (k < half) return at(first, k - half);
    if (k >= n - half) return at(last, k - (n - window) - half);
    return at(coeffs(k - half), 0);
  });
}

/** Gauss-Jordan inverse of a small square matrix (the fit's normal equations). */
function invert(m) {
  const n = m.length;
  const a = m.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[piv][c])) piv = r;
    [a[c], a[piv]] = [a[piv], a[c]];
    const d = a[c][c];
    a[c] = a[c].map((v) => v / d);
    for (let r = 0; r < n; r++) if (r !== c) { const f = a[r][c]; a[r] = a[r].map((v, j) => v - f * a[c][j]); }
  }
  return a.map((row) => row.slice(n));
}

const lerp = (a, b, w) => a.map((v, i) => v + (b[i] - v) * w);
const lerp2 = (a, b, w) => a.map((p, i) => lerp(p, b[i], w));
const range = (rows, a) => Math.max(...rows.map((r) => r[a])) - Math.min(...rows.map((r) => r[a]));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function median(values) {
  const s = [...values].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
