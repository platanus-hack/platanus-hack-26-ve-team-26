// Entrena a Tridi en vivo (W4, WEB-1 in docs/plan-producto.md): the camera on one side with the
// person's skeleton drawn over it, and the G1 copying them on the other (view.mimic from physics/,
// createLiveCapture from data/live). Move and the robot copies you; nothing is recorded here.
//
// Optional: a phone as the camera (docs/contrato.md, "El teléfono como cámara"). "Usar el teléfono
// como cámara" opens a session on the video server and shows a QR; the phone opens #/camara and
// sends its poses with a small image of its camera; createPhoneCapture plays them here with the same
// interface as the webcam, so everything below (the skeleton, mimic) does not know which
// camera it is, and the image goes where the webcam's video would, under the skeleton. Without the
// server the button only says why; the webcam is untouched.
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
// The page the QR sends the phone to. The deployed web in development: the phone cannot reach a
// dev server on this machine, and its camera needs HTTPS, which a LAN address does not have.
const PHONE_WEB = ['localhost', '127.0.0.1'].includes(location.hostname) ? 'https://tridi-alpha.vercel.app/' : `${location.origin}${location.pathname}`;
// A server on this machine is out of the phone's reach too.
const LOCAL_API = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/;

// The robot now goes where the person goes (physics/ root.js): the scene's camera catches up with
// it in this many seconds (viewer followTau) instead of staying locked on the pelvis, so a walk
// shows as the robot moving across the floor, not only as the floor sliding under it. The landing's
// hero uses the same 0.5 s.
const FOLLOW_S = 0.5;

// "?debug" in the address (tridi-alpha.vercel.app/?debug#/en-vivo) shows, once a second, how far the robot is from the person and
// what it added that the person did not do (physics/ mimic's `fixes`): to tell a misread from a
// fix while testing arms in front of a real camera (docs/investigacion/2026-10-24-brazos-humanos-en-vivo.md).
const DEBUG = new URLSearchParams(location.search).has('debug');
// The fixes in Spanish, as the readout says them.
const FIX_NAMES = {
  'mirrored arm': 'brazo oculto espejado',
  legs: 'piernas abiertas',
  'left arm': 'brazo izq. abierto',
  'right arm': 'brazo der. abierto',
  'left arm on chest': 'brazo izq. frente al pecho',
  'right arm on chest': 'brazo der. frente al pecho',
  hands: 'manos separadas',
};

