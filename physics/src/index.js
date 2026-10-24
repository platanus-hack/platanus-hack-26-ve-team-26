// Public API of physics/ for the web app: give it a canvas and it loads MuJoCo and the G1,
// simulates in real time and draws every frame until dispose().
import { loadG1 } from './load.js';
import { RobotView } from './viewer.js';

// The real-time ratio passed to onStats is averaged over this window so it reads steadily.
const STATS_WINDOW_S = 1;

/**
 * @param canvas  a <canvas> sized by CSS; the view follows its size
 * @param options.onProgress  ({ done, total, bytes }) while MuJoCo and the robot download
 * @param options.onStats     ({ realtime, pelvisHeight }) once per second while playing
 */
export async function createSimView(canvas, { onProgress, onStats } = {}) {
  const sim = await loadG1(onProgress);
  const view = new RobotView(sim, canvas);
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
      onStats?.({ realtime: stats.sim / stats.wall, pelvisHeight: sim.bodyPosition('pelvis')[2] });
      stats = { wall: 0, sim: 0 };
    }
    frameId = requestAnimationFrame(frame);
  }
  frameId = requestAnimationFrame(frame);

  return {
    sim,
    play: () => (playing = true),
    pause: () => (playing = false),
    setSpeed: (value) => (speed = value),
    reset: () => sim.reset(),
    push: () => sim.push(),
    dispose() {
      cancelAnimationFrame(frameId);
      view.dispose();
      sim.delete();
    },
  };
}
