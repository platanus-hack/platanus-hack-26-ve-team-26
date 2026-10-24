// Retargeting: a human pose (from createPoseTracker) -> the joint angles of the Unitree G1, as
// one MuJoCo qpos row (the RobotMotion row of docs/contrato.md).
//
// The method is Sombra's (src/robot.js there): body frames from the shoulders and hips, then
// coordinate-descent IK on the robot's real kinematic chain instead of closed-form formulas, so
// nobody has to derive each axis' sign by hand. The difference is that the chain is the MuJoCo
// model itself (mj_kinematics on a scratch copy), so these are the angles the simulated G1 uses.
//
// What is copied:
//   pelvis    heading only (yaw); the robot stays upright, the waist and legs carry the rest
//   waist     torso orientation relative to the hips
//   arms/legs the direction of the upper and lower segment, in the torso (arms) or hip (legs) frame
//   feet      kept flat on the floor
// What is not: head (the G1 has no neck), hands and fingers (MediaPipe's are too noisy).
// Whatever the camera does not see (legs of someone sitting at a desk) stays in the stand pose.
import * as THREE from 'three';
import { idOf } from './sim.js';

// Coordinate descent, settings from Sombra, where they were tuned on the Apollo and the G1.
const IK_ITERATIONS = 6;
const IK_PROBE = 0.02; // rad, to estimate each joint's slope
const IK_MAX_STEP = 0.35; // rad per iteration, avoids sudden jumps
// A twisted posture can reach the same point as a natural one: a small cost for moving away from
// 0 (about 2 to 5 cm of error) breaks the tie in favor of the natural one.
const JOINT_PENALTY = 0.0005;
// The solution from rest replaces the one from the previous frame only if it costs under 70% of it.
const RESEED_MARGIN = 0.7;

// MediaPipe indices of the human side that drives each robot side. Mirror mode swaps them (and
// flips the pose), so the robot moves like your reflection: raise your right hand and the arm on
// the same side of the screen goes up.
const HUMAN = {
  left: { shoulder: 11, elbow: 13, wrist: 15, hip: 23, knee: 25, ankle: 27 },
  right: { shoulder: 12, elbow: 14, wrist: 16, hip: 24, knee: 26, ankle: 28 },
};
const OTHER = { left: 'right', right: 'left' };

const UP = new THREE.Vector3(0, 0, 1);

// The G1's body names. `frame` says which human body frame the limb's directions are measured in.
const limbs = (side) => [
  {
    name: `${side}_arm`,
    side,
    frame: 'torso',
    joints: ['shoulder_pitch', 'shoulder_roll', 'shoulder_yaw', 'elbow'].map((j) => `${side}_${j}_joint`),
    root: `${side}_shoulder_pitch_link`,
    mid: `${side}_elbow_link`,
    tip: `${side}_wrist_roll_link`,
    human: ['shoulder', 'elbow', 'wrist'],
  },
  {
    name: `${side}_leg`,
    side,
    frame: 'hip',
    joints: ['hip_pitch', 'hip_roll', 'hip_yaw', 'knee'].map((j) => `${side}_${j}_joint`),
    root: `${side}_hip_pitch_link`,
    mid: `${side}_knee_link`,
    tip: `${side}_ankle_pitch_link`,
    human: ['hip', 'knee', 'ankle'],
    foot: { joints: [`${side}_ankle_pitch_joint`, `${side}_ankle_roll_joint`], link: `${side}_ankle_roll_link` },
  },
];
const WAIST = { joints: ['waist_yaw_joint', 'waist_roll_joint', 'waist_pitch_joint'], link: 'torso_link' };

/**
 * @param mujoco  the loaded @mujoco/mujoco module
 * @param model   the G1's MjModel (it must have the "stand" keyframe)
 * @param options.mirror  move like a reflection (default) or like the person, left with left
 * @returns { solve(pose) -> { qpos, residual, tracked } }
 */
