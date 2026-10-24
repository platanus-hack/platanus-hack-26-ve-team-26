// Ver simulaciones: the gallery of preloaded clips and the stage with the person and the robot.
import { mountGallery } from '../gallery.js';
import { WORLDS } from 'tridi-physics';
import { FINAL_LEVEL, LEVELS } from '../policies.js';
import { robotPaneHTML } from '../robot-pane.js';
import { mountStage } from '../stage.js';

export const title = 'Simulaciones';

export function mount(root, { dots }, [clipId] = []) {
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
            ${robotPaneHTML('Robot')}
          </div>
          <div id="controls">
            <label>Ver
              <select id="show">
                <option value="both" selected>Los dos</option>
                <option value="human">Persona</option>
                <option value="robot">Robot</option>
              </select>
            </label>
            <label>Mundo
              <select id="world">
                ${WORLDS.map(({ id, title }) => `<option value="${id}"${id === 'plano' ? ' selected' : ''}>${title}</option>`).join('')}
              </select>
            </label>
            <label>Robot entrenado con
              <select id="policy">
                ${LEVELS.map(({ id, label }) => `<option value="${id}"${id === FINAL_LEVEL ? ' selected' : ''}>${label}</option>`).join('')}
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
          </div>
        </div>
        <aside class="sims-list">
          <h2>Elige un movimiento</h2>
          <ul id="gallery"></ul>
        </aside>
      </div>
    </section>`;
  const stage = mountStage(root, dots);
  mountGallery(root, stage, clipId);
  return () => stage.dispose();
}
