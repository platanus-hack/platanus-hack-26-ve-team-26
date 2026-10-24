// Where the G1 is on the floor while it copies a person live (view.mimic). MediaPipe's 3D points
// are centered on the hips every frame, so the pose alone keeps the robot on one spot: it walked in
// place, and a jump only bent its legs. Two estimates move it, each covering what the other misses:
//
//   feet    the foot on the floor does not move: whatever it moves against the pelvis, the pelvis
//           moved the other way (motion.js plantFeet, data/lift.py). Exact step to step, so the
//           planted foot does not slide, but it drifts, and it knows nothing while both feet are up.
//   camera  where the hips are from the camera (data/live cameraTranslation, a pinhole fit of the
//           3D pose onto the image). Noisy frame to frame, but it does not drift, and it sees the
//           body leave the floor.
//
// On the floor the path follows the feet, pulled slowly toward the camera's; in the air (a jump, a
// run's flight) it follows the camera, and the height above the floor comes from the camera too.
import { OneEuroFilter } from './filters.js';
import { idOf } from './sim.js';

// A sole within 1 cm of the floor carries weight; above 2 cm it is swinging. In between, a share:
// the weight passes from one foot to the other smoothly, and with both feet down (jumping jacks,
// a shuffle) their average is the anchor, so feet spreading apart do not push the pelvis sideways.
// Measured on data/clips' walk (check-root): 1 to 2 cm, the planted foot slides 0.13 m/s (median,
// as plantFeet offline) and the robot covers 7.1 m of the person's 7.5; 1 to 5 cm let the lifting
// heel drag the anchor back (0.20 m/s, 6.5 m); under 1 cm it walks further but slides 0.15.
const CONTACT_LOW_M = 0.01;
const CONTACT_HIGH_M = 0.02;
// The camera pulls the path toward itself with this time constant, at most this fast. The feet's
// path and the camera's differ on purpose (the G1's stride is not the person's scaled; motion.js
// measured 9.8 m against 7.5 m on the walk), and any pull shows as the planted foot sliding: 0.15
// m/s is under the 0.2 that check-smooth calls sliding, and 2 s erases a step of drift in a few
// strides without fighting the stride itself.
const CAMERA_PULL_S = 2;
const CAMERA_PULL_MAX_M_S = 0.15;
// One Euro on the camera fit, in meters. Its depth wobbles a few centimeters per frame at 3 m;
// the slow cutoff keeps that out of a jump's sideways drift, the speed term keeps a jump's rise.
const CAMERA_FILTER = { minCutoff: 1, beta: 2 };

// A jump: the lowest foot rises more than 6 cm above the floor at more than 0.5 m/s. A person's
// vertical jump is 20 to 50 cm and leaves the floor at 2 to 3 m/s; a walking foot that lifts is
// not the lowest one, and the camera fit's noise is a couple of centimeters at a fraction of that
// speed. It ends when the foot is back within 2 cm, or after 1.2 s (no jump lasts longer: a stuck
// state would leave the robot floating).
const JUMP_START_M = 0.06;
const JUMP_SPEED_M_S = 0.5;
const JUMP_END_M = 0.02;
const MAX_AIR_S = 1.2;
// The floor's height in the camera image changes slowly while the person walks toward a tilted
// camera; on the ground it follows the lowest foot with this time constant, in the air it holds.
const FLOOR_FOLLOW_S = 0.5;
// The lowest foot's height is filtered (One Euro, m) and its speed averaged over 0.1 s: a jump
// rises for ~0.2 s, the noise flips sign every frame.
const FOOT_FILTER = { minCutoff: 2, beta: 4 };
const RISE_WINDOW_S = 0.1;
// The height shown: a jump starts at 6 cm, not from zero, so it is eased in (and out) by this
// filter instead of appearing in one frame.
const LIFT_FILTER = { minCutoff: 3, beta: 1 };

