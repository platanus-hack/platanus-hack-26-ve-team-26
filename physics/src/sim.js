// One robot scene in MuJoCo: loads the MJCF from in-memory files, holds a keyframe pose
// with the robot's position actuators, and steps the physics in step with the wall clock.
// No browser APIs here, so the same code runs in the page and in Node (scripts/check.mjs).

// Longest wall-clock gap simulated in one call (two frames at 60 fps). After a hidden tab
// or a slow frame, catching up further would freeze the page; the robot just runs slower.
const MAX_CATCHUP_S = 1 / 30;

// The shove from the "push" button: 250 N for 0.1 s on the torso (25 N·s). On the 33 kg G1
// that is about 0.75 m/s, enough to tip it over when it only holds a stiff pose and has no
// balance controller yet. A policy that can catch itself is the goal of training.
const PUSH_BODY = 'torso_link';
const PUSH_NEWTONS = 250;
const PUSH_SECONDS = 0.1;

// Id of a named MuJoCo object; `type` is the suffix of its mjOBJ_ constant (BODY, JOINT, KEY...).
export function idOf(mujoco, model, type, name) {
  const id = mujoco.mj_name2id(model, mujoco.mjtObj[`mjOBJ_${type}`].value, name);
  if (id < 0) throw new Error(`MuJoCo ${type.toLowerCase()} "${name}" not found`);
  return id;
}

export class Simulation {
  /**
   * @param mujoco  module returned by the @mujoco/mujoco loader
   * @param files   { 'scene.xml': Uint8Array, 'assets/pelvis.STL': Uint8Array, ... }
   * @param sceneFile  entry MJCF, relative to the same root as `files`
   * @param keyName    keyframe to start from and hold
   */
  constructor(mujoco, files, sceneFile, keyName) {
    this.mujoco = mujoco;
    const vfs = new mujoco.MjVFS();
    try {
      for (const [path, bytes] of Object.entries(files)) vfs.addBuffer(path, bytes);
      this.model = mujoco.MjModel.from_xml_path(sceneFile, vfs);
    } finally {
      vfs.delete();
    }
    this.data = new mujoco.MjData(this.model);
    this.keyId = this.id('KEY', keyName);
    this.pushBodyId = this.id('BODY', PUSH_BODY);
    this.reset();
  }

  id(type, name) {
    return idOf(this.mujoco, this.model, type, name);
  }

  // Back to the physical robot standing in its keyframe, leaving puppet mode.
  reset() {
    const { mujoco, model, data } = this;
    this.puppeted = false;
    mujoco.mj_resetDataKeyframe(model, data, this.keyId);
    this.holdCurrentPose();
    this.endPush();
    mujoco.mj_forward(model, data);
    this.simTarget = data.time;
  }

  // Position actuators drive each joint toward its ctrl value, so setting ctrl to the
  // joints' current angles makes the robot hold that pose. Assumes every actuator is a
  // position actuator on a hinge joint, which is true for the G1.
  holdCurrentPose() {
    const { model, data } = this;
    const trnid = model.actuator_trnid;
    const qposadr = model.jnt_qposadr;
    const qpos = data.qpos;
    const ctrl = data.ctrl;
    for (let i = 0; i < model.nu; i++) ctrl[i] = qpos[qposadr[trnid[2 * i]]];
  }

  // Puppet mode: the robot is placed exactly at `qpos` (a RobotMotion row) with no dynamics, so
  // it shows a reference motion instead of reacting to physics. Only reset() leaves it.
  puppet(qpos) {
    const { mujoco, model, data } = this;
    this.puppeted = true;
    data.qpos.set(qpos);
    data.qvel.fill(0);
    mujoco.mj_forward(model, data);
    this.simTarget = data.time;
  }

  // Advances the physics by `seconds` of wall clock, in fixed MuJoCo steps.
  // Returns the number of steps taken (none in puppet mode).
  advance(seconds) {
    const { mujoco, model, data } = this;
    if (this.puppeted) return 0;
    const dt = model.opt.timestep;
    this.simTarget += Math.min(seconds, MAX_CATCHUP_S);
    let steps = 0;
    while (data.time < this.simTarget - dt / 2) {
      if (this.pushUntil && data.time >= this.pushUntil) this.endPush();
      mujoco.mj_step(model, data);
      steps++;
    }
    return steps;
  }

  // Horizontal shove on the torso in a random direction.
  push() {
    const angle = Math.random() * 2 * Math.PI;
    const force = this.data.xfrc_applied; // [nbody, 6]: force xyz, torque xyz
    const i = 6 * this.pushBodyId;
    force[i] = PUSH_NEWTONS * Math.cos(angle);
    force[i + 1] = PUSH_NEWTONS * Math.sin(angle);
    force[i + 2] = 0;
    this.pushUntil = this.data.time + PUSH_SECONDS;
  }

  endPush() {
    this.data.xfrc_applied.fill(0);
    this.pushUntil = 0;
  }

  // World position of a body, in MuJoCo coordinates (z up).
  bodyPosition(name) {
    const i = 3 * this.id('BODY', name);
    const xpos = this.data.xpos;
    return [xpos[i], xpos[i + 1], xpos[i + 2]];
  }

  delete() {
    this.data.delete();
    this.model.delete();
  }
}
