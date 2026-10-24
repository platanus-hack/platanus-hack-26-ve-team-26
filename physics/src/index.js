// Public API of physics/ for the web app: give it a canvas and it loads MuJoCo and the G1,
// simulates in real time and draws every frame until dispose().
import { loadG1 } from './load.js';
import { LOOP_BLEND_S, motionDuration, retargetClipAsync, sampleLoopStart, sampleMotion, smoothForDisplay } from './motion.js';
import { createPolicy } from './policy.js';
import { createPoseTracker } from './pose.js';
import { createRetargeter } from './retarget.js';
import { createRootTracker } from './root.js';
import { createLeveler } from './level.js';
import { createRobotPoseFilter } from './filters.js';
import { RobotView } from './viewer.js';
import { placeXml, SCENE_ORDER } from './scenes.js';
import { middleValues, sceneFile as worldScene, windForce, windSpeed, WORLD_ORDER } from './worlds.js';

// physics/worlds/*.json, in display order.
const WORLD_FILES = import.meta.glob('../worlds/*.json', { eager: true, import: 'default' });
export const WORLDS = Object.values(WORLD_FILES).sort((a, b) => WORLD_ORDER.indexOf(a.id) - WORLD_ORDER.indexOf(b.id));

// physics/scenes/*.json: places with furniture and loose objects (a kitchen, a warehouse, a sidewalk).
const SCENE_FILES = import.meta.glob('../scenes/*.json', { eager: true, import: 'default' });
export const SCENES = Object.values(SCENE_FILES).sort((a, b) => SCENE_ORDER.indexOf(a.id) - SCENE_ORDER.indexOf(b.id));

// The real-time ratio passed to onStats is averaged over this window so it reads steadily.
const STATS_WINDOW_S = 1;

/**
 * @param canvas  a <canvas> sized by CSS; the view follows its size. It can be moved between
 *   elements (the WebGL context survives); while it is out of the page the robot pauses
 * @param options.onProgress  ({ done, total, bytes }) while MuJoCo and the robot download
 * @param options.onStats     ({ realtime, pelvisHeight, puppet }) once per second while playing;
 *   `puppet` is true while the robot copies a person (no dynamics, so `realtime` is 0)
 * @param options.mirror      when copying a person, move like their reflection (default: raise
 *   your right hand and the arm on the same side of the screen goes up) or like them
 * @param options.theme       scene colors { background, ground, gridMajor, gridMinor }; any left out
 *   keep the dark defaults of viewer.js
 */
