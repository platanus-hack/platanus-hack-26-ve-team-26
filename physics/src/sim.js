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

// Each createModel() compiles from its own folder in the WASM file system, so two never share one.
let loadCount = 0;

function removeTree(fs, path) {
  if (!fs.analyzePath(path).exists) return;
  for (const name of fs.readdir(path)) {
    if (name === '.' || name === '..') continue;
    const child = `${path}/${name}`;
    if (fs.isDir(fs.stat(child).mode)) removeTree(fs, child);
    else fs.unlink(child);
  }
  fs.rmdir(path);
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
    this.files = files;
    this.load(sceneFile, keyName);
  }

  /**
   * Builds the model from `sceneFile` (replacing the current one) and stands the robot in its
   * keyframe. The caller redraws anything built from the old model (RobotView.rebuild) and
   * drops what held it (a retargeter, a policy).
   */
  load(sceneFile, keyName) {
    const { mujoco } = this;
    const model = this.createModel(sceneFile);
    this.data?.delete();
    this.model?.delete();
    this.model = model;
    this.data = new mujoco.MjData(model);
    this.sceneFile = sceneFile;
    this.keyName = keyName;
    this.keyId = this.id('KEY', keyName);
    this.pushBodyId = this.id('BODY', PUSH_BODY);
    this.policy = null;
    this.reset();
  }

  // A new MjModel from `sceneFile`, owned by the caller (delete() it). Not the one simulated.
  // `paths` limits which of the files the model can read: a model without meshes needs only its
  // own XML.
  // The files go through Emscripten's in-memory file system, not MjVFS: MjVFS.addBuffer copies
  // a Uint8Array one element at a time across the JS/WASM boundary, which took 24 s for the
  // G1's 19 MB of meshes; FS.writeFile copies each file at once (23 ms). Measured in Node with
  // the same WASM build. The folder is removed after compiling, as MjVFS was deleted before.
  createModel(sceneFile, paths = Object.keys(this.files)) {
    const { mujoco } = this;
    const root = `/models/${++loadCount}`;
    try {
      for (const path of paths) {
        if (!this.files[path]) throw new Error(`The model file "${path}" was not loaded (is it in physics/models/unitree_g1?)`);
        mujoco.FS.mkdirTree(`${root}/${path}`.replace(/\/[^/]*$/, ''));
        mujoco.FS.writeFile(`${root}/${path}`, this.files[path]);
      }
      return mujoco.MjModel.from_xml_path(`${root}/${sceneFile}`);
    } finally {
      removeTree(mujoco.FS, root);
    }
  }

  id(type, name) {
    return idOf(this.mujoco, this.model, type, name);
  }

  // Back to the physical robot standing in its keyframe, leaving puppet mode.
  reset() {
    const { mujoco, model, data } = this;
    this.puppeted = false;
    this.steps = 0; // physics steps since the reset, to time the policy's decisions
    mujoco.mj_resetDataKeyframe(model, data, this.keyId);
    this.holdCurrentPose();
    this.policy?.reset(this);
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

  // Advances the physics by `seconds` of wall clock, in fixed MuJoCo steps. With a policy, it
  // decides every `policy.decimation` steps and writes the motor targets before them: its
  // inference is asynchronous, which is why this is. Returns the number of steps taken (none in
  // puppet mode).
  async advance(seconds) {
    const { mujoco } = this;
    if (this.puppeted) return 0;
    const dt = this.model.opt.timestep;
    this.simTarget += Math.min(seconds, MAX_CATCHUP_S);
    let steps = 0;
    while (this.data.time < this.simTarget - dt / 2) {
      if (this.policy && this.steps % this.policy.decimation === 0) {
        const { model } = this;
        const at = this.steps;
        await this.policy.act(this);
        // Whoever called reset(), puppet(), load() or delete() during the await owns the state
        // now, and the action was computed for the old one.
        if (this.puppeted || this.deleted || this.model !== model || this.steps !== at) return steps;
      }
      if (this.pushUntil && this.data.time >= this.pushUntil) this.endPush();
      mujoco.mj_step(this.model, this.data);
      this.steps++;
      steps++;
    }
    return steps;
  }

  // Horizontal shove on the torso, in a random direction unless `angle` (rad, about the vertical,
  // 0 = the robot's front) says otherwise, with the web button's force unless `newtons` does.
  push(angle = Math.random() * 2 * Math.PI, newtons = PUSH_NEWTONS) {
    const force = this.data.xfrc_applied; // [nbody, 6]: force xyz, torque xyz
    const i = 6 * this.pushBodyId;
    force[i] = newtons * Math.cos(angle);
    force[i + 1] = newtons * Math.sin(angle);
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
    this.deleted = true;
    this.data.delete();
    this.model.delete();
  }
}
