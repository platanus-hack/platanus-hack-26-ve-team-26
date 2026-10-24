// The phone as the live camera (#/camara/<session>): the page the QR on En vivo opens on the
// phone (docs/contrato.md, "El teléfono como cámara"). It runs the same MediaPipe as the webcam on
// the phone's back camera (createLiveCapture from data/live) and posts the poses to the Mac's
// session (createPhoneSender), with a small image of the camera (createImageGrabber) so the Mac
// shows what the phone sees under the skeleton; the robot on the Mac copies whoever this phone films. Nothing else
// loads here: no robot, no 3D, so a phone opens it in a moment. The server's address comes in
// ?api= of the QR's link, which web/src/api.js reads first.
export const title = 'Cámara del teléfono';

// Phones run MediaPipe's "lite" model: half the work, as data/live recommends.
const MODEL = 'lite';
// Words change once a second, not every frame (as on the live screen).
const REPORT_MS = 1000;
// Under this many frames per second the robot moves in jumps (the live screen's line).
const MIN_FPS = 20;
// If the Mac stops asking for the frames (closed tab, tunnel gone) the phone stops after this long,
// so a forgotten phone does not film and post for an hour: 30 s is longer than any tunnel hiccup,
// and a Mac that closed its tab never comes back.
const UNWATCHED_STOP_S = 30;
// Session ids as data/relay.py makes them.
const SESSION_ID = /^[23456789abcdefghjkmnpqrstuvwxyz]{8}$/;

