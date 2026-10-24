// Public API of physics/ for the web app: give it a canvas and it loads MuJoCo and the G1,
// simulates in real time and draws every frame until dispose().
import { loadG1 } from './load.js';
import { createPoseTracker } from './pose.js';
import { createRetargeter } from './retarget.js';
import { RobotView } from './viewer.js';

// The real-time ratio passed to onStats is averaged over this window so it reads steadily.
const STATS_WINDOW_S = 1;

/**
 * @param canvas  a <canvas> sized by CSS; the view follows its size
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
  let frameId = 0;
  let last = performance.now();
  let stats = { wall: 0, sim: 0 };

  function frame(now) {
    const wall = Math.max(0, (now - last) / 1000); // the first frame's timestamp can predate `last`
    last = now;
    if (playing) {
      const before = sim.data.time;
      sim.advance(wall * speed);
      stats.sim += sim.data.time - before;
    }
    stats.wall += wall;
    view.render();
    if (stats.wall >= STATS_WINDOW_S) {
      onStats?.({ realtime: stats.sim / stats.wall, pelvisHeight: sim.bodyPosition('pelvis')[2], puppet: sim.puppeted });
      stats = { wall: 0, sim: 0 };
    }
    frameId = requestAnimationFrame(frame);
  }
  frameId = requestAnimationFrame(frame);

  // Built on first use: only the camera needs them.
  let tracker = null;
  let retargeter = null;

  return {
    sim,
    play: () => (playing = true),
    pause: () => (playing = false),
    setSpeed: (value) => (speed = value),
    // Back to the physical robot, standing. The next mimic() starts from the stand pose.
    reset() {
      sim.reset();
      retargeter?.delete();
      tracker = retargeter = null;
    },
    push: () => sim.push(),
    /**
     * Makes the G1 copy a person, one camera frame at a time. Pass what createLiveCapture's
     * onPose gives. A null pose or one too occluded keeps the last pose. reset() ends it.
     * @returns { tracked, residual } residual is the worst distance (m) between a limb and where
     *   the person put it; above ~0.08 the G1 cannot do that move.
     */
    mimic(pose) {
      if (!pose?.visible) return { tracked: false, residual: 0 };
      tracker ??= createPoseTracker();
      retargeter ??= createRetargeter(sim.mujoco, sim.model, { mirror });
      const { qpos, tracked, residual } = retargeter.solve(tracker.update(pose.world, pose.landmarks, pose.t));
      if (tracked) sim.puppet(qpos);
      return { tracked, residual };
    },
    dispose() {
      cancelAnimationFrame(frameId);
      view.dispose();
      retargeter?.delete();
      sim.delete();
    },
  };
}
