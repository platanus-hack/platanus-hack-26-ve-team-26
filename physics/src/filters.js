// One Euro filter (Casiez, Roussel and Vogel, CHI 2012), the standard for smoothing motion
// capture: while the signal is still it cuts almost all the jitter, and as it moves faster the
// cutoff rises so the output does not lag. Carried over from Sombra (src/filters.js there).
//   minCutoff: cutoff in Hz at rest. Lower = less jitter when still, more lag.
//   beta: how much the cutoff rises per unit/s of speed. Higher = less lag when moving fast.
export class OneEuroFilter {
  constructor({ minCutoff, beta, dCutoff = 1 }) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.reset();
  }

  reset() {
    this.x = null;
    this.dx = 0;
    this.t = null;
  }

  filter(value, t) {
    if (this.x === null || t <= this.t) {
      this.x = value;
      this.t = t;
      return value;
    }
    const dt = t - this.t;
    this.t = t;
    const dx = (value - this.x) / dt;
    this.dx += alpha(this.dCutoff, dt) * (dx - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += alpha(cutoff, dt) * (value - this.x);
    return this.x;
  }
}

// The live camera's robot pose, filtered once more after the retargeting: the points are already
// smoothed (pose.js), but grounding the lowest foot every frame and solving each limb on its own
// still shake the result. Measured on data/clips' walk fed frame by frame like the camera: pelvis
// height acceleration 22 -> 5.4 m/s^2 (p95), knee 166 -> 66 rad/s^2, heading speed 2.66 -> 1.83
// rad/s, for one camera frame (33 ms) of lag. 1.0/0.3 was smoother (4.2, 55) but twice the lag.
const ROBOT_POSE_FILTER = { minCutoff: 1.5, beta: 0.5 };

/**
 * One Euro on a live G1 pose (a qpos row): pelvis height, heading and the 29 joints. The pelvis
 * position on the floor is left alone (live, it stays at the origin) and its rotation must be a
 * heading only, which is what retarget.js gives.
 */
export function createRobotPoseFilter(nq) {
  const filters = Array.from({ length: nq }, () => new OneEuroFilter(ROBOT_POSE_FILTER));
  const out = new Float64Array(nq);
  let heading = null; // unwrapped, so a turn through 180 degrees does not jump by a full turn
  let lastRaw = 0;
  return {
    /** @param qpos the retargeted pose  @param t seconds  @returns the filtered pose (reused array) */
    filter(qpos, t) {
      out.set(qpos);
      out[2] = filters[2].filter(qpos[2], t);
      for (let j = 7; j < nq; j++) out[j] = filters[j].filter(qpos[j], t);
      const raw = 2 * Math.atan2(qpos[6], qpos[3]);
      heading = heading === null ? raw : heading + Math.atan2(Math.sin(raw - lastRaw), Math.cos(raw - lastRaw));
      lastRaw = raw;
      const yaw = filters[3].filter(heading, t);
      [out[3], out[4], out[5], out[6]] = [Math.cos(yaw / 2), 0, 0, Math.sin(yaw / 2)];
      return out;
    },
  };
}

function alpha(cutoff, dt) {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}
