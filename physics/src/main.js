// Development page of physics/: the G1 standing in MuJoCo, simulated in the browser.
import { createSimView } from './index.js';

const $ = (id) => document.getElementById(id);

function showProgress({ done, total, bytes }) {
  $('progress-bar').style.width = `${(100 * done) / total}%`;
  $('progress-text').textContent = `Cargando MuJoCo y el robot: ${done} de ${total} archivos · ${(bytes / 1e6).toFixed(1)} MB`;
}

async function start() {
  let view;
  try {
    view = await createSimView($('view'), {
      onProgress: showProgress,
      onStats: ({ realtime, pelvisHeight }) => {
        const { model } = view.sim;
        $('stats').textContent =
          `${model.nu} motores · ${Math.round(1 / model.opt.timestep)} pasos/s de física · ` +
          `tiempo real x${realtime.toFixed(2)} · pelvis a ${pelvisHeight.toFixed(2)} m`;
      },
    });
  } catch (error) {
    $('progress-text').textContent = `No se pudo cargar: ${error.message}`;
    $('loading').classList.add('error');
    throw error;
  }
  $('loading').hidden = true;
  $('push').disabled = false;
  $('reset').disabled = false;
  $('push').onclick = () => view.push();
  $('reset').onclick = () => view.reset();
}

start();
