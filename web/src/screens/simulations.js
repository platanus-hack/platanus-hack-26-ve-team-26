// Ver simulaciones: the gallery of preloaded clips and the stage with the person and the robot.
import { mountGallery } from '../gallery.js';
import { SCENES, WORLDS } from 'tridi-physics';
import { FINAL_LEVEL, IMITATIONS, LEVELS } from '../policies.js';
import { robotPaneHTML } from '../robot-pane.js';
import { mountStage } from '../stage.js';

export const title = 'Simulaciones';

// The conditions you can set by hand (view.setConditions in physics/). Ranges cover every world in
// physics/worlds and a bit beyond: grip from wet tile (0.2) to rough concrete (1.2); wind up to
// 20 m/s, a gale of about 60 N on the torso; mass and motors ±20 % (below 0.7 the motors cannot
// hold the robot up even still).
export const CONDITIONS = [
  { key: 'friction', label: 'Agarre del piso', min: 0.2, max: 1.2, step: 0.05 },
  { key: 'wind_mps', label: 'Viento', min: 0, max: 20, step: 1 },
  { key: 'mass_scale', label: 'Peso del robot', min: 0.8, max: 1.2, step: 0.05 },
  { key: 'motor_scale', label: 'Fuerza de los motores', min: 0.7, max: 1.2, step: 0.05 },
];

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
          <div id="controls" class="controls">
            <section class="control-group" aria-labelledby="ctl-play">
              <h3 id="ctl-play">Reproducción</h3>
              <div class="control-row">
                <button id="play" class="primary" type="button">Pausa</button>
                <button id="reset" type="button">Empezar de nuevo</button>
              </div>
              <div class="fields">
                <label class="field">Velocidad
                  <select id="speed">
                    <option value="0.25">Muy lenta</option>
                    <option value="0.5">Lenta</option>
                    <option value="1" selected>Normal</option>
                  </select>
                </label>
                <label class="field">Ver
                  <select id="show">
                    <option value="both" selected>Los dos</option>
                    <option value="human">Persona</option>
                    <option value="robot">Robot</option>
                  </select>
                </label>
              </div>
            </section>
            <section class="control-group" aria-labelledby="ctl-world">
              <h3 id="ctl-world">Condiciones</h3>
              <div class="fields">
                <label class="field">Mundo
                  <select id="world">
                    ${WORLDS.map(({ id, title }) => `<option value="${id}"${id === 'plano' ? ' selected' : ''}>${title}</option>`).join('')}
                  </select>
                </label>
                <label class="field">Lugar
                  <select id="place">
                    <option value="" selected>Sin muebles</option>
                    ${SCENES.map(({ id, title }) => `<option value="${id}">${title}</option>`).join('')}
                  </select>
                </label>
                <label class="field wide">Robot entrenado con
                  <select id="policy">
                    ${LEVELS.map(({ id, label }) => `<option value="${id}"${id === FINAL_LEVEL ? ' selected' : ''}>${label}</option>`).join('')}
                    ${IMITATIONS.length ? `<optgroup label="Imita este video">${IMITATIONS.map(({ id, label }) => `<option value="${id}" disabled>${label}</option>`).join('')}</optgroup>` : ''}
                  </select>
                </label>
              </div>
              <div class="sliders">
                ${CONDITIONS.map(({ key, label, min, max, step }) => `
                <label class="slider">
                  <span class="slider-head"><span>${label}</span><output data-condition="${key}"></output></span>
                  <input type="range" data-condition="${key}" min="${min}" max="${max}" step="${step}" disabled />
                </label>`).join('')}
              </div>
              <p class="conditions-note">Los deslizadores cambian la física al momento, sobre el mundo elegido. Elegir otro mundo los vuelve a sus valores.</p>
            </section>
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
