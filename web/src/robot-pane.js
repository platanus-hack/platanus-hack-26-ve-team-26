// A pane showing the app's one G1 (robot-host.js), shared by the simulations and live screens.
// While the robot is still loading, the brand's loader (loader.js) turns in its place with a
// progress bar; "Empujar" floats over the pane so it is always on screen without scrolling (the
// pitch's key moment), and draws the push's arrow in the scene, as the landing does.
import { loader } from './loader.js';
import { createPushArrow } from './push-arrow.js';
import { attachRobot, onRobotProgress, robotView } from './robot-host.js';

/** Markup for a robot pane; mountRobotPane fills it in. */
export function robotPaneHTML(label) {
  return `
    <section class="pane robot-pane">
      <div class="robot-loading">
        ${loader()}
        <div class="track"><div class="robot-progress"></div></div>
        <p class="robot-status">Preparando el mundo de física…</p>
      </div>
      <p class="pane-label">${label}</p>
      <button class="push" type="button" disabled>Empujar al robot</button>
    </section>`;
}

/**
 * @param pane  the .robot-pane element
 * @param options.beforePush  called before the shove (the live screen turns the camera off)
 * @returns {{ ready: Promise<object | null>, view: object | null, dispose(): void }}
 */
export function mountRobotPane(pane, { beforePush } = {}) {
  const $ = (selector) => pane.querySelector(selector);
  const robot = attachRobot(pane);
  let arrow = null;
  let frameId = 0;
  const handle = { view: null, ready: robot.ready, dispose };

  const stopProgress = onRobotProgress(({ done, total, compiling, policy }) => {
    $('.robot-progress').style.width = `${(100 * done) / total}%`;
    if (policy) $('.robot-status').textContent = 'Enseñándole a mantenerse de pie…';
    else if (compiling) $('.robot-status').textContent = 'Armando al robot…';
  });
  // Already loaded (any visit after the first): no loader and no fade, the robot is there.
  if (robotView()) pane.classList.add('ready', 'instant');

  robot.ready
    .then((view) => {
      if (!view) return;
      handle.view = view;
      pane.classList.add('ready');
      arrow = createPushArrow(view.viewer.scene);
      frameId = requestAnimationFrame(function frame() {
        arrow.update();
        frameId = requestAnimationFrame(frame);
      });
      $('.push').disabled = false;
      $('.push').onclick = () => {
        beforePush?.();
        view.push();
        arrow.point(view);
      };
    })
    .catch((error) => {
      $('.robot-status').textContent = 'No se pudo cargar el robot. Recarga la página para intentar de nuevo.';
      console.error(error);
    });

  function dispose() {
    stopProgress();
    robot.detach();
    cancelAnimationFrame(frameId);
    arrow?.dispose(); // the scene is the one robot's, shared with the other screens
    arrow = null;
  }
  return handle;
}
