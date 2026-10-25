// #/red/<train id>: one training, alone and full size: its policy network (netview.js), how far it
// is and a button to cancel it. The training box links here in a new tab, and the link survives
// reloads and server restarts: a training lives on the server, while the box only exists in the
// tab that started it.
import { cancelTraining } from '../../../data/live/src/upload.js';
import { mountNetView } from '../netview.js';
import { progressLine } from '../training.js';

export const title = 'La red entrenándose';

// Same cadence as the training box (TRAIN_POLL_MS in data/live/src/upload.js).
const POLL_MS = 2000;

export function mount(app, { api }, [trainId]) {
  app.innerHTML = `
    <main class="net-screen">
      <a class="button" href="#/">← Volver al inicio</a>
      <section class="train-box"><div data-train="progress"><div class="train-net"></div></div></section>
      <div class="net-screen-bar">
        <p class="net-screen-note">Buscando el entrenamiento…</p>
        <a class="button net-screen-delivery" hidden>Ver la entrega</a>
        <button class="net-screen-cancel" type="button" hidden>Cancelar el entrenamiento</button>
      </div>
    </main>`;
  const $ = (s) => app.querySelector(s);
  const note = $('.net-screen-note');
  if (!trainId) {
    note.textContent = 'Falta el entrenamiento: abre esta página desde la caja de Entrenar.';
    return () => {};
  }
  let view = null;
  try {
    view = mountNetView($('.train-net'));
  } catch (error) {
    console.error(error);
    $('.train-net').hidden = true; // no WebGL: the status and the cancel button still work
  }
  let gone = false;
  let timer = null;

  async function poll() {
    timer = null;
    if (gone) return;
    let t = null;
    try {
      const res = await fetch(`${api.url.replace(/\/$/, '')}/train/${trainId}`, { cache: 'no-store' });
      if (res.status === 404) {
        note.textContent = 'Este entrenamiento ya no existe: se canceló, o el servidor no lo conoce.';
        $('.net-screen-cancel').hidden = true;
        view?.follow(api.url, trainId, false);
        return; // nothing left to follow
      }
      if (res.ok) t = await res.json();
    } catch {
      // The tunnel can drop for a moment: keep the last line and ask again.
    }
    if (gone) return;
    if (t) {
      const active = t.state === 'queued' || t.state === 'running';
      note.textContent =
        t.state === 'done'
          ? `Terminó: el robot sigue ${t.followed_s ?? 0} s de los ${t.duration_s} s del clip.`
          : t.state === 'failed'
            ? `Falló: ${t.error}`
            : progressLine({ phase: 'watching', train: t });
      $('.net-screen-cancel').hidden = !active;
      $('.net-screen-delivery').hidden = t.state !== 'done' || Boolean(t.error);
      $('.net-screen-delivery').href = `#/entrega/${encodeURIComponent(t.clip_id)}`;
      view?.follow(api.url, trainId, active && t.stage !== 'data');
      if (!active) return;
    }
    timer = setTimeout(poll, POLL_MS);
  }

  $('.net-screen-cancel').onclick = async () => {
    if (!confirm('¿Cancelar este entrenamiento? Se detiene en el servidor y se pierde lo que lleva.')) return;
    $('.net-screen-cancel').disabled = true;
    try {
      await cancelTraining(api.url, trainId);
    } catch (error) {
      note.textContent = `No se pudo cancelar: ${error.message}`;
      $('.net-screen-cancel').disabled = false;
      return;
    }
    clearTimeout(timer);
    poll();
  };

  api.checked.then(() => {
    if (gone) return;
    if (!api.ok) note.textContent = 'El servidor de videos no está encendido.';
    else poll();
  });
  return () => {
    gone = true;
    clearTimeout(timer);
    view?.dispose();
  };
}
