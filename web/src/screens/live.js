// Entrena a Tridi en vivo (W4): the camera on one side with the person's skeleton drawn over it,
// and the G1 copying them on the other (view.mimic from physics/, createLiveCapture from data/live).
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
        <button class="primary camera-toggle" type="button">Encender la cámara</button>
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

  function stop() {
    if (!live) return;
    live.stop();
    live = null;
    robot.view?.reset();
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    root.querySelector('.live').classList.remove('camera-on');
    button.textContent = 'Encender la cámara';
    $('.live-warning').hidden = true;
    say('');
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

  return () => {
    disposed = true;
    stop();
    robot.dispose();
  };
}
