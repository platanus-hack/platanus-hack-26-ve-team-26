// The G1 from physics/ inside a pane, shared by the simulations and live screens. While its
// 30 MB load, a dot robot waves in its place with a progress bar; "Empujar" floats over the pane
// so it is always on screen without scrolling (the pitch's key moment).
import { createSimView } from 'tridi-physics';
import { waiting } from './dots/poses.js';
import { SCENE_THEME } from './skeleton.js';

/** Markup for a robot pane; mountRobotPane fills it in. */
export function robotPaneHTML(label) {
  return `
    <section class="pane robot-pane">
      <canvas class="robot-canvas"></canvas>
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
 * @param options  extra createSimView options (e.g. mirror)
 * @returns {{ ready: Promise<object | null>, view: object | null, dispose(): void }}
 */
export function mountRobotPane(pane, dots, options = {}) {
  const $ = (selector) => pane.querySelector(selector);
  let placeholder = dots.addView(pane, waiting);
  let disposed = false;
  const handle = { view: null, ready: null, dispose };

  handle.ready = createSimView($('.robot-canvas'), {
    ...options,
    theme: SCENE_THEME,
    onProgress: ({ done, total }) => ($('.robot-progress').style.width = `${(100 * done) / total}%`),
  })
    .then((view) => {
      if (disposed) {
        view.dispose(); // the user left while it loaded
        return null;
      }
      handle.view = view;
      dots.removeView(placeholder);
      placeholder = null;
      pane.classList.add('ready');
      $('.push').disabled = false;
      $('.push').onclick = () => {
        options.beforePush?.();
        view.push();
      };
      return view;
    })
    .catch((error) => {
      if (!disposed) $('.robot-status').textContent = 'No se pudo cargar el robot. Recarga la página para intentar de nuevo.';
      console.error(error);
      return null;
    });

  function dispose() {
    disposed = true;
    handle.view?.dispose();
    if (placeholder) dots.removeView(placeholder);
  }
  return handle;
}
