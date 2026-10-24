// Headless check that the robot's hands stop on its head and on each other instead of going
// through (clearance.js), in two poses built straight on the G1's joints: a clap, both arms
// forward and turned in until the hands overlap, and both hands brought onto the top of the head.
// Run: npm run check
import { createClearance, HANDS_APART_M, HEAD_CENTER, HEAD_CLEAR_M } from '../src/clearance.js';
import { loadG1Node } from './node-model.mjs';

const { mujoco, sim } = await loadG1Node();
const kinematic = sim.createModel('g1_kinematics.xml', ['g1_kinematics.xml']);
const data = new mujoco.MjData(kinematic);
const id = (type, name) => mujoco.mj_name2id(kinematic, mujoco.mjtObj[`mjOBJ_${type}`].value, name);
const adr = (name) => kinematic.jnt_qposadr[id('JOINT', name)];
const at = (body) => [0, 1, 2].map((k) => data.xpos[3 * body + k]);
const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
const torso = id('BODY', 'torso_link');

const failures = [];
const expect = (ok, what) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures.push(what);
};

// The hands (wrist and the hand's center, as clearance.js places them) and the head's center.
function measure(q) {
  data.qpos.set(q);
  mujoco.mj_kinematics(kinematic, data);
  const hands = ['left', 'right'].map((side) => {
    const elbow = at(id('BODY', `${side}_elbow_link`));
    const wrist = at(id('BODY', `${side}_wrist_yaw_link`));
    return [wrist, wrist.map((v, i) => v + 0.6 * (v - elbow[i]))];
  });
  const m = data.xmat.subarray(9 * torso, 9 * torso + 9);
  const head = at(torso).map((v, i) => v + m[3 * i] * HEAD_CENTER[0] + m[3 * i + 1] * HEAD_CENTER[1] + m[3 * i + 2] * HEAD_CENTER[2]);
  let apart = Infinity;
  for (const a of hands[0]) for (const b of hands[1]) apart = Math.min(apart, distance(a, b));
  const fromHead = Math.min(...hands.flat().map((p) => distance(p, head)));
  return { apart, fromHead };
}

// Both arms the same, mirrored: shoulder pitch (negative raises the arm forward), roll (negative
// turns the left arm in, the G1's ranges are mirrored), yaw (the arm's twist) and elbow.
function pose({ pitch, roll, yaw = 0, elbow }) {
  const q = Float64Array.from(sim.data.qpos.slice(0, kinematic.nq));
  for (const [side, out] of [['left', 1], ['right', -1]]) {
    q[adr(`${side}_shoulder_pitch_joint`)] = pitch;
    q[adr(`${side}_shoulder_roll_joint`)] = out * roll;
    q[adr(`${side}_shoulder_yaw_joint`)] = out * yaw;
    q[adr(`${side}_elbow_joint`)] = elbow;
  }
  return q;
}

// Turns the arms in until the hands go deepest into each other or the head (the worst pose the
// retargeting could hand over), then clears it as the live camera does, for a few frames.
function check(name, base, key, needed) {
  let worst = null;
  for (let roll = 0; roll >= -1.5; roll -= 0.02) {
    const q = pose({ ...base, roll });
    const m = measure(q)[key];
    if (!worst || m < worst.m) worst = { q, m };
  }
  const clear = createClearance(mujoco, kinematic).createLive();
  let q = worst.q;
  for (let t = 0; t < 0.5; t += 1 / 30) q = clear(Float64Array.from(worst.q), t);
  const shown = measure(q)[key];
  expect(shown >= needed - 0.002, `${name}: ${(100 * shown).toFixed(1)} cm (the pose asked for ${(100 * worst.m).toFixed(1)}), ${(100 * needed).toFixed(0)} needed`);
}

console.log('hands touch instead of going through (clearance.js)');
check('clap, hands apart', { pitch: -1.3, elbow: 0.2 }, 'apart', HANDS_APART_M);
// Arms up and over, forearms bent down toward the crown: the pose that put a hand deepest in the
// head (a search over the shoulder and elbow, 3 mm from its center).
check('hands on the head, away from its center', { pitch: -2.3, yaw: 0.75, elbow: -0.7 }, 'fromHead', HEAD_CLEAR_M);

if (failures.length) {
  console.error(`\ncheck-touch failed: ${failures.length}`);
  process.exit(1);
}
console.log('\ncheck-touch passed');
