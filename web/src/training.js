// Training your own clip (WEB-2 in docs/plan-producto.md): a camera clip goes to the server first
// (POST /clips), then any clip joins the training queue and is followed until its delivery is
// ready. Kept outside the screens, so leaving Simulaciones does not stop following it; like the
// clips themselves (preloaded.js), it lasts until the page reloads.
import { sendClip, trainClip, UploadError, watchTraining } from '../../data/live/src/upload.js';

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
  if (!api.ok) return 'Para entrenar hace falta el servidor de videos: abre la página con el enlace que imprime data/serve.sh (…?api=<url>).';
  const ratio = item.data?.quality?.valid_ratio ?? 0;
  if (ratio < MIN_VALID_RATIO) {
    return `El cuerpo se ve en el ${Math.round(100 * ratio)} % de los cuadros y para entrenar hace falta el ${100 * MIN_VALID_RATIO} %: graba con el cuerpo entero en cuadro.`;
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
  } catch (error) {
    if (!(error instanceof UploadError)) console.error(error);
    update(item.clip, {
      phase: 'failed',
      clipId,
      error: error instanceof UploadError ? error.message : 'Se perdió la conexión con el servidor de videos.',
    });
  }
}