export function mount(root, { api }) {
  root.innerHTML = `
    <section class="page live">
      <header class="page-head">
        <a class="back" href="#/" aria-label="Volver al inicio">←<span class="only-wide">&nbsp;Volver al inicio</span></a>
        <h1>Entrena a Tridi en vivo</h1>
      </header>
      <div class="live-grid">
        <section class="pane camera-pane">
          <video playsinline muted></video>
          <img class="phone-image" alt="" hidden>
          <canvas class="camera-overlay"></canvas>
          <div class="camera-off">
            <ol class="steps">
              <li>Deja que la página use tu cámara.</li>
              <li>Que se vean tus hombros, brazos y manos. Para que camine, aléjate hasta los pies.</li>
              <li>Muévete despacio: Tridi copia lo que haces.</li>
            </ol>
          </div>
          <div class="phone-qr" hidden>
            <div class="qr"></div>
            <p>Escanea con la cámara del teléfono y acepta usar su cámara.</p>
            <p class="qr-session"></p>
          </div>
          <p class="pane-label camera-label">Tú</p>
        </section>
        ${robotPaneHTML('Robot · te copia')}
      </div>
      <div class="live-bar">
        <div class="row">
          <button class="primary camera-toggle" type="button">Encender la cámara</button>
          <button class="phone-toggle" type="button">Usar el teléfono<span class="only-wide"> como cámara</span></button>
        </div>
        <label class="hands-toggle" ${SMALL_SCREEN ? 'hidden' : ''}><input type="checkbox"> Seguir las palmas de cerca (a 1 o 1,5 m de la cámara)</label>
        <p class="live-status" aria-live="polite"></p>
        <p class="live-warning" hidden></p>
        <p class="phone-note" hidden></p>
        <p class="live-debug" ${DEBUG ? '' : 'hidden'}></p>
      </div>
    </section>`;

  const $ = (selector) => root.querySelector(selector);
  const video = $('video');
  const phoneImage = $('.phone-image');
  const overlay = $('.camera-overlay');
  const ctx = overlay.getContext('2d');
  const button = $('.camera-toggle');
  const phoneButton = $('.phone-toggle');
  const say = (text, isError = false) => {
    $('.live-status').textContent = text;
    $('.live-status').classList.toggle('error', isError);
  };
  // Phone events last longer than the status line, which rewrites itself every second.
  const note = (text) => {
    $('.phone-note').textContent = text;
    $('.phone-note').hidden = !text;
  };

  let live = null; // the webcam capture or the phone capture: the same interface
  const isPhone = () => live?.source === 'phone';
  let startedAt = 0;
  let lastReport = 0;
  let disposed = false;
  let returnToWebcam = false; // the webcam was on when the phone took over
  // Pushing needs the physics back: the camera stops first, as on the physics/ page.
  const robot = mountRobotPane($('.robot-pane'), { beforePush: () => stop() });
  robot.ready.then((view) => view && !disposed && (view.viewer.followTau = FOLLOW_S));

  function stop() {
    if (!live) return;
    say('');
    live.stop(); // a phone session ends on the server too, and the phone says so
    live = null;
    robot.view?.reset();
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    phoneImage.hidden = true;
    phoneImage.removeAttribute('src');
    root.querySelector('.live').classList.remove('camera-on', 'phone-on');
    $('.phone-qr').hidden = true;
    $('.camera-label').textContent = 'Tú';
    button.textContent = 'Encender la cámara';
    phoneButton.innerHTML = 'Usar el teléfono<span class="only-wide"> como cámara</span>';
    $('.live-warning').hidden = true;
  }

  function onPose(pose) {
    // The phone's frames come with its image size; the webcam's with the video's.
    const { width, height } = isPhone() ? live.size() : { width: video.videoWidth, height: video.videoHeight };
    if (overlay.width !== width || overlay.height !== height) [overlay.width, overlay.height] = [width, height];
    drawSkeleton(ctx, pose?.landmarks, pose?.visible);
    const copied = robot.view?.mimic(pose);

    const now = performance.now();
    if (now - lastReport < 1000) return; // words change once a second, not every frame
    lastReport = now;
    if (DEBUG && copied) {
      const fixes = (copied.fixes ?? []).map((f) => FIX_NAMES[f] ?? f).join(', ') || 'ninguno';
      $('.live-debug').textContent = copied.tracked
        ? `Distancia al cuerpo: ${(100 * copied.residual).toFixed(1)} cm · arreglos: ${fixes}`
        : 'Sin seguimiento';
    }
    const phone = isPhone();
    if (!robot.view) say('El robot todavía está cargando; ya te va a copiar.');
    else if (!pose) say(phone ? 'El teléfono no ve a nadie. Que se vea al menos de la cintura para arriba.' : 'No te veo. Que se vea al menos de la cintura para arriba.');
    else if (!pose.visible) say(phone ? 'El teléfono ve a medias. Que se vean los hombros, los brazos y las manos.' : 'Te veo a medias. Que se vean tus hombros, brazos y manos.');
    else say(phone ? '¡Conectado! Tridi copia a quien filma el teléfono.' : '¡Te veo! Muévete despacio y Tridi te copia.');
    const fps = live?.fps() ?? 0;
    const slow = now - startedAt > WARMUP_MS && fps < MIN_FPS;
    $('.live-warning').hidden = !slow;
    const frames = `${fps} ${fps === 1 ? 'cuadro' : 'cuadros'} por segundo`;
    $('.live-warning').textContent = phone
      ? `El teléfono va algo lento (${frames}): el robot puede moverse a saltos. Acércalo a la luz o cierra otras apps.`
      : `Tu equipo va algo lento (${frames}): el robot puede moverse a saltos. Cierra otras pestañas o acércate a la luz.`;
  }

  let drawSkeleton;
  let capture = null;
  async function start() {
    if (live) stop(); // the phone was the camera: back to the webcam
    button.disabled = true;
    say('Preparando la cámara…');
    try {
      // MediaPipe (several MB) is only downloaded when the camera is asked for.
      capture ??= await import('tridi-live');
      drawSkeleton = capture.drawSkeleton;
      const session = await capture.createLiveCapture(video, {
        model: SMALL_SCREEN ? 'lite' : 'full',
        // MediaPipe's hand model on top of the pose: steadier palms up close, ~11 ms more a frame,
        // so laptops only (data/live createLiveCapture `hands`).
        hands: !SMALL_SCREEN && handsBox.checked,
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

  // The phone as the camera: a session on the server, its QR in the camera pane, and the frames
  // played through the same onPose. Nothing here runs unless the button is pressed.
  async function startPhone() {
    phoneButton.disabled = true;
    note('');
    try {
      await api.checked;
      if (!api.ok) return say('Para usar el teléfono hace falta el servidor de videos, y ahora no está encendido.', true);
      if (LOCAL_API.test(api.url)) return say('El teléfono no puede llegar a un servidor en esta máquina: abre la web con el enlace de data/serve.sh (?api=<túnel>).', true);
      returnToWebcam = !!live && !isPhone();
      stop();
      say('Abriendo la sesión para el teléfono…');
      // tridi-live and the QR library only download when the phone is asked for.
      const [tridi, { renderSVG }] = await Promise.all([capture ?? import('tridi-live'), import('uqr')]);
      capture = tridi;
      drawSkeleton = capture.drawSkeleton;
      const { sessionId } = await capture.openPhoneSession(api.url);
      if (disposed) return capture.closePhoneSession(api.url, sessionId);
      const url = capture.phonePageUrl(PHONE_WEB, api.url, sessionId);
      // Error level M (15 % of the code may be unreadable) scans fine from a laptop screen under
      // stand lights; the margin keeps it readable against the pane.
      $('.qr').innerHTML = renderSVG(url, { ecc: 'M', border: 2, pixelSize: 6, blackColor: '#0d0d0b', whiteColor: '#ffffff' });
      $('.qr-session').textContent = `sesión ${sessionId}`;
      $('.phone-qr').hidden = false;
      live = capture.createPhoneCapture(api.url, sessionId, { onPose, onImage, onStatus: onPhoneStatus });
      root.querySelector('.live').classList.add('phone-on');
      $('.camera-label').textContent = 'Tu teléfono';
      phoneButton.innerHTML = 'Dejar<span class="only-wide"> de usar</span> el teléfono';
      say('Escanea el código con el teléfono. Mientras tanto, la webcam no se usa.');
    } catch (error) {
      const known = capture && error instanceof capture.UploadError;
      say(known ? error.message : 'No se pudo abrir la sesión del teléfono. Revisa el servidor e intenta de nuevo.', true);
      if (!known) console.error(error);
    } finally {
      phoneButton.disabled = false;
    }
  }

  // The phone's camera image, just before the pose it came with: where the webcam's video would be.
  function onImage(src) {
    if (!isPhone()) return;
    phoneImage.src = src;
    phoneImage.hidden = false;
  }

  function onPhoneStatus({ state }) {
    if (!isPhone()) return;
    if (state === 'streaming') {
      // The first frames: the QR goes and the skeleton shows; the slow-frames warning counts from here.
      if (!root.querySelector('.live').classList.contains('camera-on')) startedAt = performance.now();
      $('.phone-qr').hidden = true;
      root.querySelector('.live').classList.add('camera-on');
    } else if (state === 'lost' || state === 'ended') {
      const why = state === 'lost' ? `El teléfono dejó de mandar (${capture.PHONE_SILENCE_S} s sin cuadros).` : 'El teléfono cerró la sesión.';
      stop();
      note(`${why} ${returnToWebcam ? 'Volví a la webcam.' : 'La webcam vuelve a ser la cámara: enciéndela cuando quieras.'}`);
      if (returnToWebcam) start();
    }
  }

  function stopPhone() {
    stop();
    note('Dejaste de usar el teléfono. La webcam vuelve a ser la cámara.');
  }

  button.onclick = () => (live && !isPhone() ? stop() : start());
  phoneButton.onclick = () => (isPhone() ? stopPhone() : startPhone());
  // The hand model is chosen when the camera opens: changing it with the camera on reopens it.
  const handsBox = $('.hands-toggle input');
  handsBox.onchange = () => {
    if (live && !isPhone()) start();
  };

  return () => {
    disposed = true;
    stop();
    if (robot.view) robot.view.viewer.followTau = 0; // the other screens follow the robot rigidly
    robot.dispose();
  };
}
