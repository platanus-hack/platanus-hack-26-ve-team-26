// Sube un video (W5 and W6): pick a file, upload it in chunks, follow the server through its
// stages, let the user pick another person on the first frame, and put the clip in the gallery.
// The server API is data/live's client (docs/contrato.md); this screen only draws it.
import { chooseSubject, fetchClip, firstFrameUrl, UploadError, uploadVideo, watchJob } from '../../../data/live/src/upload.js';
import { watching } from '../dots/poses.js';
import { addUserClip } from '../preloaded.js';

export const title = 'Subir un video';

// The server's limits (docs/contrato.md): checked here first so nobody waits for an upload
// that will be refused.
const MAX_BYTES = 60 * 1024 * 1024;
const MAX_SECONDS = 30;
const VIDEO_TYPES = /\.(mp4|mov|m4v|webm|zip)$/i;

const STAGES = [
  ['upload', 'Subir el video'],
  ['tracking', 'Buscar a las personas'],
  ['pose3d', 'Calcular cómo se mueve'],
  ['done', '¡Listo!'],
];
const STAGE_ORDER = { waiting: 1, tracking: 1, pose3d: 2, done: 3, failed: 3 };

// The current upload survives leaving the screen: the server keeps working, and coming back
// shows where it is. { jobId, filename, job, error, clips }
let session = null;

const describeError = (error) =>
  error instanceof UploadError ? error.message : 'Se cortó la conexión con el servidor. Revisa tu internet e intenta de nuevo.';

function videoSeconds(file) {
  return new Promise((resolve) => {
    const probe = document.createElement('video');
    probe.preload = 'metadata';
    probe.onloadedmetadata = () => {
      URL.revokeObjectURL(probe.src);
      resolve(probe.duration);
    };
    probe.onerror = () => resolve(null); // unknown format here; the server decides
    probe.src = URL.createObjectURL(file);
  });
}

