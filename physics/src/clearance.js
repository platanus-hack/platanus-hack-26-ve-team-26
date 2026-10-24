// Keeps the robot from going through itself. The retargeting copies each limb's direction, and
// some things a person does are too tight for the G1:
//   hands   a person's arms hang wider than the G1's hips are narrow, and a swinging arm passes
//           beside the thigh: on data/clips' walk the hand came within 0.2 cm of the thigh's axis,
//           through it, in 237 of 356 frames.
//   head    hands over or behind the head: the G1's arms are shorter and its head sits higher on
//           the shoulders, so a person's hands resting on their head went into the robot's.
//   clap    the robot's hands meet where the person's do, but its forearms are thicker: the hands
//           passed through each other instead of touching.
//   feet    seen from the side, the legs' left-right is MediaPipe's depth: the walk's ankles came
//           within 6.5 cm of each other, the feet touching and the legs looking crossed.
// Where that would happen, the hips (their roll joints, the ankles turning back so the soles stay
// flat) and then the shoulders open sideways just enough: the hands stop on the head or on each
// other, touching, instead of going through. The rest of the movement is untouched.
//
// Only for what is shown (playClip, mimic), like level.js: the training references stay as they are.
import { idOf } from './sim.js';

// Thigh radius (~6 cm in the G1's meshes) plus the hand's (~4 cm) plus 1 cm of air.
export const CLEAR_M = 0.11;
// The hand also stays this far from the axis from the pelvis to the torso: the G1's pelvis is
// ~10 cm in radius, plus the hand's 4 cm and 1 cm of air. A hand swinging forward in a walk passes
// ~20 cm in front of it; closer, it crossed in front of the crotch.
export const TRUNK_CLEAR_M = 0.15;
// The G1's head (head_link.STL in the torso's frame, moved by its geom's pos): its center sits
// 0.39 m above the torso link and 1 cm forward, about 15 cm across and 21 cm tall; a 9 cm sphere
// covers it. The hand stays its 4 cm plus 1 cm of air beyond that.
export const HEAD_CENTER = [0.008, 0, 0.39];
export const HEAD_CLEAR_M = 0.09 + 0.04 + 0.01;
// Two hands touch at 8 cm between their centers (4 cm each); 1 cm of air keeps them from flickering
// through each other in a clap.
export const HANDS_APART_M = 0.09;
// Ankles at least this far apart sideways: a foot is ~10 cm wide, so 12 cm leaves 2 cm between
// them. The G1 stands with 24 cm; a person walks with 5 to 15 cm between the feet' centers lines.
export const FEET_APART_M = 0.12;
// The hand is past the wrist: its center sits this share of the forearm's length beyond it.
const HAND_PAST_WRIST = 0.6;
// The most a joint opens (rad, 60 degrees for a shoulder, 10 for each hip), searched by 1 degree.
// 30 degrees was enough for the thighs; a hand brought down onto the crown needs 55 (check-touch).
const MAX_ARM = Math.PI / 3;
const MAX_LEGS = Math.PI / 18;
const STEP = Math.PI / 180;
// An opening changes at most this fast (rad/s, ~86 degrees/s: the walk's largest, 18 degrees, in
// 0.2 s) and never falls short of what the pose needs: an average that followed it smoothly was
// always late and left the hand in the leg in 49 frames. A clip opens ahead of the touch; live
// cannot see ahead, so it opens at once and closes at this pace.
const OPEN_RATE = 1.5;

/**
 * @returns { clearClip(rows, fps), createLive() -> (qpos, t) => qpos, delete() }
 */
