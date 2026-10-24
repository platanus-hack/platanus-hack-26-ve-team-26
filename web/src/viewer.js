// The simulation stage: the G1 from physics/ in the canvas, with its loading bar and controls.
import { createSimView } from 'tridi-physics';

const $ = (id) => document.getElementById(id);

function showProgress({ done, total, bytes }) {
  $('progress-bar').style.width = `${(100 * done) / total}%`;
  $('progress-text').textContent = `Cargando MuJoCo y el robot: ${done} de ${total} archivos · ${(bytes / 1e6).toFixed(1)} MB`;
}

function showStats({ realtime, pelvisHeight }) {
  $('stats').textContent = `tiempo real x${realtime.toFixed(2)} · pelvis a ${pelvisHeight.toFixed(2)} m`;
}

export async function mountViewer() {
  let view;
  try {
    view = await createSimView($('view'), { onProgress: showProgress, onStats: showStats });
  } catch (error) {
    $('progress-text').textContent = 'No se pudo cargar la simulación. Recarga la página para intentar de nuevo.';
    $('loading').classList.add('error');
    throw error;
  }
  $('loading').hidden = true;

  let playing = true;
  $('play').onclick = () => {
    playing = !playing;
    playing ? view.play() : view.pause();
    $('play').textContent = playing ? 'Pausa' : 'Reanudar';
  };
  $('speed').onchange = (event) => view.setSpeed(Number(event.target.value));
  $('reset').onclick = () => view.reset();
  $('push').onclick = () => view.push();
  for (const id of ['play', 'speed', 'reset', 'push']) $(id).disabled = false;

  return view;
}
