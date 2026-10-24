// Turns what MediaPipe reports each camera frame into the clean pose the retargeter reads:
// 33 points in the robot's world axes, smoothed, plus which of them the camera really sees.
// Carried over from Sombra (src/pose.js there); the axes are the only change.
import * as THREE from 'three';
import { OneEuroFilter } from './filters.js';

// A point appears above 0.6 visibility and disappears below 0.4; the gap stops a point sitting on
// the edge from flickering.
const SHOW_ABOVE = 0.6;
const HIDE_BELOW = 0.4;
// One Euro settings for positions in meters, measured in Sombra with 1 cm of synthetic noise at
// 30 fps: still, 0.39 cm of jitter; in a 45 cm punch at 3 m/s it ends 2.9 cm behind. Real
// cameras may need a retune.
const FILTER = { minCutoff: 0.8, beta: 6 };

/**
 * @param options.smooth  One Euro on every point (default). The live camera passes false: data/live
 *   already filters the points before onPose, and filtering them twice added a camera frame of lag
 *   to every move, the arms' most (docs/investigacion/2026-10-24-manos-y-dedos-en-vivo.md).
 */
export function createPoseTracker({ smooth = true } = {}) {
  const points = Array.from({ length: 33 }, () => new THREE.Vector3());
  const visible = new Array(33).fill(false);
  const filters = Array.from({ length: 33 * 3 }, () => new OneEuroFilter(FILTER));

  /**
   * @param world      33 MediaPipe world landmarks {x, y, z}: meters, centered on the hips, x to
   *                   the right of the image, y down, z away from the camera
   * @param landmarks  the 33 image landmarks, only for their visibility (the world ones may lack it)
   * @param t          seconds, any origin
   * @returns points in robot world axes (x forward, y to the robot's left, z up), and visible[33].
   *          The arrays are reused every call.
   */
  function update(world, landmarks, t) {
    for (let i = 0; i < 33; i++) {
      const vis = (landmarks?.[i] ?? world[i]).visibility ?? 0;
      // MediaPipe always returns all 33 points and guesses the ones out of frame or covered;
      // only the ones the camera sees count.
      const wasVisible = visible[i];
      visible[i] = wasVisible ? vis >= HIDE_BELOW : vis >= SHOW_ABOVE;
      if (!visible[i]) continue;
      // A point that comes back restarts its filter, so it does not drag from where it was lost.
      if (!wasVisible) for (let k = 0; k < 3; k++) filters[i * 3 + k].reset();
      // A person facing the camera has the camera in front: robot x = -MediaPipe z. Their left
      // is the image right: robot y = MediaPipe x. Up: robot z = -MediaPipe y.
      const l = world[i];
      if (!smooth) points[i].set(-l.z, l.x, -l.y);
      else {
        points[i].set(
          filters[i * 3].filter(-l.z, t),
          filters[i * 3 + 1].filter(l.x, t),
          filters[i * 3 + 2].filter(-l.y, t),
        );
      }
    }
    return { points, visible };
  }

  return { update };
}
