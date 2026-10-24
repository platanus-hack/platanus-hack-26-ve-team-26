// Live guard against arms squashed in depth. An elbow raised toward the camera barely moves in the
// image: it moves in depth, MediaPipe's weakest axis, and the model tends to keep it near the body's
// plane. The upper arm then comes out short and pointing down, and the robot read "elbow up in
// front" as "hand down" (docs/investigacion/2026-10-24-brazos-humanos-en-vivo.md).
//
// A bone does not change length. Each arm segment's length is learned from the frames where it
// looks longest (the arm across the image), and a segment that comes out shorter than that gets the
// missing length back in depth: |dz| = sqrt(L^2 - dx^2 - dy^2), from the image's axes, the steady
// ones. The depth only grows, never shrinks, and keeps MediaPipe's sign (toward or away from the
// camera) unless MediaPipe barely moved it, where the elbow is taken to be in front: an arm reaches
// much farther forward than back. Everything past the segment (the wrist, the hand) moves with it.

// The learned length: this percentile of the last ten seconds, so a few long misreads do not
// inflate it; and nothing is corrected before a second of frames (30 at 30 fps).
const HISTORY_S = 10;
const LENGTH_PERCENTILE = 0.9;
const MIN_SAMPLES = 30;
// A segment at 95% of its length or more is left alone (MediaPipe's own length noise is a few
// percent); at 80% or less it gets all the missing depth; in between, part of it, so the arm does
// not jump when it crosses a threshold.
const START_RATIO = 0.95;
const FULL_RATIO = 0.8;
// Under 3 cm of depth between the two ends, MediaPipe's sign is noise: the elbow goes in front.
const SIGN_MIN_M = 0.03;
// Both ends must be seen this well (MediaPipe's visibility) for the segment to teach or be fixed.
const MIN_VISIBILITY = 0.5;

// Each arm's segments, and the points that move with the far end: the upper arm moves the elbow,
// the wrist and the hand; the forearm, the wrist and the hand.
const SEGMENTS = [
  { from: 11, to: 13, moves: [13, 15, 17, 19, 21] },
  { from: 13, to: 15, moves: [15, 17, 19, 21] },
  { from: 12, to: 14, moves: [14, 16, 18, 20, 22] },
  { from: 14, to: 16, moves: [16, 18, 20, 22] },
];

const smoothstep = (x) => x * x * (3 - 2 * x);

/**
 * @returns {{ fix(world, t): { world, fixed }, reset(): void, lengths(): number[] }} fix() returns
 *   the world landmarks with the arms' depth put back (`fixed`: how many segments it touched);
 *   reset() when the body is lost (a new person may have other arms).
 */
export function createBoneGuard() {
  let history = SEGMENTS.map(() => []); // { t, length } per segment

  function learned(k) {
    const samples = history[k];
    if (samples.length < MIN_SAMPLES) return null;
    const sorted = samples.map((s) => s.length).sort((a, b) => a - b);
    return sorted[Math.floor(LENGTH_PERCENTILE * (sorted.length - 1))];
  }

  function fix(world, t) {
    const out = world.map((p) => ({ ...p }));
    let fixed = 0;
    SEGMENTS.forEach((seg, k) => {
      const a = out[seg.from];
      const b = out[seg.to];
      if ((world[seg.from].visibility ?? 1) < MIN_VISIBILITY || (world[seg.to].visibility ?? 1) < MIN_VISIBILITY) return;
      // Learned from what MediaPipe gave, before any fix: a fixed length would feed itself.
      const raw = Math.hypot(world[seg.to].x - world[seg.from].x, world[seg.to].y - world[seg.from].y, world[seg.to].z - world[seg.from].z);
      const samples = history[k];
      samples.push({ t, length: raw });
      while (samples.length && samples[0].t < t - HISTORY_S) samples.shift();

      const length = learned(k);
      if (!length) return;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = b.z - a.z;
      const now = Math.hypot(dx, dy, dz);
      const ratio = now / length;
      if (ratio >= START_RATIO) return;
      const planar = dx * dx + dy * dy;
      if (planar >= length * length) return;
      const need = Math.sqrt(length * length - planar);
      if (need <= Math.abs(dz)) return;
      const weight = smoothstep(Math.min(1, (START_RATIO - ratio) / (START_RATIO - FULL_RATIO)));
      // MediaPipe's z grows away from the camera: in front is negative.
      const sign = Math.abs(dz) >= SIGN_MIN_M ? Math.sign(dz) : -1;
      const shift = (sign * need - dz) * weight;
      for (const i of seg.moves) out[i].z += shift;
      fixed++;
    });
    return { world: out, fixed };
  }

  return {
    fix,
    reset: () => (history = SEGMENTS.map(() => [])),
    /** The learned length of each segment (m), or null: left upper arm, left forearm, right, right. */
    lengths: () => SEGMENTS.map((_, k) => learned(k)),
  };
}
