// Live guard against MediaPipe's mirrored reads. Seen from behind (or turning), MediaPipe sometimes
// reads the person as facing the other way for a few frames: it takes the camera's view of their
// back for their front, which mirrors the body through the image plane (depth flipped) and swaps
// left and right. The robot then spun 180 degrees and back, and the arms swapped sides.
//
// data/lift.py and poseclip.js drop those frames from a clip, comparing each with the frames
// around it. Live there are no future frames and a dropped frame freezes the robot, so each frame
// is compared with the heading of the last second, and a frame facing against it is put right:
// left and right swapped back, and the depth flipped back when that is what makes it agree (the
// mirror described above; otherwise, a profile misread, the swap alone). A real turn passes
// through profile over more than a second, so the average heading follows it and nothing is undone.

// The same second as FLIP_WINDOW_S in poseclip.js and data/lift.py, here only looking back.
const WINDOW_S = 1.0;
// Below this many frames of history (a third of a second at 30 fps) there is no heading to trust.
const MIN_HISTORY = 10;

// MediaPipe's left/right pairs: face, arms, hands, legs and feet.
const PAIRS = [[1, 4], [2, 5], [3, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 16], [17, 18], [19, 20], [21, 22], [23, 24], [25, 26], [27, 28], [29, 30], [31, 32]];

/** The body's heading on the ground (x, z), from MediaPipe world landmarks; null if degenerate. */
export function heading(world) {
  const p = (i, a) => world[i][a];
  const across = ['x', 'y', 'z'].map((a) => p(11, a) - p(12, a) + p(23, a) - p(24, a));
  const up = ['x', 'y', 'z'].map((a) => (p(11, a) + p(12, a) - p(23, a) - p(24, a)) / 2);
  // cross(up, across), its x and z: only the heading on the ground matters, as in data/lift.py.
  const x = up[1] * across[2] - up[2] * across[1];
  const z = up[0] * across[1] - up[1] * across[0];
  const norm = Math.hypot(x, z);
  return norm > 1e-6 ? [x / norm, z / norm] : null;
}

function swapSides(points) {
  const out = points.slice();
  for (const [a, b] of PAIRS) [out[a], out[b]] = [points[b], points[a]];
  return out;
}

const flipDepth = (points) => points.map((p) => ({ ...p, z: -p.z }));

/**
 * @returns {{ fix(world, landmarks, t): { world, landmarks, fixed }, reset(): void }} fix() returns
 *   the frame as is, or put right (`fixed`: 'mirror' or 'swap'); reset() when the body is lost.
 */
export function createFacingGuard() {
  let history = []; // { t, h: [x, z] } of the frames as passed on

  function fix(world, landmarks, t) {
    history = history.filter((item) => t - item.t <= WINDOW_S);
    const h = heading(world);
    if (!h) return { world, landmarks, fixed: null };
    let out = { world, landmarks, fixed: null, h };
    if (history.length >= MIN_HISTORY) {
      const ref = history.reduce((sum, item) => [sum[0] + item.h[0], sum[1] + item.h[1]], [0, 0]);
      const agrees = ([x, z]) => x * ref[0] + z * ref[1] >= 0;
      if (!agrees(h)) {
        // The mirror through the image plane first: it is how a back is read as a front.
        const mirrored = flipDepth(swapSides(world));
        const hm = heading(mirrored);
        out = hm && agrees(hm)
          ? { world: mirrored, landmarks: flipDepth(swapSides(landmarks)), fixed: 'mirror', h: hm }
          : { world: swapSides(world), landmarks: swapSides(landmarks), fixed: 'swap', h: [-h[0], -h[1]] };
      }
    }
    history.push({ t, h: out.h });
    return { world: out.world, landmarks: out.landmarks, fixed: out.fixed };
  }

  return { fix, reset: () => (history = []) };
}
