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

// The model values a world scales (applyWorld), copied once per load.
function snapshot(model) {
  const column = (field, stride, at) => Float64Array.from({ length: model.nu }, (_, a) => model[field][stride * a + at]);
  return {
    bodyMass: Float64Array.from(model.body_mass),
    bodyInertia: Float64Array.from(model.body_inertia),
    gain: column('actuator_gainprm', 10, 0), // kp
    biasKp: column('actuator_biasprm', 10, 1), // -kp
    biasKv: column('actuator_biasprm', 10, 2), // -kv
    torqueLimit: Float64Array.from(model.jnt_actfrcrange),
  };
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
    this.defaults = snapshot(model); // what applyWorld scales from, so worlds never compound
    this.wind = [0, 0];
    this.reset();
  }

  /**
   * Puts the robot in a world (physics/worlds/*.json), with one value per parameter: training
   * draws them from each range, the web shows the middle. Always starts from the model's own
   * values, so applying worlds one after another does not compound.
   * @param {{ friction: number, mass_scale: number, motor_scale: number, wind_newtons: number,
   *   wind_angle?: number }} world  wind_angle in radians about the vertical, 0 = the robot's front
   */
  applyWorld({ friction, mass_scale, motor_scale, wind_newtons, wind_angle = Math.PI / 2 }) {
    const { mujoco, model, data, defaults } = this;
    // Floor grip: the contact pairs with the floor (and the stones) carry their own friction,
    // which overrides the geoms'. Sliding friction in both tangent directions.
    const ground = new Set(['floor', 'stones'].map((name) => mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_GEOM.value, name)).filter((id) => id >= 0));
    for (let p = 0; p < model.npair; p++) {
      if (!ground.has(model.pair_geom1[p]) && !ground.has(model.pair_geom2[p])) continue;
      model.pair_friction[5 * p] = friction;
      model.pair_friction[5 * p + 1] = friction;
    }
    // Heavier or lighter robot: every body's mass and inertia, then MuJoCo's derived constants.
    for (let b = 0; b < model.nbody; b++) {
      model.body_mass[b] = defaults.bodyMass[b] * mass_scale;
      for (let k = 0; k < 3; k++) model.body_inertia[3 * b + k] = defaults.bodyInertia[3 * b + k] * mass_scale;
    }
    // Stronger or weaker motors: each position actuator's stiffness and damping (kp, kv) and each
    // joint's torque limit.
    for (let a = 0; a < model.nu; a++) {
      model.actuator_gainprm[10 * a] = defaults.gain[a] * motor_scale;
      model.actuator_biasprm[10 * a + 1] = defaults.biasKp[a] * motor_scale;
      model.actuator_biasprm[10 * a + 2] = defaults.biasKv[a] * motor_scale;
    }
    for (let k = 0; k < defaults.torqueLimit.length; k++) model.jnt_actfrcrange[k] = defaults.torqueLimit[k] * motor_scale;
    mujoco.mj_setConst(model, data);
    // Wind: a steady sideways force on the torso, added to any push.
    this.wind = [wind_newtons * Math.cos(wind_angle), wind_newtons * Math.sin(wind_angle)];
    this.endPush();
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
    force[i] = (this.wind?.[0] ?? 0) + newtons * Math.cos(angle);
    force[i + 1] = (this.wind?.[1] ?? 0) + newtons * Math.sin(angle);
    force[i + 2] = 0;
    this.pushUntil = this.data.time + PUSH_SECONDS;
  }

  // Ends a push; the world's wind (if any) keeps blowing on the torso.
  endPush() {
    const force = this.data.xfrc_applied;
    force.fill(0);
    const i = 6 * this.pushBodyId;
    force[i] = this.wind?.[0] ?? 0;
    force[i + 1] = this.wind?.[1] ?? 0;
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