export function mount(root, { api }, [sessionId] = []) {
  root.innerHTML = `
    <section class="page narrow phone">
      <header class="page-head">
        <h1>Este teléfono es la cámara</h1>
      </header>
      <p class="lead">Lo que filmes se copia en el robot de la pantalla grande.</p>
      <div class="phone-stage">
        <video playsinline muted></video>
        <canvas class="phone-overlay"></canvas>
        <p class="phone-big" aria-live="polite">Toca el botón y acepta usar la cámara.</p>
      </div>
      <p class="phone-meta"></p>
      <div class="row">
        <button class="primary phone-start" type="button">Usar la cámara</button>
        <button class="phone-end" type="button" hidden>Terminar</button>
      </div>
      <ol class="steps">
        <li>Apunta a la persona con el cuerpo entero en cuadro; de perfil si va a caminar.</li>
        <li>Mantén la pantalla encendida y el teléfono quieto.</li>
        <li>En la pantalla grande, Grabar guarda el movimiento como siempre.</li>
      </ol>
    </section>`;

  const $ = (selector) => root.querySelector(selector);
  const video = $('video');
  const overlay = $('.phone-overlay');
  const ctx = overlay.getContext('2d');
  const startButton = $('.phone-start');
  const endButton = $('.phone-end');
  const big = (text, isError = false) => {
    $('.phone-big').textContent = text;
    $('.phone-big').classList.toggle('error', isError);
  };

  let capture = null; // the tridi-live module
  let live = null; // createLiveCapture
  let sender = null; // createPhoneSender
  let grabber = null; // createImageGrabber: the camera image for the Mac
  let wakeLock = null;
  let server = { state: 'sending' }; // the last status the sender reported
  let unwatchedSince = 0;
  let lastReport = 0;
  let disposed = false;

  if (!SESSION_ID.test(sessionId ?? '')) {
    big('Este enlace no trae una sesión válida. Vuelve a escanear el código de la pantalla grande.', true);
    startButton.disabled = true;
  } else if (!api.url) {
    big('No sé dónde está el servidor. Vuelve a escanear el código de la pantalla grande.', true);
    startButton.disabled = true;
  }

  // The screen must stay on: a locked phone stops the camera. The hint in the steps covers the
  // browsers without the Wake Lock API.
  async function keepAwake() {
    try {
      wakeLock = await navigator.wakeLock?.request('screen');
    } catch {
      wakeLock = null;
    }
  }
  const onVisible = () => document.visibilityState === 'visible' && live && keepAwake();
  document.addEventListener('visibilitychange', onVisible);

  function onPose(pose) {
    if (overlay.width !== video.videoWidth) [overlay.width, overlay.height] = [video.videoWidth, video.videoHeight];
    capture.drawSkeleton(ctx, pose?.landmarks, pose?.visible);
    sender?.push(pose, video.videoWidth, video.videoHeight, grabber?.grab());

    const now = performance.now();
    if (now - lastReport < REPORT_MS) return;
    lastReport = now;
    if (server.state === 'offline') big('Sin conexión con el servidor. Sigo intentando…', true);
    else if (server.state === 'unwatched') big('La pantalla grande no está escuchando. ¿Sigue abierta En vivo?', true);
    else if (!pose) big('No veo a nadie. Que se vea el cuerpo entero.');
    else if (!pose.visible) big('Se ve a medias: aléjate hasta que entre de la cabeza a los pies.');
    else big('Conectado. El robot copia a quien filmas.');
    const fps = live?.fps() ?? 0;
    $('.phone-meta').textContent = `${fps} ${fps === 1 ? 'cuadro' : 'cuadros'} por segundo${fps < MIN_FPS ? ' · lento: el robot puede moverse a saltos' : ''}`;
  }

  function onStatus(status) {
    server = status;
    if (status.state === 'ended') return end('La pantalla grande terminó la sesión. Puedes cerrar esta página.');
    if (status.state !== 'unwatched') unwatchedSince = 0;
    else if (!unwatchedSince) unwatchedSince = performance.now();
    else if (performance.now() - unwatchedSince > UNWATCHED_STOP_S * 1000) {
      end(`La pantalla grande dejó de escuchar hace ${UNWATCHED_STOP_S} s. Vuelve a escanear el código.`, true);
    }
  }

  async function start() {
    startButton.disabled = true;
    big('Preparando la cámara…');
    try {
      // MediaPipe (several MB) is only downloaded when the camera is asked for.
      capture ??= await import('tridi-live');
      await api.checked;
      if (!api.ok) throw new capture.UploadError('No encuentro el servidor de Tridi. En la pantalla grande, vuelve a abrir la sesión del teléfono.');
      const session = await capture.createLiveCapture(video, {
        model: MODEL,
        facingMode: 'environment',
        onProgress: ({ stage, done }) =>
          big(stage === 'model' ? (done ? 'Listo. Ahora acepta el permiso de la cámara.' : 'Preparando la cámara…') : 'Esperando el permiso de la cámara…'),
        onPose,
      });
      if (disposed) return session.stop();
      live = session;
      sender = capture.createPhoneSender(api.url, sessionId, { onStatus });
      grabber = capture.createImageGrabber(video);
      keepAwake();
      $('.phone').classList.add('camera-on');
      startButton.hidden = true;
      endButton.hidden = false;
      big('Conectando con la pantalla grande…');
    } catch (error) {
      const known = capture && (error instanceof capture.CameraError || error instanceof capture.UploadError);
      big(known ? error.message : 'No se pudo encender la cámara. Recarga la página e intenta de nuevo.', true);
      if (!known) console.error(error);
      startButton.disabled = false;
    }
  }

  function end(message, isError = false) {
    sender?.stop();
    sender = null;
    grabber = null;
    live?.stop();
    live = null;
    wakeLock?.release().catch(() => {});
    wakeLock = null;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    $('.phone').classList.remove('camera-on');
    endButton.hidden = true;
    $('.phone-meta').textContent = '';
    big(message, isError);
  }

  startButton.onclick = start;
  endButton.onclick = () => {
    capture?.closePhoneSession(api.url, sessionId); // the Mac sees it at once and goes back to its webcam
    end('Listo. Puedes cerrar esta página.');
  };
  // Leaving the page (closing the tab, going home) tells the Mac too, instead of 5 s of silence.
  const onLeave = () => live && capture?.closePhoneSession(api.url, sessionId);
  window.addEventListener('pagehide', onLeave);

  return () => {
    disposed = true;
    onLeave();
    window.removeEventListener('pagehide', onLeave);
    document.removeEventListener('visibilitychange', onVisible);
    end('');
  };
}
