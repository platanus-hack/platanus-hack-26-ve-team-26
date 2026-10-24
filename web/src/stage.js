// The simulation stage: the human skeleton of the selected clip next to the G1 from physics/,
// with one set of controls for both. The skeleton shows at once; the robot (30 MB) loads behind it.
import { createSimView } from 'tridi-physics';
import { SkeletonView } from './skeleton.js';

const $ = (id) => document.getElementById(id);
// A hidden tab or a shader compile can stall a frame; past this the skeleton skips ahead
// instead of jumping, as physics/ does for the robot.
const MAX_FRAME_S = 1 / 30;

function showProgress({ done, total, bytes }) {
  $('progress-bar').style.width = `${(100 * done) / total}%`;
  $('progress-text').textContent = `Cargando MuJoCo y el robot: ${done} de ${total} archivos · ${(bytes / 1e6).toFixed(1)} MB`;
}

function showStats({ realtime, pelvisHeight }) {
  $('stats').textContent = `robot: tiempo real x${realtime.toFixed(2)} · pelvis a ${pelvisHeight.toFixed(2)} m`;
}

export function mountStage() {
  const skeleton = new SkeletonView($('human'));
  let robot = null;
  let playing = true;
  let speed = 1;

  let last = performance.now();
  function frame(now) {
    const wall = Math.min(MAX_FRAME_S, Math.max(0, (now - last) / 1000));
    last = now;
    if (playing) skeleton.advance(wall * speed);
    skeleton.render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  $('show').onchange = (event) => ($('stage').dataset.show = event.target.value);
  $('play').onclick = () => {
    playing = !playing;
    if (robot) playing ? robot.play() : robot.pause();
    $('play').textContent = playing ? 'Pausa' : 'Reanudar';
  };
  $('speed').onchange = (event) => {
    speed = Number(event.target.value);
    robot?.setSpeed(speed);
  };
  $('reset').onclick = () => {
    skeleton.time = 0;
    robot?.reset();
  };
  $('push').onclick = () => robot?.push();

  createSimView($('view'), { onProgress: showProgress, onStats: showStats })
    .then((view) => {
      robot = view;
      robot.setSpeed(speed);
      if (!playing) robot.pause();
      $('loading').hidden = true;
      $('push').disabled = false;
    })
    .catch((error) => {
      $('progress-text').textContent = 'No se pudo cargar el robot. Recarga la página para intentar de nuevo.';
      $('loading').classList.add('error');
      console.error(error);
    });

  return {
    /** @param {import('./contract.js').PoseClip} clip  @param {string} title */
    showClip(clip, title) {
      skeleton.setClip(clip);
      $('human-label').textContent = `Humano · ${title}`;
    },
  };
}
