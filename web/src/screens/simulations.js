// Ver simulaciones: the gallery of preloaded clips and the stage with the person and the robot.
import physicsAssets from '../physics-assets.js';
import { mountGallery } from '../gallery.js';
import { mountStage } from '../stage.js';

export const title = 'Simulaciones';

let warmed = false;
/**
 * Downloads MuJoCo and the robot into the browser cache at low priority, so createSimView
 * finds them there. Called on intent (hovering the card), not on page load: a phone that only
 * opens the menu should not spend 30 MB.
 */
export function prefetch() {
  if (warmed) return;
  warmed = true;
  for (const url of physicsAssets) fetch(url, { priority: 'low' }).catch(() => {});
}

export function mount(root, { dots }) {
  root.innerHTML = `
    <section class="page sims">
      <header class="page-head">
        <a class="back" href="#/">← Volver al inicio</a>
        <h1>Simulaciones</h1>
      </header>
      <div class="sims-grid">
        <div class="sims-main">
          <div id="stage" data-show="both">
            <section class="pane" id="human-pane">
              <canvas id="human"></canvas>
              <p class="pane-label" id="human-label">Persona</p>
            </section>
            <section class="pane" id="robot-pane">
              <canvas id="view"></canvas>
              <div class="robot-loading">
                <div class="track"><div id="robot-progress"></div></div>
                <p id="robot-status">Preparando el mundo de física…</p>
              </div>
              <p class="pane-label">Robot · de pie, todavía aprendiendo</p>
            </section>
          </div>
          <div id="controls">
            <label>Ver
              <select id="show">
                <option value="both" selected>Los dos</option>
                <option value="human">Persona</option>
                <option value="robot">Robot</option>
              </select>
            </label>
            <button id="play" class="primary" type="button">Pausa</button>
            <label>Velocidad
              <select id="speed">
                <option value="0.25">Muy lenta</option>
                <option value="0.5">Lenta</option>
                <option value="1" selected>Normal</option>
              </select>
            </label>
            <button id="reset" type="button">Empezar de nuevo</button>
            <button id="push" type="button" disabled>Empujar al robot</button>
          </div>
        </div>
        <aside class="sims-list">
          <h2>Elige un movimiento</h2>
          <ul id="gallery"></ul>
        </aside>
      </div>
    </section>`;
  prefetch();
  const stage = mountStage(root, dots);
  mountGallery(root, stage);
  return () => stage.dispose();
}
