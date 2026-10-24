// Fingers: MediaPipe's hand model (21 points a hand) -> the joint angles of a Dex3 hand (Unitree's
// three-finger hand, models/dex3), for the live camera only.
//
// Each finger is solved on its own, like the arms in retarget.js: coordinate descent on the Dex3's
// real chain (models/dex3/hands.json) until its segments point where the person's do. The person's
// segments are measured in their hand's own frame (fingers forward, across toward the index, out
// of the back of the hand), so the fingers do not depend on where the arm put the wrist: a thumbs
// up, a point or a fist reads the same anywhere. The Dex3 has a thumb, an index and a middle
// finger; the middle follows the person's middle, ring and pinky together.
//
// Hand points (MediaPipe): 0 wrist; thumb 1-4; index 5-8; middle 9-12; ring 13-16; pinky 17-20.
import * as THREE from 'three';

// Each Dex3 finger and the person's segments that drive it, proximal first: [from, to] points.
const FINGERS = {
  thumb: { joints: ['thumb_0', 'thumb_1', 'thumb_2'], links: ['thumb_1', 'thumb_2'], human: [[[2, 3]], [[3, 4]]] },
  index: { joints: ['index_0', 'index_1'], links: ['index_0', 'index_1'], human: [[[5, 6]], [[6, 8]]] },
  middle: {
    joints: ['middle_0', 'middle_1'],
    links: ['middle_0', 'middle_1'],
    human: [[[9, 10], [13, 14], [17, 18]], [[10, 12], [14, 16], [18, 20]]],
  },
};
// Coordinate descent, as retarget.js: few joints, so a few rounds settle.
const ITERATIONS = 8;
const PROBE = 0.02; // rad
const MAX_STEP = 0.4; // rad per round
// A small pull toward the open hand breaks ties (a finger seen end-on has no clear bend).
const OPEN_PENALTY = 0.01;
// Descent from the open hand alone gets stuck: the Dex3's thumb starts out of the palm, and a
// thumbs up (pointing past the index) is 90 degrees from there with no slope toward it (it stayed
// at 0). So the thumb also starts from its first two joints at half their range each way (the
// index and middle only bend one way: the open hand is enough for them), and every finger from the
// previous frame; a fresh start replaces the previous frame's only when it costs under
// this share of it, so the finger does not flip between two near-equal answers.
const RESEED_MARGIN = 0.7;

/**
 * @param hands  models/dex3/hands.json: per side, the palm and the finger bodies under the wrist
 * @returns {{ solve(side, points): Map<string, number>, joints(side): object[], segment(side, q, link): THREE.Vector3 }}
 *   solve: the person's hand (21 points, robot axes: x forward, y left, z up) -> joint name ->
 *   angle (rad), for the robot's `side`; the hand's own frame is built from the points.
 */