export function mount(root, { dots, api }) {
  root.innerHTML = `
    <section class="page upload" data-step="checking">
      <header class="page-head">
        <a class="back" href="#/">← Volver al inicio</a>
        <h1>Sube un video</h1>
      </header>
      <div class="upload-grid">
        <div class="intro-scene" aria-hidden="true"></div>
        <div class="upload-panel">
          <div data-show="checking"><p class="lead">Conectando con Tridi…</p></div>

          <div data-show="pick">
            <p class="lead">Tridi aprende de una persona moviéndose: caminando, bailando o corriendo.</p>
            <ul class="tips">
              <li><strong>Graba de perfil y con el cuerpo entero en cuadro.</strong> De frente, el robot no avanza.</li>
              <li>Hasta ${MAX_SECONDS} segundos y ${MAX_BYTES / 1024 / 1024} MB por video.</li>
              <li>Si hay varias personas, después tocas la que quieres.</li>
            </ul>
            <label class="dropzone">
              <input type="file" accept="video/*,.zip" hidden />
              <strong>Elegir un video</strong>
              <span>o arrástralo aquí</span>
            </label>
            <p class="pick-error error" aria-live="polite"></p>
          </div>

          <div data-show="uploading">
            <h2>Subiendo tu video</h2>
            <div class="track big"><div class="bar upload-bar"></div></div>
            <p class="upload-percent">0 %</p>
            <button class="cancel" type="button">Cancelar</button>
          </div>

          <div data-show="processing">
            <h2>Tridi está mirando tu video</h2>
            <ol class="stages">${STAGES.map(([id, text]) => `<li data-stage="${id}">${text}</li>`).join('')}</ol>
            <div class="track big"><div class="bar stage-bar"></div></div>
            <p class="queue"></p>
            <div class="chooser" hidden>
              <p><strong>¿Es esta la persona?</strong> Si no, toca a la que quieres.</p>
              <div class="frame"><img alt="Primer cuadro del video con las personas encontradas" /><svg></svg></div>
            </div>
            <p class="note">Puedes <a href="#/simulaciones">ver otras simulaciones</a> mientras tanto: tu video sigue aquí.</p>
          </div>

          <div data-show="done">
            <h2>¡Listo!</h2>
            <p class="lead done-text"></p>
            <div class="row">
              <a class="button primary see-clip" href="#/simulaciones">Verlo en simulaciones</a>
              <button class="again" type="button">Subir otro video</button>
            </div>
          </div>

          <div data-show="error">
            <h2>No se pudo</h2>
            <p class="lead error error-text"></p>
            <button class="primary again" type="button">Probar con otro video</button>
          </div>

          <div data-show="off">
            <h2>Subir videos no está disponible ahora</h2>
            <p class="lead">El equipo que mira los videos está apagado. Mientras tanto, puedes usar la cámara o ver lo que Tridi ya aprendió.</p>
            <div class="row">
              <a class="button primary" href="#/en-vivo">Usar la cámara</a>
              <a class="button" href="#/simulaciones">Ver simulaciones</a>
            </div>
          </div>
        </div>
      </div>
    </section>`;

  const $ = (selector) => root.querySelector(selector);
  const page = $('.upload');
  const show = (step) => (page.dataset.step = step);
  const view = dots.addView($('.intro-scene'), watching, $('.upload-panel'));
  let gone = false;
  let abort = null;

  // Picking a file.
  const input = $('input[type=file]');
  input.onchange = () => input.files[0] && start(input.files[0]);
  const zone = $('.dropzone');
  zone.ondragover = (event) => {
    event.preventDefault();
    zone.classList.add('over');
  };
  zone.ondragleave = () => zone.classList.remove('over');
  zone.ondrop = (event) => {
    event.preventDefault();
    zone.classList.remove('over');
    const file = event.dataTransfer.files[0];
    if (file) start(file);
  };
  for (const button of root.querySelectorAll('.again')) {
    button.onclick = () => {
      session = null;
      input.value = '';
      $('.pick-error').textContent = '';
      show('pick');
    };
  }
  $('.cancel').onclick = () => abort?.abort();

  async function start(file) {
    const refuse = (text) => ($('.pick-error').textContent = text);
    if (!VIDEO_TYPES.test(file.name)) return refuse('Ese archivo no es un video. Usa un .mp4, .mov, .webm o un .zip con videos.');
    if (file.size > MAX_BYTES) return refuse(`Ese video pesa ${Math.round(file.size / 1024 / 1024)} MB; el máximo es ${MAX_BYTES / 1024 / 1024} MB. Recórtalo o grábalo más corto.`);
    if (!/\.zip$/i.test(file.name)) {
      const seconds = await videoSeconds(file);
      if (seconds > MAX_SECONDS) return refuse(`Ese video dura ${Math.round(seconds)} segundos; el máximo es ${MAX_SECONDS}. Recórtalo y vuelve a intentar.`);
    }

    session = { filename: file.name, jobId: null, job: null, clips: [] };
    show('uploading');
    abort = new AbortController();
    try {
      session.jobId = await uploadVideo(api.url, file, {
        signal: abort.signal,
        onProgress: ({ sent, total }) => {
          const percent = Math.round((100 * sent) / total);
          $('.upload-bar').style.width = `${percent}%`;
          $('.upload-percent').textContent = `${percent} %`;
        },
      });
    } catch (error) {
      if (abort.signal.aborted) {
        session = null;
        return show('pick');
      }
      return fail(describeError(error));
    }
    follow();
  }

  function fail(text) {
    session = { ...session, error: text };
    if (gone) return;
    $('.error-text').textContent = text;
    show('error');
  }

  // Following the job until it ends; called again after picking another person.
  async function follow() {
    abort?.abort();
    abort = new AbortController();
    const signal = abort.signal;
    if (!gone) show('processing');
    let job;
    try {
      job = await watchJob(api.url, session.jobId, { signal, onUpdate: (state) => !gone && render((session.job = state)) });
    } catch (error) {
      if (!signal.aborted) fail(describeError(error));
      return;
    }
    const failed = job.videos.filter((v) => v.stage === 'failed');
    if (job.state === 'failed' || failed.length === job.videos.length) {
      return fail(failed[0]?.error ?? 'Tridi no pudo ver a nadie en ese video. Prueba con otro, de perfil y con el cuerpo entero.');
    }
    try {
      session.clips = await Promise.all(job.videos.filter((v) => v.clip_id).map((v) => fetchClip(api.url, v.clip_id)));
    } catch (error) {
      return fail(describeError(error));
    }
    const name = session.filename.replace(/\.[^.]+$/, '');
    session.clips.forEach((clip, i) => addUserClip(clip, session.clips.length > 1 ? `${name} (${i + 1})` : name));
    if (gone) return;
    $('.done-text').textContent =
      session.clips.length > 1 ? `Tridi ya tiene ${session.clips.length} movimientos nuevos.` : 'Tridi ya tiene el movimiento de tu video.';
    $('.see-clip').href = `#/simulaciones/${encodeURIComponent(session.clips[0].id)}`;
    show('done');
    // The chooser stays useful for 10 minutes after "done" (the server keeps the video that long).
    render(job);
  }

  function render(job) {
    // The least advanced video sets the step shown; a .zip brings several.
    const videos = job.videos;
    const step = Math.min(...videos.map((v) => STAGE_ORDER[v.stage] ?? 1));
    root.querySelectorAll('.stages li').forEach((li, i) => {
      li.classList.toggle('done', i < step || (i === step && step === 3));
      li.classList.toggle('current', i === step && step < 3);
    });
    const current = videos.find((v) => (STAGE_ORDER[v.stage] ?? 1) === step) ?? videos[0];
    $('.stage-bar').style.width = `${Math.round(100 * (current?.progress ?? 0))}%`;
    $('.queue').textContent =
      job.state === 'queued' && job.position > 0
        ? `Hay ${job.position} ${job.position === 1 ? 'video' : 'videos'} antes que el tuyo.`
        : videos.length > 1
          ? `${videos.filter((v) => v.stage === 'done').length} de ${videos.length} videos listos.`
          : '';
    drawChooser(job);
  }

  // People on the first frame: the selected one highlighted, a click picks another (W5.3).
  let chooserFor = null;
  function drawChooser(job) {
    const n = job.videos.findIndex((v) => v.people?.length && v.frame_size);
    const chooser = $('.chooser');
    chooser.hidden = n < 0 || job.videos[n].people.length < 2;
    if (chooser.hidden) return;
    const video = job.videos[n];
    const [w, h] = video.frame_size;
    const img = chooser.querySelector('img');
    const key = `${job.job_id}/${n}/${video.first_frame}`;
    if (chooserFor !== key) {
      img.src = firstFrameUrl(api.url, job.job_id, n);
      chooserFor = key;
    }
    const svg = chooser.querySelector('svg');
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.innerHTML = video.people
      .map(({ box: [x0, y0, x1, y1], selected }) =>
        `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" rx="${Math.min(w, h) / 80}" class="${selected ? 'selected' : ''}" />`)
      .join('');
    svg.onclick = async (event) => {
      const rect = svg.getBoundingClientRect();
      const x = Math.round(((event.clientX - rect.left) / rect.width) * w);
      const y = Math.round(((event.clientY - rect.top) / rect.height) * h);
      try {
        await chooseSubject(api.url, job.job_id, n, x, y);
      } catch (error) {
        return fail(describeError(error));
      }
      follow();
    };
  }

  // Where to start: no server, an upload in progress from before, or a fresh pick.
  api.checked.then((ok) => {
    if (gone) return;
    if (!ok) return show('off');
    if (session?.error) return fail(session.error);
    if (session?.jobId) return follow();
    show('pick');
  });

  return () => {
    gone = true;
    abort?.abort(); // stops polling; the server keeps processing
    dots.removeView(view);
  };
}
