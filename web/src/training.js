// Training your own clip (WEB-2 in docs/plan-producto.md): a camera clip goes to the server first
// (POST /clips), then any clip joins the training queue and is followed until its delivery is
// ready. Kept outside the screens, so leaving En vivo does not stop following it; like the clips
// themselves (preloaded.js), it lasts until the page reloads. The box below (trainBoxHTML and
// mountTrainBox) is the step after recording: train the robot with the clip, then its delivery.
import { sendClip, trainClip, UploadError, watchTraining } from '../../data/live/src/upload.js';
import { mountNetView } from './netview.js';

// Below this share of frames with the body in view the server refuses to train
// (MIN_VALID_RATIO in data/server.py, from docs/contrato.md): the robot would imitate the gaps.
export const MIN_VALID_RATIO = 0.8;

/**
 * @typedef {{
 *   phase: 'sending' | 'queuing' | 'watching' | 'done' | 'failed',
 *   clipId: string | null,   // the server's id: the delivery lives at #/entrega/<clipId>
 *   train: object | null,    // the last GET /train/{id}
 *   error: string | null,
 * }} Run
 */

/** @type {Map<string, Run>} keyed by the gallery item's clip id */
const runs = new Map();
const listeners = new Map();

function update(key, patch) {
  const run = { ...runs.get(key), ...patch };
  runs.set(key, run);
  listeners.get(key)?.forEach((listener) => listener(run));
}

/** The training of a gallery item, if one was started on this visit. */
export const runFor = (item) => runs.get(item.clip) ?? null;

/** Calls `listener` with every change of this item's training; returns the unsubscribe function. */
export function subscribe(item, listener) {
  if (!listeners.has(item.clip)) listeners.set(item.clip, new Set());
  listeners.get(item.clip).add(listener);
  return () => listeners.get(item.clip).delete(listener);
}

/** Why this clip cannot be trained, or null. */
export function cannotTrain(item, api) {
  if (!api.ok) return 'Para entrenar hace falta el servidor de videos, y ahora no está encendido.';
  const ratio = item.data?.quality?.valid_ratio ?? 0;
  if (ratio < MIN_VALID_RATIO) {
    return `El cuerpo se ve en el ${Math.round(100 * ratio)} % de los cuadros y para entrenar hace falta el ${100 * MIN_VALID_RATIO} %: graba con los hombros, los brazos y las manos en cuadro.`;
  }
  return null;
}

/** Starts (or, after a failure, retries) training a user clip. */
export async function startTraining(item, api) {
  const active = runFor(item);
  if (active && active.phase !== 'failed') return;
  const camera = item.data.source === 'camera';
  // A camera clip already sent keeps its server id, so a retry does not send it twice.
  let clipId = active?.clipId ?? (camera ? null : item.data.id);
  // The tunnel's URL changes every time data/serve.sh restarts, and a page opened before that
  // still holds the old one: a network failure looks for the server again (api.recheck, through
  // the gist) and, if it answers, tries once more there.
  for (let attempt = 0; ; attempt++) {
    try {
      if (!clipId) {
        update(item.clip, { phase: 'sending', clipId: null, train: null, error: null });
        clipId = await sendClip(api.url, item.data);
      }
      update(item.clip, { phase: 'queuing', clipId, train: null, error: null });
      const trainId = await trainClip(api.url, clipId);
      update(item.clip, { phase: 'watching' });
      const train = await watchTraining(api.url, trainId, { onUpdate: (t) => update(item.clip, { train: t }) });
      update(item.clip, train.state === 'done' ? { phase: 'done' } : { phase: 'failed', error: train.error ?? 'El entrenamiento falló.' });
      return;
    } catch (error) {
      const lost = !(error instanceof UploadError);
      if (lost && attempt === 0) {
        const before = api.url;
        if ((await api.recheck()) && api.url !== before) {
          if (camera) clipId = null; // the new server may not have it: send it again
          continue;
        }
      }
      if (lost) console.error(error);
      update(item.clip, {
        phase: 'failed',
        clipId,
        error: lost ? 'Se perdió la conexión con el servidor de videos.' : error.message,
      });
      return;
    }
  }
}

// The steps of a training as the panel lists them, in the order of GET /train's `stage`. The box
// says it takes "unos 30 minutos": 20 M steps on the server's Mac (docs/contrato.md, training queue).
const TRAIN_STEPS = [
  ['queued', 'En la cola'],
  ['retarget', 'Pasar tu movimiento al robot'],
  ['training', 'Practicar con física'],
  ['data', 'Probar en 4 mundos y armar la entrega'],
];

/** The training box's markup; mountTrainBox brings it to life. */
export const trainBoxHTML = () => `
<section class="train-box" hidden aria-live="polite">
  <h2>Entrenar al robot con este movimiento</h2>
  <div data-train="idle">
    <p class="train-text">Aquí el robot solo repite tu movimiento. Al entrenarlo, aprende a hacerlo con física, y te llevas la política y los datos. Tarda unos 30 minutos en el servidor.</p>
    <button class="primary train-start" type="button">Entrenar al robot</button>
    <p class="train-why"></p>
    <a class="button train-example" href="#/entrega">Ver los datos entrenados →</a>
  </div>
  <div data-train="progress" hidden>
    <ol class="stages compact">${TRAIN_STEPS.map(([id, text]) => `<li data-step="${id}">${text}</li>`).join('')}</ol>
    <div class="track"><div class="bar train-bar"></div></div>
    <p class="train-line"></p>
    <div class="train-net" hidden></div>
    <p class="train-note">Puedes seguir moviéndote o grabar otro mientras tanto: el entrenamiento sigue mientras esta página esté abierta.</p>
  </div>
  <div data-train="done" hidden>
    <p class="train-text train-result"></p>
    <a class="button primary train-delivery" href="#/entrega">Ver la entrega</a>
  </div>
  <div data-train="failed" hidden>
    <p class="train-error error"></p>
    <button class="train-retry" type="button">Reintentar</button>
  </div>
</section>`;

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

/**
 * The "Entrenar" box (markup from trainBoxHTML), for a clip made on this visit: show({ clip, data })
 * with the clip's id and its PoseClip, show(null) to hide it.
 */
export function mountTrainBox(box, api) {
  const $ = (selector) => box.querySelector(selector);
  let item = null;
  let unsubscribe = null;
  let netView = null; // the network in 3D (netview.js), made the first time a training runs here; false without WebGL

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
      if (t?.train_id && t.state === 'running' && netView !== false) {
        try {
          netView ??= mountNetView($('.train-net'));
        } catch (error) {
          console.error(error); // no WebGL: the box keeps its steps and bar, as before
          netView = false;
        }
        // Asked from retarget on: the first picture shows up as soon as practice starts. During
        // `data` the last picture stays, the network no longer changes.
        if (netView) netView.follow(api.url, t.train_id, t.stage !== 'data');
      } else if (netView) {
        netView.follow(api.url, null, false);
      }
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
  return {
    show,
    dispose: () => {
      unsubscribe?.();
      if (netView) netView.dispose();
    },
  };
}
