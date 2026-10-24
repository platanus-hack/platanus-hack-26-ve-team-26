// Development page of physics/: the G1 standing in MuJoCo, simulated in the browser, and copying
// you when the camera is on.
import { createSimView } from './index.js';

// The RobotMotion of Juan's walking clip (npm run retarget), played on the robot.
const WALK_URL = new URL('../motions/clip_2026-10-23_caminar-perfil_01.json', import.meta.url).href;

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
      onStats: ({ realtime, pelvisHeight, puppet }) => {
        const { model } = view.sim;
        $('stats').textContent = puppet
          ? `${model.nu} motores · reproduciendo un movimiento, sin dinámica · pelvis a ${pelvisHeight.toFixed(2)} m`
          : `${model.nu} motores · ${Math.round(1 / model.opt.timestep)} pasos/s de física · tiempo real x${realtime.toFixed(2)} · pelvis a ${pelvisHeight.toFixed(2)} m`;
      },
    });
  } catch (error) {
    $('progress-text').textContent = `No se pudo cargar: ${error.message}`;
    $('loading').classList.add('error');
    throw error;
  }
  $('loading').hidden = true;
  // In development the console can drive the robot (view.mimic with a made-up pose) without a camera.
  if (import.meta.env.DEV) window.tridi = view;
  for (const id of ['camera', 'clip', 'push', 'reset']) $(id).disabled = false;
  $('push').onclick = () => {
    stopCamera();
    view.push();
  };
  $('reset').onclick = () => {
    stopCamera();
    view.reset();
  };
  $('camera').onclick = () => (live ? stopCamera() : startCamera());
  $('clip').onclick = async () => {
    stopCamera();
    view.playClip(await (await fetch(WALK_URL)).json());
  };

  let live = null;
  let cameraStats = { frames: 0, since: performance.now(), residual: 0 };

  function stopCamera() {
    if (!live) return;
    live.stop();
    live = null;
    view.reset();
    $('camera-box').hidden = true;
    $('camera-stats').textContent = '';
    $('camera').textContent = 'Cámara';
    $('camera').classList.remove('on');
  }

  async function startCamera() {
    const button = $('camera');
    button.disabled = true;
    const say = (text) => ($('camera-stats').textContent = text);
    say('Cargando el modelo de pose…');
    try {
      // MediaPipe is only downloaded when the camera is asked for.
      const { createLiveCapture, drawSkeleton, CameraError } = await import('tridi-live');
      const overlay = $('camera-overlay');
      const ctx = overlay.getContext('2d');
      try {
        live = await createLiveCapture($('camera-video'), {
          onProgress: ({ stage, done }) => say(stage === 'model' ? (done ? 'Modelo listo, abriendo la cámara…' : 'Cargando el modelo de pose…') : 'Esperando permiso de la cámara…'),
          onPose: (pose) => {
            const video = $('camera-video');
            if (overlay.width !== video.videoWidth) [overlay.width, overlay.height] = [video.videoWidth, video.videoHeight];
            ctx.clearRect(0, 0, overlay.width, overlay.height);
            if (pose) drawSkeleton(ctx, pose.landmarks, pose.visible);
            const { tracked, residual } = view.mimic(pose);
            cameraStats.frames++;
            if (tracked) cameraStats.residual = residual;
            const elapsed = (performance.now() - cameraStats.since) / 1000;
            if (elapsed >= 1) {
              const body = !pose ? 'no te veo' : !pose.visible ? 'tápate menos' : `error de alcance ${(cameraStats.residual * 100).toFixed(1)} cm`;
              say(`cámara ${Math.round(cameraStats.frames / elapsed)} fps · ${body}`);
              cameraStats = { frames: 0, since: performance.now(), residual: cameraStats.residual };
            }
          },
        });
      } catch (error) {
        if (error instanceof CameraError) return say(error.message);
        throw error;
      }
      $('camera-box').hidden = false;
      button.textContent = 'Apagar cámara';
      button.classList.add('on');
    } catch (error) {
      say(`No se pudo iniciar la cámara: ${error.message}`);
      console.error(error);
    } finally {
      button.disabled = false;
    }
  }
}

start();
