// The one G1 of the app. Loading it costs 30 MB of downloads plus compiling MuJoCo, the model
// and the shaders, so it happens once, when the page opens (the splash in main.js covers the
// start of it). Screens borrow its canvas: attach() moves it into their pane, and leaving the
// screen takes it out, where physics/ pauses it. A WebGL context survives being moved.
import { createSimView } from 'tridi-physics';
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
  }).then((loaded) => (view = loaded));
  return ready;
}

/** Calls `listener` with { done, total, compiling } now and as files arrive; returns unsubscribe. */
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
