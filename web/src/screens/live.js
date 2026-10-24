// Entrena a Tridi en vivo (W4, WEB-1 in docs/plan-producto.md): the camera on one side with the
// person's skeleton drawn over it, and the G1 copying them on the other (view.mimic from physics/,
// createLiveCapture from data/live). Turning the camera on also starts recording; stopping saves a
// PoseClip to the gallery, where the robot repeats it; Simulaciones sends it to the server
// (POST /clips) when you train it (training.js).
import { addUserClip } from '../preloaded.js';
import { mountRobotPane, robotPaneHTML } from '../robot-pane.js';

export const title = 'En vivo';

// Phones run MediaPipe's "lite" model: half the work, as data/live recommends.
const SMALL_SCREEN = matchMedia('(max-width: 720px), (pointer: coarse)').matches;
// Under this many processed frames per second the robot moves in jumps; data/live's demo uses
// the same line.
const MIN_FPS = 20;
// The first second after the camera opens is always slow (shaders, autofocus): wait this long
// before warning about speed.
const WARMUP_MS = 2500;
// Longest recording: the same 30 s the video server accepts per video (docs/contrato.md), so a
// camera clip and an uploaded one can be trained the same way.
const MAX_RECORD_S = 30;
// Shorter than this is not a movement worth keeping (a tap on the button by mistake).
const MIN_RECORD_S = 2;