export function createRetargeter(mujoco, model, { mirror = true } = {}) {
  const data = new mujoco.MjData(model);
  mujoco.mj_resetDataKeyframe(model, data, idOf(mujoco, model, 'KEY', 'stand'));

  const bodyId = (name) => idOf(mujoco, model, 'BODY', name);
  const joint = (name) => {
    const id = idOf(mujoco, model, 'JOINT', name);
    return { adr: model.jnt_qposadr[id], limited: model.jnt_limited[id], lo: model.jnt_range[2 * id], hi: model.jnt_range[2 * id + 1] };
  };

  // Live views into the scratch MjData, refreshed at the start of every solve.
  let Q = data.qpos;
  let XPOS = data.xpos;
  let XQUAT = data.xquat;
  const fk = () => mujoco.mj_kinematics(model, data);
  const position = (id, out) => out.set(XPOS[3 * id], XPOS[3 * id + 1], XPOS[3 * id + 2]);
  // MuJoCo stores quaternions as (w, x, y, z); three.js as (x, y, z, w).
  const orientation = (id, out) => out.set(XQUAT[4 * id + 1], XQUAT[4 * id + 2], XQUAT[4 * id + 3], XQUAT[4 * id]);
  const getJoint = (j) => Q[j.adr];
  const setJoint = (j, v) => (Q[j.adr] = j.limited ? Math.min(j.hi, Math.max(j.lo, v)) : v);

  // Everything the solver needs about the robot, measured once in the stand pose.
  const pelvisId = bodyId('pelvis');
  const waist = { joints: WAIST.joints.map(joint), body: bodyId(WAIST.link) };
  const chains = [...limbs('left'), ...limbs('right')].map((c) => ({
    ...c,
    joints: c.joints.map(joint),
    rootId: bodyId(c.root),
    midId: bodyId(c.mid),
    tipId: bodyId(c.tip),
    foot: c.foot && { joints: c.foot.joints.map(joint), body: bodyId(c.foot.link) },
    targetMid: new THREE.Vector3(),
    targetTip: new THREE.Vector3(),
  }));
  // Soles: the G1 models each foot as four small spheres in its ankle roll link.
  const footBodies = new Set(chains.filter((c) => c.foot).map((c) => c.foot.body));
  const soles = [];
  for (let g = 0; g < model.ngeom; g++) {
    if (footBodies.has(model.geom_bodyid[g]) && model.geom_type[g] === mujoco.mjtGeom.mjGEOM_SPHERE.value) {
      soles.push({ id: g, radius: model.geom_size[3 * g] });
    }
  }

  fk();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  for (const c of chains) {
    c.upperLength = position(c.rootId, a).distanceTo(position(c.midId, b));
    c.foreLength = position(c.midId, a).distanceTo(position(c.tipId, b));
  }
  // Orientations at rest (stand pose, pelvis upright), world = pelvis frame. A target is "the
  // rest orientation, turned the way the person turned".
  const rest = { torso: orientation(waist.body, new THREE.Quaternion()) };
  for (const c of chains) if (c.foot) rest[c.name] = orientation(c.foot.body, new THREE.Quaternion());
  const restTorsoInverse = rest.torso.clone().invert();

  // Per-solve scratch.
  const S = Array.from({ length: 33 }, () => new THREE.Vector3()); // pose, flipped when mirroring
  const pelvisQ = new THREE.Quaternion();
  const hTorso = new THREE.Quaternion();
  const hHip = new THREE.Quaternion();
  const toLocal = new THREE.Quaternion();
  const canonical = new THREE.Quaternion();
  const rel = new THREE.Quaternion();
  const q = new THREE.Quaternion();
  const target = new THREE.Quaternion();
  const dir = new THREE.Vector3();
  const basis = { fwd: new THREE.Vector3(), left: new THREE.Vector3(), up: new THREE.Vector3() };
  const mid = (i, j) => new THREE.Vector3().addVectors(S[i], S[j]).multiplyScalar(0.5);

  const penalty = (joints) => joints.reduce((sum, j) => sum + JOINT_PENALTY * getJoint(j) ** 2, 0);

  function limbCost(c) {
    fk();
    position(c.midId, a);
    position(c.tipId, b);
    return a.distanceToSquared(c.targetMid) + b.distanceToSquared(c.targetTip) + penalty(c.joints);
  }

  function orientationCost(part, goal) {
    fk();
    orientation(part.body, q);
    // 1 - cos² of the half angle: grows like the square of the angle between the two orientations.
    return 1 - q.dot(goal) ** 2 + penalty(part.joints);
  }

  // Solved from the previous pose and from rest. Starting only from the previous one leaves joints
  // stuck in twisted configurations; the rest solution replaces it only when clearly better, so
  // the result does not jump between the two.
  function solveJoints(joints, cost) {
    const warmCost = descend(joints, cost);
    const warm = joints.map(getJoint);
    for (const j of joints) setJoint(j, 0);
    const restCost = descend(joints, cost);
    if (restCost > warmCost * RESEED_MARGIN) joints.forEach((j, i) => setJoint(j, warm[i]));
  }

  function descend(joints, cost) {
    for (let it = 0; it < IK_ITERATIONS; it++) {
      for (const j of joints) {
        const q0 = getJoint(j);
        const c0 = cost();
        setJoint(j, q0 + IK_PROBE);
        const cp = cost();
        setJoint(j, q0 - IK_PROBE);
        const cm = cost();
        // Newton step on the parabola through the three points; if it is not convex, go downhill.
        const curvature = cp - 2 * c0 + cm;
        let step = curvature > 1e-9 ? (-IK_PROBE * (cp - cm)) / (2 * curvature) : cp < cm ? IK_MAX_STEP : -IK_MAX_STEP;
        step = THREE.MathUtils.clamp(step, -IK_MAX_STEP, IK_MAX_STEP);
        setJoint(j, q0 + step);
        if (cost() > c0) setJoint(j, q0);
      }
    }
    return cost();
  }

  // Basis (forward, left, up) as a rotation, from the left direction and an approximate "up"
  // (or "forward"); the given vector is made perpendicular to left.
  function frame(out, left, up, fwd = null) {
    basis.left.copy(left).normalize();
    if (fwd) {
      basis.fwd.copy(fwd).addScaledVector(basis.left, -fwd.dot(basis.left)).normalize();
      basis.up.crossVectors(basis.fwd, basis.left);
    } else {
      basis.up.copy(up).addScaledVector(basis.left, -up.dot(basis.left)).normalize();
      basis.fwd.crossVectors(basis.left, basis.up);
    }
    return out.setFromRotationMatrix(new THREE.Matrix4().makeBasis(basis.fwd, basis.left, basis.up));
  }

  /**
   * @param pose { points, visible } from createPoseTracker
   * @returns qpos: Float64Array(nq), a copy; residual: the worst distance (m) between where a limb
   *   ended up and where the person put it (above ~0.08 the robot cannot do that move); tracked:
   *   false when the shoulders were not seen and the previous pose was kept.
   */
  function solve({ points, visible: V }) {
    Q = data.qpos;
    XPOS = data.xpos;
    XQUAT = data.xquat;
    const L = mirror ? HUMAN.right : HUMAN.left; // the human landmarks that drive the robot's left
    const R = mirror ? HUMAN.left : HUMAN.right;
    const side = { left: L, right: R };
    if (!V[L.shoulder] || !V[R.shoulder]) return { qpos: Q.slice(), residual: 0, tracked: false };
    for (let i = 0; i < 33; i++) S[i].set(points[i].x, mirror ? -points[i].y : points[i].y, points[i].z);
    const hipsSeen = V[L.hip] && V[R.hip];

    // Pelvis: heading from the hips (or the shoulders when the hips are out of frame), upright.
    const heading = hipsSeen ? frame(hHip, dir.subVectors(S[L.hip], S[R.hip]), UP) : null;
    // Human torso: left between the shoulders, up from the hips to the shoulders.
    const torsoUp = hipsSeen ? mid(L.shoulder, R.shoulder).sub(mid(L.hip, R.hip)) : UP;
    frame(hTorso, dir.subVectors(S[L.shoulder], S[R.shoulder]), torsoUp);
    const headingFrame = heading ?? hTorso;
    dir.set(1, 0, 0).applyQuaternion(headingFrame);
    pelvisQ.setFromAxisAngle(UP, Math.atan2(dir.y, dir.x));
    Q[0] = Q[1] = Q[2] = 0;
    Q[3] = pelvisQ.w;
    Q[4] = pelvisQ.x;
    Q[5] = pelvisQ.y;
    Q[6] = pelvisQ.z;

    // Waist: the torso's turn and lean relative to the hips. Without hips there is no reference,
    // so the torso goes back to rest.
    if (hipsSeen) rel.copy(hHip).invert().multiply(hTorso);
    else rel.identity();
    target.copy(pelvisQ).multiply(rel).multiply(rest.torso);
    solveJoints(waist.joints, () => orientationCost(waist, target));
    fk();
    orientation(waist.body, q);
    // Robot torso axes (forward, left, up): the torso's current orientation without its rest offset.
    const torsoCanonical = canonical.copy(q).multiply(restTorsoInverse);
    const hTorsoInverse = toLocal.copy(hTorso).invert();
    const hHipInverse = new THREE.Quaternion().copy(hHip).invert();

    let residual = 0;
    for (const c of chains) {
      const h = side[c.side];
      const [i0, i1, i2] = c.human.map((k) => h[k]);
      if (!V[i0] || !V[i1] || !V[i2]) continue;
      if (c.frame === 'hip' && !hipsSeen) continue;
      const toRobot = c.frame === 'torso' ? hTorsoInverse : hHipInverse;
      const robotFrame = c.frame === 'torso' ? torsoCanonical : pelvisQ;
      // Directions of the upper and lower segment in the human body frame, then in the robot's.
      position(c.rootId, a);
      dir.subVectors(S[i1], S[i0]).normalize().applyQuaternion(toRobot).applyQuaternion(robotFrame);
      c.targetMid.copy(a).addScaledVector(dir, c.upperLength);
      dir.subVectors(S[i2], S[i1]).normalize().applyQuaternion(toRobot).applyQuaternion(robotFrame);
      c.targetTip.copy(c.targetMid).addScaledVector(dir, c.foreLength);
      solveJoints(c.joints, () => limbCost(c));
      fk();
      position(c.midId, a);
      position(c.tipId, b);
      residual = Math.max(residual, a.distanceTo(c.targetMid), b.distanceTo(c.targetTip));
      if (c.foot) {
        // Soles level with the floor: the foot's rest orientation turned with the pelvis' heading.
        target.copy(pelvisQ).multiply(rest[c.name]);
        solveJoints(c.foot.joints, () => orientationCost(c.foot, target));
      }
    }

    // Height: lower the pelvis until the lowest point of either foot touches the floor.
    fk();
    let lowest = Infinity;
    for (const { id, radius } of soles) lowest = Math.min(lowest, data.geom_xpos[3 * id + 2] - radius);
    Q[2] = -lowest;
    return { qpos: Q.slice(), residual, tracked: true };
  }

  return { solve, delete: () => data.delete() };
}
