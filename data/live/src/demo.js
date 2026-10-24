// Demo page for data/live: the same calls the web app makes, plus a video file as a stand-in camera.
import { CameraError, createLiveCapture, drawSkeleton } from './index.js';

const $ = (id) => document.getElementById(id);
const video = $('video');
const overlay = $('overlay');
const ctx = overlay.getContext('2d');
let live = null;

function status(text) {
  $('status').textContent = text;
  $('status').hidden = !text;
}

async function start(stream) {
  live?.stop();
  live = null;
  $('record').disabled = true;
  $('result').hidden = true;
  $('stage').classList.toggle('mirror', !stream);
  try {
    live = await createLiveCapture(video, {
      stream,
      onProgress: ({ stage, done }) =>
        status(done ? '' : stage === 'model' ? 'Cargando el modelo de pose…' : 'Abriendo la cámara…'),
      onPose: (pose) => {
        if (overlay.width !== video.videoWidth) {
          overlay.width = video.videoWidth;
          overlay.height = video.videoHeight;
        }
        drawSkeleton(ctx, pose?.landmarks, pose?.visible);
        const fps = live?.fps() ?? 0;
        $('fps').textContent = `${fps} fps${fps < 20 ? ' · lento: el avance puede salir mal' : ''}`;
      },
    });
    $('record').disabled = false;
  } catch (e) {
    status(e instanceof CameraError ? e.message : `No se pudo iniciar: ${e.message}`);
  }
}

$('camera').onclick = () => start();

$('file').onchange = async () => {
  const file = $('file').files[0];
  if (!file) return;
  const source = $('source');
  source.src = URL.createObjectURL(file);
  source.loop = true;
  await source.play();
  await start(source.captureStream());
};

$('record').onclick = () => {
  if (!live.isRecording()) {
    live.startRecording();
    $('record').textContent = 'Parar';
    $('record').classList.add('recording');
    $('result').hidden = true;
    return;
  }
  $('record').textContent = 'Grabar';
  $('record').classList.remove('recording');
  try {
    const clip = live.stopRecording();
    const last = clip.frames.at(-1);
    const hips = [0, 2].map((a) => (last.joints[23][a] + last.joints[24][a]) / 2);
    const speed = last.t > 0 ? Math.hypot(...hips) / last.t : 0;
    $('summary').textContent =
      `${clip.frames.length} cuadros, ${last.t.toFixed(1)} s, ` +
      `${Math.round(clip.quality.valid_ratio * 100)}% válidos, avance ${speed.toFixed(2)} m/s`;
    const url = URL.createObjectURL(new Blob([JSON.stringify(clip)], { type: 'application/json' }));
    $('download').href = url;
    $('download').download = `${clip.id}.json`;
    $('result').hidden = false;
    window.lastClip = clip; // handy from the console
  } catch (e) {
    status(`No se vio a nadie lo suficiente: ${e.message}`);
  }
};
