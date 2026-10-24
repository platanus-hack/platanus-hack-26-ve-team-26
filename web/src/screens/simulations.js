// Ver simulaciones: the gallery of preloaded clips and the stage with the person and the robot.
import { mountGallery } from '../gallery.js';
import { SCENES, WORLDS } from 'tridi-physics';
import { FINAL_LEVEL, IMITATIONS, LEVELS } from '../policies.js';
import { robotPaneHTML } from '../robot-pane.js';
import { ICONS, mountStage } from '../stage.js';
import { cannotTrain, runFor, startTraining, subscribe } from '../training.js';

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

// The steps of a training as the panel lists them, in the order of GET /train's `stage`. The box
// says it takes "unos 30 minutos": 20 M steps on the server's Mac (docs/contrato.md, training queue).
const TRAIN_STEPS = [
  ['queued', 'En la cola'],
  ['retarget', 'Pasar tu movimiento al robot'],
  ['training', 'Practicar con física'],
  ['data', 'Probar en 4 mundos y armar la entrega'],
];

export function mount(root, { dots, api }, [clipId] = []) {
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
          <section class="train-box" hidden aria-live="polite">
            <h2>Entrenar al robot con este video</h2>
            <div data-train="idle">
              <p class="train-text">Aquí el robot solo repite tu movimiento. Al entrenarlo, aprende a hacerlo con física, y te llevas la política y los datos. Tarda unos 30 minutos en el servidor.</p>
              <button class="primary train-start" type="button">Entrenar al robot</button>
              <p class="train-why"></p>
            </div>
            <div data-train="progress" hidden>
              <ol class="stages compact">${TRAIN_STEPS.map(([id, text]) => `<li data-step="${id}">${text}</li>`).join('')}</ol>
              <div class="track"><div class="bar train-bar"></div></div>
              <p class="train-line"></p>
              <p class="train-note">Puedes ver otras simulaciones mientras tanto: el entrenamiento sigue mientras esta página esté abierta.</p>
            </div>
            <div data-train="done" hidden>
              <p class="train-text train-result"></p>
              <a class="button primary train-delivery" href="#/entrega">Ver la entrega</a>
            </div>
            <div data-train="failed" hidden>
              <p class="train-error error"></p>
              <button class="train-retry" type="button">Reintentar</button>
            </div>
          </section>
          <h2>Elige un movimiento</h2>
          <ul id="gallery"></ul>
        </aside>
      </div>
    </section>`;
  // The physics sliders are open on wide screens; on phones they fold under "Ajustar la física"
  // (style.css hides the toggle on wide screens), so the scene and the clips come first.
  root.querySelector('.tune').open = !matchMedia('(max-width: 720px)').matches;
  const stage = mountStage(root, dots);
  const trainBox = mountTrainBox(root, api);
  mountGallery(root, stage, clipId, trainBox.show);
  return () => {
    trainBox.dispose();
    stage.dispose();
  };
}

const num = (x, digits = 1) => x.toLocaleString('es', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const stepCount = (steps) => (steps < 1e6 ? `${Math.round(steps / 1e3)} k` : `${num(steps / 1e6)} M`);
const minutes = (s) => (s < 60 ? 'menos de un minuto' : `unos ${Math.ceil(s / 60)} min`);

/** What a training says while it runs: its place in the queue, its steps and how much it follows. */
function progressLine(run) {
  const t = run.train;
  if (run.phase === 'sending') return 'Mandando tu clip al servidor…';
  if (!t) return 'Entrando a la cola…';
  if (t.state === 'queued') {
    const ahead = t.position > 0 ? `Hay ${t.position} ${t.position === 1 ? 'entrenamiento' : 'entrenamientos'} antes que el tuyo. ` : 'Es el siguiente. ';
    return `${ahead}Termina en ${minutes(t.eta_s)}.`;
  }
  const parts = [];
  if (t.stage === 'training') parts.push(`Paso ${stepCount(t.steps)} de ${stepCount(t.total_steps)}`);
  if (t.followed_s != null) parts.push(`sigue ${num(t.followed_s, 2)} s de ${num(t.duration_s, 2)} s del clip`);
  parts.push(`termina en ${minutes(t.eta_s)}`);
  return parts.join(' · ').replace(/^./, (c) => c.toUpperCase());
}

/** The "Entrenar" box: only for your own clips (camera or uploaded), never the preloaded ones. */
function mountTrainBox(root, api) {
  const box = root.querySelector('.train-box');
  const $ = (selector) => box.querySelector(selector);
  let item = null;
  let unsubscribe = null;

  function render(run) {
    const phase = run ? (run.phase === 'done' || run.phase === 'failed' ? run.phase : 'progress') : 'idle';
    box.querySelectorAll('[data-train]').forEach((el) => (el.hidden = el.dataset.train !== phase));
    if (phase === 'idle') {
      const why = cannotTrain(item, api);
      $('.train-start').disabled = Boolean(why);
      $('.train-why').textContent = why ?? '';
      $('.train-why').hidden = !why;
    } else if (phase === 'progress') {
      const t = run.train;
      const step = !t || t.state === 'queued' ? 0 : TRAIN_STEPS.findIndex(([id]) => id === t.stage);
      box.querySelectorAll('.stages li').forEach((li, i) => {
        li.classList.toggle('done', i < step);
        li.classList.toggle('current', i === step);
      });
      const fraction = !t || t.state === 'queued' ? 0 : t.stage === 'data' ? 1 : t.steps / Math.max(t.total_steps, 1);
      $('.train-bar').style.width = `${Math.round(100 * fraction)}%`;
      $('.train-line').textContent = progressLine(run);
    } else if (phase === 'done') {
      const t = run.train;
      // "done" with an error: the policy and the dataset are there, but the delivery was not built.
      $('.train-result').textContent = t.error
        ? `Entrenado, pero la entrega no se armó: ${t.error}`
        : `Listo: el robot sigue ${num(t.followed_s ?? 0, 2)} s de los ${num(t.duration_s, 2)} s de tu clip. En la entrega están la política, los datos y la prueba en 4 mundos.`;
      $('.train-delivery').hidden = Boolean(t.error);
      $('.train-delivery').href = `#/entrega/${encodeURIComponent(run.clipId)}`;
    } else {
      $('.train-error').textContent = run.error;
    }
  }

  function show(selected) {
    unsubscribe?.();
    unsubscribe = null;
    item = selected;
    box.hidden = !item?.data; // only clips made on this visit carry their PoseClip in memory
    if (box.hidden) return;
    unsubscribe = subscribe(item, render);
    render(runFor(item));
    // Until /health answers, the button waits as if there were no server.
    api.checked.then(() => item === selected && render(runFor(item)));
  }

  $('.train-start').onclick = () => startTraining(item, api);
  $('.train-retry').onclick = () => startTraining(item, api);
  return { show, dispose: () => unsubscribe?.() };
}
