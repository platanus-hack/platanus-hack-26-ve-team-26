// The simulation stage: the human skeleton of the selected clip next to the G1 from physics/,
// with one set of controls for both. The skeleton shows at once; while the robot (30 MB)
// loads, a dot robot waves in its place, so the pane is never empty.
import { createSimView } from 'tridi-physics';
import { waiting } from './dots/poses.js';
import { SCENE_THEME, SkeletonView } from './skeleton.js';

// A hidden tab or a shader compile can stall a frame; past this the skeleton skips ahead
// instead of jumping, as physics/ does for the robot.
const MAX_FRAME_S = 1 / 30;

/**
 * @param root  element holding the stage markup of screens/simulations.js
 * @param dots  the page's DotStage, for the placeholder robot
 */
export function mountStage(root, dots) {
  const $ = (id) => root.querySelector(`#${id}`);
  const skeleton = new SkeletonView($('human'));
  let robot = null;
  let placeholder = dots.addView($('robot-pane'), waiting);
  let playing = true;
  let speed = 1;
  let disposed = false;

  let last = performance.now();
  let frameId = requestAnimationFrame(function frame(now) {
    const wall = Math.min(MAX_FRAME_S, Math.max(0, (now - last) / 1000));
    last = now;
    if (playing) skeleton.advance(wall * speed);
    skeleton.render();
    frameId = requestAnimationFrame(frame);
  });

  $('show').onchange = (event) => ($('stage').dataset.show = event.target.value);
  $('play').onclick = () => {
    playing = !playing;
    if (robot) playing ? robot.play() : robot.pause();
    $('play').textContent = playing ? 'Pausa' : 'Seguir';
  };
  $('speed').onchange = (event) => {
    speed = Number(event.target.value);
    robot?.setSpeed(speed);
  };
  $('reset').onclick = () => {
    skeleton.time = 0;
    robot?.reset();
  };
  $('push').onclick = () => robot?.push();

  createSimView($('view'), {
    theme: SCENE_THEME,
    onProgress: ({ done, total }) => {
      $('robot-progress').style.width = `${(100 * done) / total}%`;
    },
  })
    .then((view) => {
      if (disposed) return view.dispose(); // the user left while it loaded
      robot = view;
      robot.setSpeed(speed);
      if (!playing) robot.pause();
      dots.removeView(placeholder);
      placeholder = null;
      $('robot-pane').classList.add('ready');
      $('push').disabled = false;
    })
    .catch((error) => {
      if (disposed) return;
      $('robot-status').textContent = 'No se pudo cargar el robot. Recarga la página para intentar de nuevo.';
      console.error(error);
    });

  return {
    /** @param {import('./contract.js').PoseClip} clip  @param {string} title */
    showClip(clip, title) {
      skeleton.setClip(clip);
      $('human-label').textContent = `Persona · ${title}`;
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frameId);
      skeleton.dispose();
      robot?.dispose();
      if (placeholder) dots.removeView(placeholder);
    },
  };
}
