// Ver simulaciones: the gallery of preloaded clips and the stage with the person and the robot.
import { mountGallery } from '../gallery.js';
import { SCENES, WORLDS } from 'tridi-physics';
import { FINAL_LEVEL, IMITATIONS, LEVELS } from '../policies.js';
import { robotPaneHTML } from '../robot-pane.js';
import { ICONS, mountStage } from '../stage.js';
import { mountTrainBox, trainBoxHTML } from '../training.js';

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

export function mount(root, { api }, [clipId] = []) {
  root.innerHTML = `
    <section class="page sims">
      <header class="page-head">
        <a class="back" href="#/" aria-label="Volver al inicio">←<span class="only-wide">&nbsp;Volver al inicio</span></a>
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
              <div class="player">
                <button id="play" class="icon-btn primary" type="button" aria-label="Pausa" title="Pausa">${ICONS.pause}</button>
                <button id="reset" class="icon-btn" type="button" aria-label="Empezar de nuevo" title="Empezar de nuevo">${ICONS.restart}</button>
                <button id="speed" class="icon-btn speed" type="button" aria-label="Cambiar la velocidad" title="Velocidad: 1×, 0,5× o 0,25×">1×</button>
                <select id="show" aria-label="Qué ver">
                  <option value="both" selected>Persona y robot</option>
                  <option value="human">Solo la persona</option>
                  <option value="robot">Solo el robot</option>
                </select>
              </div>
              <div class="mode" role="group" aria-label="Cómo se mueve el robot">
                <button type="button" data-physics="on" aria-pressed="true">Con física</button>
                <button type="button" data-physics="off" aria-pressed="false">Sin física</button>
              </div>
              <p class="mode-note">Con física el robot se mueve solo, con sus motores. Sin física repite el video como un títere: muestra el movimiento, no lo que puede hacer.</p>
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
              <details class="tune">
              <summary>Ajustar la física</summary>
              <div class="sliders">
                ${CONDITIONS.map(({ key, label, min, max, step }) => `
                <label class="slider">
                  <span class="slider-head"><span>${label}</span><output data-condition="${key}"></output></span>
                  <input type="range" data-condition="${key}" min="${min}" max="${max}" step="${step}" disabled />
                </label>`).join('')}
              </div>
              <p class="conditions-note">Los deslizadores cambian la física al momento, sobre el mundo elegido. Elegir otro mundo los vuelve a sus valores.</p>
              </details>
            </section>
          </div>
        </div>
        <aside class="sims-list">
          ${trainBoxHTML()}
          <h2>Elige un movimiento</h2>
          <ul id="gallery"></ul>
        </aside>
      </div>
    </section>`;
  // The physics sliders are open on wide screens; on phones they fold under "Ajustar la física"
  // (style.css hides the toggle on wide screens), so the scene and the clips come first.
  root.querySelector('.tune').open = !matchMedia('(max-width: 720px)').matches;
  const stage = mountStage(root);
  const trainBox = mountTrainBox(root.querySelector('.train-box'), api);
  mountGallery(root, stage, clipId, trainBox.show);
  return () => {
    trainBox.dispose();
    stage.dispose();
  };
}

