// The simulation stage: the human skeleton of the selected clip next to the G1 from physics/,
// with one set of controls for both. The skeleton shows at once; the robot pane shows a dot
// robot until the real one has loaded (robot-pane.js).
import { mountRobotPane } from './robot-pane.js';
import { SkeletonView } from './skeleton.js';

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
  const robot = mountRobotPane(root.querySelector('.robot-pane'), dots);
  let playing = true;
  let speed = 1;

  let last = performance.now();
  let frameId = requestAnimationFrame(function frame(now) {
    const wall = Math.min(MAX_FRAME_S, Math.max(0, (now - last) / 1000));
    last = now;
    if (playing) skeleton.advance(wall * speed);
    skeleton.render();
    frameId = requestAnimationFrame(frame);
  });

  robot.ready.then((view) => {
    view?.setSpeed(speed);
    if (view && !playing) view.pause();
  });

  $('show').onchange = (event) => ($('stage').dataset.show = event.target.value);
  $('play').onclick = () => {
    playing = !playing;
    if (robot.view) playing ? robot.view.play() : robot.view.pause();
    $('play').textContent = playing ? 'Pausa' : 'Seguir';
  };
  $('speed').onchange = (event) => {
    speed = Number(event.target.value);
    robot.view?.setSpeed(speed);
  };
  $('reset').onclick = () => {
    skeleton.time = 0;
    robot.view?.reset();
  };

  return {
    /** @param {import('./contract.js').PoseClip} clip  @param {string} title */
    showClip(clip, title) {
      skeleton.setClip(clip);
      $('human-label').textContent = `Persona · ${title}`;
    },
    dispose() {
      cancelAnimationFrame(frameId);
      skeleton.dispose();
      robot.dispose();
    },
  };
}