export function createClearance(mujoco, model) {
  const data = new mujoco.MjData(model);
  const body = (name) => idOf(mujoco, model, 'BODY', name);
  const joint = (name) => {
    const id = idOf(mujoco, model, 'JOINT', name);
    return { adr: model.jnt_qposadr[id], lo: model.jnt_range[2 * id], hi: model.jnt_range[2 * id + 1] };
  };
  const turn = (q, j, by) => (q[j.adr] = Math.min(j.hi, Math.max(j.lo, q[j.adr] + by)));
  const at = (id) => [data.xpos[3 * id], data.xpos[3 * id + 1], data.xpos[3 * id + 2]];
  function toSegment(p, a, b) {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / (ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2)));
    return Math.hypot(p[0] - a[0] - t * ab[0], p[1] - a[1] - t * ab[1], p[2] - a[2] - t * ab[2]);
  }

  // Outward is positive for the left limbs and negative for the right ones (the G1's ranges).
  const sides = ['left', 'right'].map((side, k) => ({
    out: k === 0 ? 1 : -1,
    hip: joint(`${side}_hip_roll_joint`),
    ankleRoll: joint(`${side}_ankle_roll_joint`),
    ankle: body(`${side}_ankle_roll_link`),
    thigh: [body(`${side}_hip_pitch_link`), body(`${side}_knee_link`)],
    shoulder: joint(`${side}_shoulder_roll_joint`),
    elbow: body(`${side}_elbow_link`),
    wrist: body(`${side}_wrist_yaw_link`),
  }));
  const trunk = [body('pelvis'), body('torso_link')];
  const torso = body('torso_link');
  // Where the head's center is in the pose in `data`: HEAD_CENTER turned with the torso.
  function head() {
    const m = data.xmat.subarray(9 * torso, 9 * torso + 9);
    const [x, y, z] = HEAD_CENTER;
    return at(torso).map((v, i) => v + m[3 * i] * x + m[3 * i + 1] * y + m[3 * i + 2] * z);
  }
  // The wrist and the hand's center of one side, in the pose in `data`.
  function handPoints(s) {
    const elbow = at(s.elbow);
    const wrist = at(s.wrist);
    return [wrist, wrist.map((v, i) => v + HAND_PAST_WRIST * (v - elbow[i]))];
  }
  const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

  // The parts that open, in order (the hands' gap depends on where the legs went). Each opens by
  // `amount` (rad) and says how much clearance the pose in `data` has (>= 0 when clear).
  const parts = [
    {
      max: MAX_LEGS,
      open(q, amount) {
        for (const s of sides) {
          turn(q, s.hip, s.out * amount);
          turn(q, s.ankleRoll, -s.out * amount); // the sole back to where it was turned
        }
      },
      margin(q) {
        const [l, r] = sides.map((s) => at(s.ankle));
        const yaw = 2 * Math.atan2(q[6], q[3]);
        return -Math.sin(yaw) * (l[0] - r[0]) + Math.cos(yaw) * (l[1] - r[1]) - FEET_APART_M;
      },
    },
    ...sides.map((s) => ({
      max: MAX_ARM,
      open: (q, amount) => turn(q, s.shoulder, s.out * amount),
      margin() {
        const [wrist, hand] = handPoints(s);
        let closest = Infinity;
        for (const { thigh } of sides) {
          const [a, b] = thigh.map(at);
          closest = Math.min(closest, toSegment(wrist, a, b), toSegment(hand, a, b));
        }
        const [a, b] = trunk.map(at);
        const fromTrunk = Math.min(toSegment(wrist, a, b), toSegment(hand, a, b));
        const center = head();
        const fromHead = Math.min(distance(wrist, center), distance(hand, center));
        return Math.min(closest - CLEAR_M, fromTrunk - TRUNK_CLEAR_M, fromHead - HEAD_CLEAR_M);
      },
    })),
    // The two hands against each other: both shoulders open by the same amount, so a clap stops
    // in the middle, where the person's hands meet, instead of one arm doing all the giving.
    {
      max: MAX_ARM,
      open(q, amount) {
        for (const s of sides) turn(q, s.shoulder, s.out * amount);
      },
      margin() {
        const [left, right] = sides.map(handPoints);
        let closest = Infinity;
        for (const a of left) for (const b of right) closest = Math.min(closest, distance(a, b));
        return closest - HANDS_APART_M;
      },
    },
  ];

  // The least opening (rad) that clears `part` in pose q.
  function needed(part, q) {
    let amount = 0;
    for (;;) {
      data.qpos.set(q);
      part.open(data.qpos, amount);
      mujoco.mj_kinematics(model, data);
      if (part.margin(data.qpos) >= 0 || amount >= part.max) return amount;
      amount += STEP;
    }
  }

  return {
    /** Clears a whole clip's rows (written in place), one part at a time. */
    clearClip(rows, fps) {
      for (const part of parts) {
        const need = rows.map((q) => needed(part, q));
        // Each frame opens as much as any frame around it needs, less what the rate allows over
        // the time between them: ramps in before the touch and out after it, never short of it.
        const reach = Math.ceil((part.max / OPEN_RATE) * fps);
        rows.forEach((q, i) => {
          let most = 0;
          for (let j = Math.max(0, i - reach); j <= Math.min(rows.length - 1, i + reach); j++) {
            most = Math.max(most, need[j] - (OPEN_RATE * Math.abs(i - j)) / fps);
          }
          part.open(q, most);
        });
      }
    },
    /** For the live camera: (qpos, t) -> qpos, cleared in place. */
    createLive() {
      const current = parts.map(() => 0);
      let last = null;
      return (q, t) => {
        const dt = last === null ? 1 : Math.max(0, t - last);
        last = t;
        parts.forEach((part, k) => {
          current[k] = Math.max(needed(part, q), current[k] - OPEN_RATE * dt);
          part.open(q, current[k]);
        });
        return q;
      };
    },
    delete: () => data.delete(),
  };
}
