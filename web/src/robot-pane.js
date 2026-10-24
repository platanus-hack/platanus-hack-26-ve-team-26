// A pane showing the app's one G1 (robot-host.js), shared by the simulations and live screens.
// While the robot is still loading, a dot robot waves in its place with a progress bar; "Empujar"
// floats over the pane so it is always on screen without scrolling (the pitch's key moment).
import { waiting } from './dots/poses.js';
import { attachRobot, onRobotProgress, robotView } from './robot-host.js';

/** Markup for a robot pane; mountRobotPane fills it in. */
export function robotPaneHTML(label) {
  return `
    <section class="pane robot-pane">
      <div class="robot-loading">
        <div class="track"><div class="robot-progress"></div></div>
        <p class="robot-status">Preparando el mundo de física…</p>
      </div>
      <p class="pane-label">${label}</p>
      <button class="push" type="button" disabled>Empujar al robot</button>
    </section>`;
}

/**
 * @param pane  the .robot-pane element
 * @param dots  the page's DotStage, for the placeholder robot
 * @param options.beforePush  called before the shove (the live screen turns the camera off)
 * @returns {{ ready: Promise<object | null>, view: object | null, dispose(): void }}
 */
export function mountRobotPane(pane, dots, { beforePush } = {}) {
  const $ = (selector) => pane.querySelector(selector);
  const robot = attachRobot(pane);
  let placeholder = null;
  const handle = { view: null, ready: robot.ready, dispose };

  const stopProgress = onRobotProgress(({ done, total, compiling }) => {
    $('.robot-progress').style.width = `${(100 * done) / total}%`;
    if (compiling) $('.robot-status').textContent = 'Armando al robot…';
  });
  // Already loaded (any visit after the first): no placeholder and no fade, the robot is there.
  if (robotView()) pane.classList.add('ready', 'instant');
  else placeholder = dots.addView(pane, waiting);

  robot.ready
    .then((view) => {
      if (!view) return;
      handle.view = view;
      if (placeholder) dots.removeView(placeholder);
      placeholder = null;
      pane.classList.add('ready');
      $('.push').disabled = false;
      $('.push').onclick = () => {
        beforePush?.();
        view.push();
      };
    })
    .catch((error) => {
      $('.robot-status').textContent = 'No se pudo cargar el robot. Recarga la página para intentar de nuevo.';
      console.error(error);
    });

  function dispose() {
    stopProgress();
    robot.detach();
    if (placeholder) dots.removeView(placeholder);
    placeholder = null;
  }
  return handle;
}