// The direction of travel, for the robot's heading (retarget.js travelYaw): the path's net
// displacement over the last second, once it is a walk (0.35 m/s; offline uses 0.25 over 3 s,
// centered, which live does not have).
const TRAVEL_WINDOW_S = 1;
const MIN_TRAVEL_SPEED = 0.35;
// A gap longer than this in the camera's frames (the person left the shot) starts the step anew
// instead of counting everything the feet moved meanwhile as one step.
const MAX_GAP_S = 0.5;
// Robot leg over the person's, until the person's legs have been seen: about the G1 (0.6 m of
// leg) over an adult (0.8 m).
const DEFAULT_SCALE = 0.75;
const LEG_SAMPLES = 90; // 3 s of camera frames: the median of the person's leg length
const FEET = [27, 28, 29, 30, 31, 32]; // ankles, heels and toes (MediaPipe)
const ANKLES = ['left_ankle_roll_link', 'right_ankle_roll_link'];

/**
 * @param mujoco  the loaded @mujoco/mujoco module
 * @param model   the G1 kinematic model the retargeter uses
 * @param options.mirror     as the retargeter: the robot moves like the person's reflection
 * @param options.legLength  the robot's hip-to-ankle length (retargeter.legLength)
 * @returns { update(qpos, pose) -> qpos, travelYaw(), delete() }
 */