export async function createSimView(canvas, { onProgress, onStats, mirror = true, theme } = {}) {
  const sim = await loadG1(onProgress);
  const view = new RobotView(sim, canvas, theme);
  // The first draw compiles the shaders (about a second); keep it out of the timing below.
  view.render();

  let speed = 1;
  let playing = true;
  // The RobotMotion being played, if any: { motion, duration, loop }, and where it is (s).
  let clip = null;
  let clipTime = 0;
  const row = new Float64Array(sim.model.nq); // the pose being shown (the robot alone: 36 values)
  const lastRow = new Float64Array(sim.model.nq); // a clip's last pose, while it starts over
  let frameId = 0;
  let last = performance.now();
  let stats = { wall: 0, sim: 0 };

  let disposed = false;

  async function frame(now) {
    try {
      const wall = Math.max(0, (now - last) / 1000); // the first frame's timestamp can predate `last`
      last = now;
      // A canvas outside the page (the web app keeps one robot and moves its canvas between
      // screens) is neither simulated nor drawn: the robot waits where it was, at no GPU cost.
      if (!canvas.isConnected) {
        frameId = requestAnimationFrame(frame);
        return;
      }
      if (clip) {
        // Same clock as the web's skeleton (wall time x speed), so both stay in step.
        if (playing) clipTime = clip.loop ? (clipTime + wall * speed) % clip.duration : Math.min(clipTime + wall * speed, clip.duration);
        // Started over (by its own clock or by seek() from the page's): ease in from the last pose
        // instead of jumping to the first (sampleLoopStart).
        if (clip.loop && clipTime < clip.shown - clip.duration / 2) clip.wrapped = true;
        if (clipTime >= LOOP_BLEND_S) clip.wrapped = false;
        clip.shown = clipTime;
        sim.puppet(clip.wrapped ? sampleLoopStart(clip.motion, clipTime, row, lastRow) : sampleMotion(clip.motion, clipTime, row));
      } else if (playing) {
        const before = sim.data.time;
        await sim.advance(wall * speed);
        stats.sim += sim.data.time - before;
      }
      if (disposed) return;
      stats.wall += wall;
      view.render();
      if (stats.wall >= STATS_WINDOW_S) {
        onStats?.({
          realtime: stats.sim / stats.wall,
          pelvisHeight: sim.bodyPosition('pelvis')[2],
          puppet: sim.puppeted,
          policy: sim.policy?.id ?? null,
        });
        stats = { wall: 0, sim: 0 };
      }
    } catch (error) {
      console.error(error); // keep drawing: one bad frame should not freeze the page
    }
    if (!disposed) frameId = requestAnimationFrame(frame);
  }
  frameId = requestAnimationFrame(frame);

  // Built on first use: only the camera and retargeting need them.
  let tracker = null;
  let retargeter = null;
  let smoother = null; // the live pose filter (filters.js createRobotPoseFilter)
  let rootTracker = null; // where the copying robot is on the floor (root.js)
  let leveler = null; // keeps the copying robot upright sideways (level.js)
  // Retargeting runs on its own model of the G1: the kinematic chain and the soles, without meshes
  // (a model with them takes ~3 s to build in a browser, and would freeze the first camera frame).
  // It does not depend on which model the simulation shows, and its joints are laid out exactly
  // like the policy's model, so the result serves both.
  let kinematic = null;
  const KINEMATICS = 'g1_kinematics.xml';
  const kinematicModel = () => (kinematic ??= sim.createModel(KINEMATICS, [KINEMATICS]));

  // Loads another model into the Simulation. Whatever was built from the old one goes: the
  // retargeter and the policy, and the drawn robot is rebuilt.
  function swapScene(sceneFile, keyName) {
    sim.policy?.dispose();
    clip = null;
    baseScene = sceneFile;
    sim.load(place ? placeFile(sceneFile) : sceneFile, keyName);
    if (world) sim.applyWorld(conditions ?? middleValues(world)); // a new model starts from its own values
    view.rebuild();
  }

  // The world the robot is in (physics/worlds), null for the plain scene; and the last policy's
  // bytes and metadata, so changing to a world with another scene can bring the policy back.
  let world = null;
  // Values set by hand over the world's middle ones (setConditions), kept across model reloads.
  let conditions = null;
  let lastPolicy = null;
  // The place the robot is in (physics/scenes, or one detected in a video), null for an empty floor;
  // and the scene file under it (the policy's, or a world's), which the place is added to.
  let place = null;
  let baseScene = sim.sceneFile;

  // The MJCF of `base` with the current place in it, generated once per place and base and kept
  // with the model files, where the Simulation loads it from.
  function placeFile(base) {
    const name = `place_${place.id}_${base}`;
    if (!sim.files[name]) {
      const text = (file) => new TextDecoder().decode(sim.files[file]);
      const baseXml = text(base);
      const robot = baseXml.match(/<include file="([^"]+)"/)?.[1];
      sim.files[name] = new TextEncoder().encode(placeXml(baseXml, robot ? text(robot) : '', place));
    }
    return name;
  }

  // After a new model: the last policy again, on it.
  async function restorePolicy() {
    if (!lastPolicy) return;
    const { loadOrt } = await import('./ort.js');
    sim.policy = await createPolicy(await loadOrt(), sim, lastPolicy.bytes, lastPolicy.meta, { motion: lastPolicy.motion });
  }

  // Ends a clip or a camera copy and returns to the physical robot, standing.
  function stop() {
    clip = null;
    reset();
  }

  // With a clip playing: back to its start. Otherwise the physical robot standing again (and
  // the next mimic() starts from the stand pose).
  function reset() {
    if (clip) return void (clipTime = 0);
    sim.reset();
    retargeter?.delete();
    rootTracker?.delete();
    leveler?.delete();
    tracker = retargeter = smoother = rootTracker = leveler = null;
  }

  return {
    sim,
    // The three.js side (camera, controls, targetHeight), for a page that directs the camera itself.
    viewer: view,
    play: () => (playing = true),
    pause: () => (playing = false),
    setSpeed: (value) => (speed = value),
    reset,
    // The shove is for the physical robot: if it was copying a clip or a person, it first goes
    // back to standing.
    push() {
      if (clip || sim.puppeted) stop();
      sim.push();
    },
    /**
     * Plays a RobotMotion (physics/motions/, or any with the G1's 36 values per frame) on the
     * robot, without dynamics. It follows play(), pause() and setSpeed(), and reset() rewinds it.
     * What shows is the motion cleaned of the video's jitter (smoothForDisplay in motion.js).
     * @param options.loop  start over at the end (default), or hold the last frame
     * @param options.plantFeet  the pelvis path re-made so the foot on the floor does not slide
     *   (motion.js plantFeet): 'auto' (default) does it unless the clip's feet do not explain its
     *   travel (a run seen from the side); true or false force it.
     */
    playClip(motion, { loop = true, plantFeet = 'auto' } = {}) {
      // The robot's own values (36), not the model's: a place with loose objects adds 7 per object.
      const robotValues = kinematicModel().nq;
      if (motion.robot !== 'unitree_g1' || motion.qpos[0]?.length !== robotValues) {
        throw new Error(`This RobotMotion is not for the ${robotValues}-value G1 (robot: ${motion.robot}).`);
      }
      clip = { motion: smoothForDisplay(sim.mujoco, kinematicModel(), motion, { plantFeet }), duration: motionDuration(motion), loop, shown: 0, wrapped: false };
      clipTime = 0;
    },
    /**
     * The RobotMotion of a PoseClip (a recorded or uploaded one), computed here, in slices so the
     * page keeps answering: about 2 ms per frame, so a 12 s clip takes under a second.
     * Same result as `npm run retarget`, which is instant for the clips already in physics/motions.
     * @param options.onProgress  0 to 1, after each slice
     * @returns Promise<{ motion, stats }> see retargetClip; null if the view was disposed meanwhile
     */
    retarget: (poseClip, options = {}) => retargetClipAsync(sim.mujoco, kinematicModel(), poseClip, { mirror: false, cancelled: () => disposed, ...options }),
    /**
     * Where the clip is, in seconds: the clip being played, or the one an imitation policy follows;
     * 0 otherwise. For syncing anything drawn beside the robot (the person's skeleton).
     */
    clipTime: () => (clip ? clipTime : sim.policy?.time?.(sim) ?? 0),
    seek: (seconds) => (clipTime = Math.min(Math.max(seconds, 0), clip?.duration ?? 0)),
    stop,
    /**
     * Gives the robot a trained policy (training/policies/): from then on it balances itself, and
     * "push" shows it recovering. The policy was trained on its own model of the G1 (softer motors,
     * policy.json's `mjcf`), so this switches the robot to that model; the standing hold of the
     * default model would not work on it.
     * @param onnx  policy.onnx: a URL, or its bytes
     * @param meta  policy.json: the object, or a URL
     * @param options.motion  for an imitation policy (policy.json `task: "mimic"`): the RobotMotion it
     *   learned (the object, or a URL). The robot then does that clip with physics, from its first
     *   pose, and starts over at the end; clipTime() says where it is, and push() still works.
     * Loading another policy of the same model only swaps the network. onnxruntime-web (14 MB of
     * WebAssembly) is downloaded the first time.
     */
    async loadPolicy(onnx, meta, { motion } = {}) {
      const bytes = typeof onnx === 'string' ? new Uint8Array(await (await fetch(onnx)).arrayBuffer()) : new Uint8Array(onnx);
      if (typeof meta === 'string') meta = await (await fetch(meta)).json();
      if (typeof motion === 'string') motion = await (await fetch(motion)).json();
      // The policy's scene ('unitree_g1/scene_mjx.xml' -> 'scene_mjx.xml'), or the current world's
      // version of it (the same robot, another floor).
      const sceneFile = world ? worldScene(world) : meta.mjcf.slice(meta.mjcf.indexOf('/') + 1);
      const { loadOrt } = await import('./ort.js');
      const ort = await loadOrt();
      const previous = { sceneFile: baseScene, keyName: sim.keyName };
      if (baseScene !== sceneFile) swapScene(sceneFile, 'home');
      else stop();
      try {
        const policy = await createPolicy(ort, sim, bytes, meta, { motion });
        sim.policy?.dispose();
        sim.policy = policy;
        lastPolicy = { bytes, meta, motion };
        sim.reset();
      } catch (error) {
        if (baseScene !== previous.sceneFile) swapScene(previous.sceneFile, previous.keyName);
        throw error;
      }
    },
    /** Takes the policy off and goes back to the stiff standing hold. */
    clearPolicy: () => {
      world = null;
      lastPolicy = null;
      swapScene('scene.xml', 'stand');
    },
    /**
     * Puts the robot in a world from physics/worlds (an entry of WORLDS): floor, grip, wind,
     * mass and motor strength, with the middle of each training range. A world on another scene
     * (the stones) reloads the model and brings the policy back. Ends a clip or a camera copy.
     */
    async setWorld(next) {
      world = next;
      conditions = null; // a new world starts from its own middle values
      if (baseScene !== worldScene(next)) {
        swapScene(worldScene(next), 'home');
        await restorePolicy();
      } else {
        stop();
        sim.applyWorld(middleValues(next));
      }
      sim.reset();
    },
    /** The world the robot is in, or null. */
    world: () => world,
    /**
     * Sets the conditions by hand over the current world (flat ground if none): any of
     * { friction, wind_mps, mass_scale, motor_scale }; the rest keep their value. Applies at once,
     * without resetting the robot, and survives a change of place.
     */
    setConditions(values) {
      const base = conditions ?? middleValues(world ?? { friction: [1, 1], wind_mps: [0, 0], mass_scale: [1, 1], motor_scale: [1, 1] });
      const next = { ...base, ...values };
      if (values.wind_mps !== undefined) next.wind_newtons = windForce(values.wind_mps);
      conditions = next;
      sim.applyWorld(conditions);
    },
    /** The conditions in effect: { friction, wind_mps, mass_scale, motor_scale, wind_newtons }. */
    conditions: () => {
      const current = conditions ?? (world ? middleValues(world) : null);
      if (!current) return { friction: 1, wind_mps: 0, mass_scale: 1, motor_scale: 1, wind_newtons: 0 };
      return { wind_mps: current.wind_mps ?? windSpeed(current.wind_newtons), ...current };
    },
    /**
     * Puts the robot in a place (an entry of SCENES, or a scene data/ detected in a video; format
     * in docs/contrato.md): its furniture is solid, and its loose objects can be pushed and knocked
     * over. null takes it away. It combines with the world (a slippery kitchen). Rebuilds the model
     * (a moment) and brings the policy back. Ends a clip or a camera copy.
     */
    async setScene(next) {
      place = next;
      swapScene(baseScene, sim.keyName);
      await restorePolicy();
      sim.reset();
    },
    /** The place the robot is in, or null. */
    scene: () => place,
    /**
     * Makes the G1 copy a person, one camera frame at a time. Pass what createLiveCapture's
     * onPose gives. A null pose or one too occluded keeps the last pose. reset() ends it.
     * With the pose's `camera` (where the hips are from the camera) the robot also goes where the
     * person goes: it walks across the floor with its planted foot still, and leaves it in a jump
     * (root.js). Without it, it still walks by its feet, but cannot jump.
     * @returns { tracked, residual, airborne } residual is the worst distance (m) between a limb
     *   and where the person put it; above ~0.08 the G1 cannot do that move. airborne: in a jump.
     */
    mimic(pose) {
      if (!pose?.visible) return { tracked: false, residual: 0, airborne: false };
      clip = null;
      tracker ??= createPoseTracker();
      retargeter ??= createRetargeter(sim.mujoco, kinematicModel(), { mirror });
      smoother ??= createRobotPoseFilter(kinematicModel().nq); // the robot's own values, not a place's objects
      rootTracker ??= createRootTracker(sim.mujoco, kinematicModel(), { mirror, legLength: retargeter.legLength });
      leveler ??= createLeveler(sim.mujoco, kinematicModel());
      const points = tracker.update(pose.world, pose.landmarks, pose.t);
      const { qpos, tracked, residual } = retargeter.solve(points, { travelYaw: rootTracker.travelYaw() });
      // The path is made from the filtered pose, the one drawn: made from the raw one, the planted
      // foot would slide by whatever the filter holds back.
      // Leveled before the path: root.js puts the leveled feet back on the floor.
      if (tracked) sim.puppet(rootTracker.update(leveler.level(smoother.filter(qpos, pose.t), pose.t), pose));
      return { tracked, residual, airborne: rootTracker.airborne() };
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frameId);
      sim.policy?.dispose();
      view.dispose();
      retargeter?.delete();
      rootTracker?.delete();
      leveler?.delete();
      kinematic?.delete();
      sim.delete();
    },
  };
}
