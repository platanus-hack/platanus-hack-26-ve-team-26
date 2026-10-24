// The one G1 of the app. Loading it costs 30 MB of downloads plus compiling MuJoCo, the model
// and the shaders, so it happens once, when the page opens (main.js starts it; the robot panes
// show its progress). Screens borrow its canvas: attach() moves it into their pane, and leaving the
// screen takes it out, where physics/ pauses it. A WebGL context survives being moved.
import { createSimView } from 'tridi-physics';
import { FINAL_LEVEL, policyUrls } from './policies.js';
import { SCENE_THEME } from './skeleton.js';

const canvas = document.createElement('canvas');
canvas.className = 'robot-canvas';

let ready = null;
let view = null;
let progress = { done: 0, total: 1, compiling: false };
const listeners = new Set();
const notify = () => listeners.forEach((listener) => listener(progress));

/** Starts loading the robot (once) and returns the promise of its view. */
export function loadRobot() {
  ready ??= createSimView(canvas, {
    theme: SCENE_THEME,
    onProgress: ({ done, total }) => {
      // After the last file, MuJoCo still compiles the model: say so instead of a stuck 100 %.
      progress = { done, total, compiling: done === total };
      notify();
    },
  })
    .then(async (loaded) => {
      // The trained policy comes with the robot, so "Empujar" shows it recovering anywhere. It
      // swaps in the policy's own model of the G1 and onnxruntime-web (14 MB), hence here, once.
      progress = { ...progress, compiling: true, policy: true };
      notify();
      try {
        const { onnx, json } = policyUrls(FINAL_LEVEL);
        await loaded.loadPolicy(onnx, json);
      } catch (error) {
        console.error(error); // the robot still stands with its stiff motors
      }
      return loaded;
    })
    .then((loaded) => (view = loaded));
  return ready;
}

/** Calls `listener` with { done, total, compiling, policy } now and as loading moves on; returns unsubscribe. */
export function onRobotProgress(listener) {
  listeners.add(listener);
  listener(progress);
  return () => listeners.delete(listener);
}

/**
 * Puts the robot's canvas into `pane` (before its other children) and, once loaded, hands the
 * view over standing and playing at normal speed, whatever the previous screen left.
 * @returns {{ ready: Promise<object>, detach(): void }}
 */
export function attachRobot(pane) {
  pane.prepend(canvas);
  let attached = true;
  const handed = loadRobot().then((loaded) => {
    if (!attached) return null;
    loaded.stop(); // ends a clip or a camera copy and stands the robot up
    loaded.setSpeed(1);
    loaded.play();
    return loaded;
  });
  return {
    ready: handed,
    detach() {
      attached = false;
      if (canvas.parentNode === pane) canvas.remove();
    },
  };
}

/** The robot's view if it has loaded, else null. */
export const robotView = () => view;