export function createRootTracker(mujoco, model, { mirror = true, legLength }) {
  const data = new mujoco.MjData(model);
  const ankles = ANKLES.map((name) => idOf(mujoco, model, 'BODY', name));
  const soles = ankles.map((body) => {
    const ids = [];
    for (let g = 0; g < model.ngeom; g++) {
      if (model.geom_bodyid[g] === body && model.geom_type[g] === mujoco.mjtGeom.mjGEOM_SPHERE.value) ids.push(g);
    }
    return ids;
  });
  const side = mirror ? -1 : 1;
  const cameraFilters = [0, 1, 2].map(() => new OneEuroFilter(CAMERA_FILTER));
  const liftFilter = new OneEuroFilter(LIFT_FILTER);
  const footFilter = new OneEuroFilter(FOOT_FILTER);

  const root = [0, 0];
  let previous = null; // { t, feet, camera }: the last frame
  let origin = null; // the first camera fit, the floor's (0, 0)
  const legs = [];
  const history = []; // [{ t, x, y }] the path over the last TRAVEL_WINDOW_S
  const jump = { floor: null, last: null, rising: 0, air: false, since: 0 };

  // Each foot on the floor: its ankle's (x, y) against the pelvis and its lowest sole's height.
  function feetOf(qpos) {
    data.qpos.set(qpos);
    data.qpos[0] = data.qpos[1] = 0;
    mujoco.mj_kinematics(model, data);
    return ankles.map((body, f) => ({
      x: data.xpos[3 * body],
      y: data.xpos[3 * body + 1],
      h: Math.min(...soles[f].map((g) => data.geom_xpos[3 * g + 2] - model.geom_size[3 * g])),
    }));
  }

  // Robot leg over the person's, from the median of the last frames where a whole leg was seen.
  function scale(world, landmarks) {
    for (const [hip, knee, ankle] of [[23, 25, 27], [24, 26, 28]]) {
      if (Math.min(...[hip, knee, ankle].map((i) => landmarks[i].visibility ?? 0)) < 0.5) continue;
      const d = (a, b) => Math.hypot(world[a].x - world[b].x, world[a].y - world[b].y, world[a].z - world[b].z);
      legs.push(d(hip, knee) + d(knee, ankle));
      if (legs.length > LEG_SAMPLES) legs.shift();
    }
    if (legs.length < 10) return DEFAULT_SCALE;
    const sorted = [...legs].sort((a, b) => a - b);
    return legLength / sorted[sorted.length >> 1];
  }

  // How high (m, the person's) the lowest foot is above the floor, while it is a jump; 0 otherwise.
  function lift(world, landmarks, camera, t) {
    const seen = FEET.filter((i) => (landmarks[i].visibility ?? 0) >= 0.5);
    if (!camera || !seen.length) {
      jump.air = false;
      jump.last = null;
      jump.rising = 0;
      return 0;
    }
    // The lowest foot point, in camera axes (y down): the hips' place plus its offset from them.
    // Filtered before taking its speed: the fit's 2 cm of noise per frame is 0.8 m/s at 30 fps.
    const y = footFilter.filter(camera[1] + Math.max(...seen.map((i) => world[i].y)), t);
    jump.floor ??= y;
    if (y > jump.floor) jump.floor = y; // the foot is lower than the floor was: that is the floor
    const height = jump.floor - y;
    const dt = jump.last ? t - jump.last.t : 0;
    if (dt > 0) jump.rising += (1 - Math.exp(-dt / RISE_WINDOW_S)) * ((jump.last.y - y) / dt - jump.rising);
    const rising = jump.rising;
    jump.last = { t, y };
    if (!jump.air && height > JUMP_START_M && rising > JUMP_SPEED_M_S) [jump.air, jump.since] = [true, t];
    else if (jump.air && (height < JUMP_END_M || t - jump.since > MAX_AIR_S)) jump.air = false;
    if (!jump.air && dt > 0) jump.floor += (1 - Math.exp(-dt / FLOOR_FOLLOW_S)) * (y - jump.floor);
    return jump.air ? height : 0;
  }

  return {
    /**
     * @param qpos  the robot's pose from the retargeter (and its filter): pelvis at (0, 0), the
     *   lowest foot on the floor. Written in place: pelvis x, y and height.
     * @param pose  what view.mimic got: { world, landmarks, t, camera }
     */
    update(qpos, { world, landmarks, t, camera = null }) {
      const s = scale(world, landmarks);
      const gap = !previous || t - previous.t > MAX_GAP_S;
      let cam = null;
      if (camera) {
        origin ??= camera;
        const raw = [-(camera[2] - origin[2]), side * (camera[0] - origin[0])].map((v) => v * s);
        cam = raw.map((v, k) => cameraFilters[k].filter(v, t));
      }
      const up = s * liftFilter.filter(lift(world, landmarks, camera, t), t);
      const feet = feetOf(qpos);
      const weights = feet.map(({ h }) => Math.min(1, Math.max(0, (CONTACT_HIGH_M - (h + up)) / (CONTACT_HIGH_M - CONTACT_LOW_M))));
      const total = weights[0] + weights[1];
      const contact = Math.min(1, total);
      if (gap) {
        // A first frame, or back after losing the person: start where the camera says.
        if (cam && !previous) [root[0], root[1]] = cam;
      } else {
        const dt = t - previous.t;
        for (const k of [0, 1]) {
          const axis = k === 0 ? 'x' : 'y';
          const step = total > 0 ? feet.reduce((sum, f, i) => sum + (weights[i] / total) * (f[axis] - previous.feet[i][axis]), 0) : 0;
          const flight = cam && previous.cam ? cam[k] - previous.cam[k] : 0;
          root[k] += -contact * step + (1 - contact) * flight;
        }
        if (cam && dt > 0) {
          const dx = cam[0] - root[0];
          const dy = cam[1] - root[1];
          const distance = Math.hypot(dx, dy);
          const pull = Math.min(distance * (1 - Math.exp(-dt / CAMERA_PULL_S)), CAMERA_PULL_MAX_M_S * dt);
          if (distance > 0) {
            root[0] += (dx / distance) * pull;
            root[1] += (dy / distance) * pull;
          }
        }
      }
      previous = { t, feet, cam };
      history.push({ t, x: root[0], y: root[1] });
      while (history.length > 2 && history[0].t < t - TRAVEL_WINDOW_S) history.shift();
      qpos[0] = root[0];
      qpos[1] = root[1];
      qpos[2] += up;
      return qpos;
    },
    /** The direction (rad) the robot is walking in over the last second, or undefined when still. */
    travelYaw() {
      if (history.length < 2) return undefined;
      const a = history[0];
      const b = history[history.length - 1];
      const dt = b.t - a.t;
      if (dt < TRAVEL_WINDOW_S / 2 || Math.hypot(b.x - a.x, b.y - a.y) / dt < MIN_TRAVEL_SPEED) return undefined;
      return Math.atan2(b.y - a.y, b.x - a.x);
    },
    /** Whether the person is in the air right now (a jump). */
    airborne: () => jump.air,
    delete: () => data.delete(),
  };
}