export function createFingerSolver(hands) {
  const sides = {};
  for (const side of ['left', 'right']) {
    const bodies = hands[side].bodies.map((b) => ({
      ...b,
      short: b.name.replace(`${side}_hand_`, '').replace('_link', ''),
      offset: new THREE.Vector3(...b.pos),
      rest: new THREE.Quaternion(b.quat[1], b.quat[2], b.quat[3], b.quat[0]), // MuJoCo w, x, y, z
      axisVector: new THREE.Vector3(...b.axis),
    }));
    const byName = new Map(bodies.map((b) => [b.name, b]));
    // A link points toward its child; the last link of a finger keeps its parent's direction.
    for (const b of bodies) {
      const child = bodies.find((c) => c.parent === b.name);
      b.along = (child ? child.offset : b.offset).clone().normalize();
    }
    sides[side] = { bodies, byName, of: (short) => bodies.find((b) => b.short === short) };
  }

  const q = new THREE.Quaternion();
  const turn = new THREE.Quaternion();
  // The orientation of a body in the hand (wrist_yaw_link) frame, for the angles in `angles`.
  function orientation(side, body, angles, out) {
    const chain = [];
    for (let b = body; b; b = b.parent ? sides[side].byName.get(b.parent) : null) chain.unshift(b);
    out.identity();
    for (const b of chain) out.multiply(b.rest).multiply(turn.setFromAxisAngle(b.axisVector, angles.get(b.joint) ?? 0));
    return out;
  }
  /** Where a finger link points in the hand frame (unit vector). */
  function segment(side, angles, short) {
    const b = sides[side].of(short);
    return b.along.clone().applyQuaternion(orientation(side, b, angles, q));
  }

  const x = new THREE.Vector3();
  const y = new THREE.Vector3();
  const z = new THREE.Vector3();
  const v = new THREE.Vector3();
  const sum = new THREE.Vector3();
  // The person's segment in their hand frame (x fingers, y as the Dex3's, z toward the index).
  function local(points, pairs) {
    sum.set(0, 0, 0);
    for (const [a, b] of pairs) sum.add(v.subVectors(points[b], points[a]).normalize());
    sum.normalize();
    return new THREE.Vector3(sum.dot(x), sum.dot(y), sum.dot(z));
  }

  const last = {}; // the previous frame's answer per side, a starting point for the next

  function solve(side, points) {
    // Fingers forward: wrist to the knuckles' middle. Across: pinky knuckle to index knuckle.
    // The Dex3's y completes it (its palm faces -y on the left hand and +y on the right, and the
    // person's does the same with this frame: see retarget.js' palm).
    x.addVectors(points[5], points[17]).multiplyScalar(0.5).sub(points[0]).normalize();
    z.subVectors(points[5], points[17]);
    z.addScaledVector(x, -z.dot(x)).normalize();
    y.crossVectors(z, x);
    const angles = new Map();
    const { of } = sides[side];
    const previous = last[side];
    for (const finger of Object.values(FINGERS)) {
      const joints = finger.joints.map((short) => of(short));
      const targets = finger.human.map((pairs) => local(points, pairs));
      const cost = () =>
        finger.links.reduce((c, link, i) => c + 1 - segment(side, angles, link).dot(targets[i]), 0) +
        joints.reduce((c, b) => c + OPEN_PENALTY * (angles.get(b.joint) ?? 0) ** 2, 0);
      const set = (b, value) => angles.set(b.joint, THREE.MathUtils.clamp(value, b.range[0], b.range[1]));
      const descend = (start) => {
        joints.forEach((b, i) => set(b, start[i]));
        for (let it = 0; it < ITERATIONS; it++) {
          for (const b of joints) {
            const q0 = angles.get(b.joint);
            const c0 = cost();
            set(b, q0 + PROBE);
            const cp = cost();
            set(b, q0 - PROBE);
            const cm = cost();
            const curvature = cp - 2 * c0 + cm;
            let step = curvature > 1e-9 ? (-PROBE * (cp - cm)) / (2 * curvature) : cp < cm ? MAX_STEP : -MAX_STEP;
            step = THREE.MathUtils.clamp(step, -MAX_STEP, MAX_STEP);
            set(b, q0 + step);
            if (cost() > c0) set(b, q0);
          }
        }
        return { cost: cost(), values: joints.map((b) => angles.get(b.joint)) };
      };
      const half = (b) => (finger === FINGERS.thumb ? [0, 0.5 * b.range[0], 0.5 * b.range[1]] : [0]);
      const [first, second] = joints;
      let best = null;
      for (const a of half(first)) {
        for (const b of half(second)) {
          const tried = descend(joints.map((j, i) => (i === 0 ? a : i === 1 ? b : 0)));
          if (!best || tried.cost < best.cost) best = tried;
        }
      }
      if (previous) {
        const warm = descend(joints.map((b) => previous.get(b.joint) ?? 0));
        if (best.cost > warm.cost * RESEED_MARGIN) best = warm;
      }
      joints.forEach((b, i) => angles.set(b.joint, best.values[i]));
    }
    last[side] = angles;
    return angles;
  }

  return {
    solve,
    /** Forgets the previous frames (the hand was lost: the next one starts fresh). */
    reset: (side) => (side ? delete last[side] : Object.keys(last).forEach((k) => delete last[k])),
    segment,
    /** The finger bodies of one side, in hands.json's order (for drawing them). */
    joints: (side) => sides[side].bodies,
  };
}