const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export function mount(root, { dots }) {
  root.innerHTML = `
    <section class="page live">
      <header class="page-head">
        <a class="back" href="#/">← Volver al inicio</a>
        <h1>Entrena a Tridi en vivo</h1>
      </header>
      <div class="live-grid">
        <section class="pane camera-pane">
          <video playsinline muted></video>
          <canvas class="camera-overlay"></canvas>
          <div class="camera-off">
            <ol class="steps">
              <li>Deja que la página use tu cámara.</li>
              <li>Aléjate hasta que se vea todo tu cuerpo.</li>
              <li>Muévete despacio: Tridi copia lo que haces.</li>
            </ol>
          </div>
          <p class="pane-label">Tú</p>
        </section>
        ${robotPaneHTML('Robot · te copia')}
      </div>
      <div class="live-bar">
        <div class="row">
          <button class="primary camera-toggle" type="button">Encender la cámara</button>
          <button class="record-toggle" type="button" hidden>Parar y guardar</button>
        </div>
        <p class="recording" hidden><span class="rec-dot"></span><span class="rec-time">0:00</span> / ${clock(MAX_RECORD_S)} · de perfil el robot avanza; de frente se queda en el lugar</p>
        <div class="saved" hidden>
          <p class="saved-text"></p>
          <div class="row">
            <a class="button primary see-clip" href="#/simulaciones">Verlo en simulaciones</a>
            <button class="again" type="button">Grabar otro</button>
          </div>
        </div>
        <p class="live-status" aria-live="polite"></p>
        <p class="live-warning" hidden></p>
      </div>
    </section>`;

  const $ = (selector) => root.querySelector(selector);
  const video = $('video');
  const overlay = $('.camera-overlay');
  const ctx = overlay.getContext('2d');
  const button = $('.camera-toggle');
  const say = (text, isError = false) => {
    $('.live-status').textContent = text;
    $('.live-status').classList.toggle('error', isError);
  };

  let live = null;
  let startedAt = 0;
  let lastReport = 0;
  let disposed = false;
  // Pushing needs the physics back: the camera stops first, as on the physics/ page.
  const robot = mountRobotPane($('.robot-pane'), dots, { beforePush: () => stop() });

  // Recording: starts with the camera, stops by hand, at 30 s, or when the camera goes off.
  let recordTimer = 0;
  let recordStart = 0;

  function startRecording() {
    live.startRecording();
    recordStart = performance.now();
    $('.saved').hidden = true;
    $('.recording').hidden = false;
    $('.record-toggle').hidden = false;
    clearInterval(recordTimer);
    recordTimer = setInterval(() => {
      const seconds = (performance.now() - recordStart) / 1000;
      $('.rec-time').textContent = clock(Math.min(seconds, MAX_RECORD_S));
      if (seconds >= MAX_RECORD_S) saveRecording();
    }, 250);
  }

  function saveRecording() {
    if (!live?.isRecording()) return;
    clearInterval(recordTimer);
    $('.recording').hidden = true;
    $('.record-toggle').hidden = true;
    const seconds = (performance.now() - recordStart) / 1000;
    // The result gets its own block: the live status line rewrites itself every second.
    const result = (text, clip = null) => {
      $('.saved-text').textContent = text;
      $('.saved-text').classList.toggle('error', !clip);
      $('.see-clip').hidden = !clip;
      if (clip) $('.see-clip').href = `#/simulaciones/${encodeURIComponent(clip.id)}`;
      $('.saved').hidden = false;
    };
    let clip;
    try {
      clip = live.stopRecording();
    } catch {
      return result('No se vio a nadie lo suficiente. Que se vea todo tu cuerpo y graba otra vez.');
    }
    if (seconds < MIN_RECORD_S) return result('La grabación fue muy corta. Graba al menos 2 segundos.');
    const time = new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
    addUserClip(clip, `Tu cámara · ${time}`);
    result(`Movimiento guardado: ${Math.round(seconds)} s, se te vio el ${Math.round(100 * clip.quality.valid_ratio)} % del tiempo.`, clip);
  }

  function stop() {
    if (!live) return;
    say('');
    saveRecording(); // turning the camera off keeps what was recorded
    live.stop();
    live = null;
    robot.view?.reset();
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    root.querySelector('.live').classList.remove('camera-on');
    button.textContent = 'Encender la cámara';
    $('.live-warning').hidden = true;
  }

  function onPose(pose) {
    if (overlay.width !== video.videoWidth) [overlay.width, overlay.height] = [video.videoWidth, video.videoHeight];
    drawSkeleton(ctx, pose?.landmarks, pose?.visible);
    robot.view?.mimic(pose);

    const now = performance.now();
    if (now - lastReport < 1000) return; // words change once a second, not every frame
    lastReport = now;
    if (!robot.view) say('El robot todavía está cargando; ya te va a copiar.');
    else if (!pose) say('No te veo. Aléjate hasta que se vea todo tu cuerpo.');
    else if (!pose.visible) say('Te veo a medias. Que se vea todo tu cuerpo, de la cabeza a los pies.');
    else say('¡Te veo! Muévete despacio y Tridi te copia.');
    const fps = live?.fps() ?? 0;
    const slow = now - startedAt > WARMUP_MS && fps < MIN_FPS;
    $('.live-warning').hidden = !slow;
    $('.live-warning').textContent = `Tu equipo va algo lento (${fps} ${fps === 1 ? 'cuadro' : 'cuadros'} por segundo): el robot puede moverse a saltos. Cierra otras pestañas o acércate a la luz.`;
  }

  let drawSkeleton;
  let capture = null;
  async function start() {
    button.disabled = true;
    say('Preparando la cámara…');
    try {
      // MediaPipe (several MB) is only downloaded when the camera is asked for.
      capture ??= await import('tridi-live');
      drawSkeleton = capture.drawSkeleton;
      const session = await capture.createLiveCapture(video, {
        model: SMALL_SCREEN ? 'lite' : 'full',
        onProgress: ({ stage, done }) =>
          say(stage === 'model' ? (done ? 'Listo. Ahora acepta el permiso de la cámara.' : 'Preparando la cámara…') : 'Esperando el permiso de la cámara…'),
        onPose,
      });
      if (disposed) return session.stop(); // the user left while it started
      live = session;
      startedAt = performance.now();
      root.querySelector('.live').classList.add('camera-on');
      button.textContent = 'Apagar la cámara';
      startRecording();
    } catch (error) {
      // CameraError messages are already in plain Spanish (permission denied, no camera).
      const isCamera = capture && error instanceof capture.CameraError;
      say(isCamera ? error.message : 'No se pudo encender la cámara. Recarga la página e intenta de nuevo.', true);
      if (!isCamera) console.error(error);
    } finally {
      button.disabled = false;
    }
  }

  button.onclick = () => (live ? stop() : start());
  $('.record-toggle').onclick = saveRecording;
  $('.again').onclick = () => (live ? startRecording() : start());

  return () => {
    disposed = true;
    clearInterval(recordTimer);
    stop(); // a recording in progress is kept: it is in the gallery when the user comes back
    robot.dispose();
  };
}
