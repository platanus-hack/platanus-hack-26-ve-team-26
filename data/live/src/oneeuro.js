// Causal smoothing of the 33 MediaPipe points for the live camera: a One Euro filter per point.
//
// MediaPipe estimates every frame on its own, so each point shakes a few centimeters from frame to
// frame, and the robot copying the person (mimic) shakes with it. Offline, data/smooth.py fits a
// polynomial over past and future frames (Savitzky-Golay); live there are no future frames, so the
// filter can only look back. Any causal filter trades shake for lag. One Euro (Casiez et al., CHI
// 2012) makes that trade per point and per frame: it is a low-pass whose cutoff rises with the
// point's speed. A body standing still or moving slowly gets a low cutoff and holds steady; a limb
// that moves fast (a swinging foot, an arm in a jumping jack) gets a high cutoff and follows with
// little lag, so the step keeps its length.

// Tuned on the cached MediaPipe detections of the three preloaded clips, against the offline
// Savitzky-Golay result (numbers in data/README.md). With these, the walk's p95 acceleration of
// knees and ankles drops from 132 to 43 m/s² (offline: 41) with about one frame (33 ms) of lag.
// - MIN_CUTOFF_HZ: cutoff for a point at rest. 1 Hz holds still better but lags 67 ms on the walk.
// - BETA: how much the cutoff rises per m/s of the point's speed. Higher follows a sprint better but
//   lets more shake through (the run's p95 acceleration rises from 129 to 171 m/s² with beta 3).
// - D_CUTOFF_HZ: the cutoff of the speed estimate itself, the authors' default.
export const MIN_CUTOFF_HZ = 1.5;
export const BETA = 1.0;
export const D_CUTOFF_HZ = 1.0;

const alpha = (cutoff, dt) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));

/**
 * One Euro filter for a set of 3D points that move together (a skeleton). The cutoff of each point
 * comes from the speed of its `world` position (m/s), so the same cutoff smooths its image position
 * too: the two describe the same joint and must not drift apart.
 */
export class PoseFilter {
  constructor({ minCutoff = MIN_CUTOFF_HZ, beta = BETA, dCutoff = D_CUTOFF_HZ } = {}) {
    Object.assign(this, { minCutoff, beta, dCutoff });
    this.reset();
  }

  /** Forget the past: the next frame passes through unfiltered (after the body was lost). */
  reset() {
    this.t = null;
    this.world = null;
    this.image = null;
    this.speed = null;
  }

  /**
   * @param t      seconds, increasing
   * @param world  [n][3] in meters
   * @param image  [n][k] (optional) any per-point values filtered with the same cutoff, e.g. pixels
   * @returns { world, image } filtered (new arrays)
   */
  filter(t, world, image = null) {
    const dt = this.t === null ? 0 : t - this.t;
    if (!(dt > 0)) {
      // First frame, or a repeated timestamp: nothing to filter against.
      if (this.t === null) {
        this.t = t;
        this.world = world.map((p) => [...p]);
        this.image = image?.map((p) => [...p]) ?? null;
        this.speed = world.map(() => [0, 0, 0]);
      }
      return { world: this.world.map((p) => [...p]), image: this.image?.map((p) => [...p]) ?? null };
    }
    const ad = alpha(this.dCutoff, dt);
    const nextWorld = [];
    const nextImage = image ? [] : null;
    for (let i = 0; i < world.length; i++) {
      const prev = this.world[i];
      const v = this.speed[i].map((s, a) => s + ad * ((world[i][a] - prev[a]) / dt - s));
      this.speed[i] = v;
      const a = alpha(this.minCutoff + this.beta * Math.hypot(...v), dt);
      nextWorld.push(prev.map((x, k) => x + a * (world[i][k] - x)));
      if (image) {
        const prevImg = this.image?.[i] ?? image[i];
        nextImage.push(prevImg.map((x, k) => x + a * (image[i][k] - x)));
      }
    }
    this.t = t;
    this.world = nextWorld;
    this.image = nextImage;
    return { world: nextWorld.map((p) => [...p]), image: nextImage?.map((p) => [...p]) ?? null };
  }
}
