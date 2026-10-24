// La entrega de un clip (#/entrega, #/entrega/<clip id>): what a client takes away once a video has
// been trained, on one screen. The format is docs/contrato.md, "La entrega de un clip": delivery.json
// sums up the policy and its test in four worlds, replay.json has every test episode at 25 Hz, and
// `files` lists the downloads. The preloaded deliveries (data/deliveries/) are bundled, so they work
// on any static host; any other clip is asked of the video server.
//
// The robot shows the dataset's own poses (sim.puppet, no dynamics) instead of view.playClip:
// playClip grounds and smooths a RobotMotion for display, which would stand a fallen robot back up.
// A stones episode is shown on the stones floor, so its feet land where they did.
import { WORLDS } from 'tridi-physics';

import { attachRobot, onRobotProgress, robotView } from '../robot-host.js';
import './delivery.css';

export const title = 'Entrega';

// Bundled deliveries: the manifests now (about 14 KB each), every other file as a URL that
// downloads nothing until it is used. no-inline keeps the small files (policy.json, scene.json) as
// real files instead of data: URLs, so they download under their own name.
const BUNDLED = '../../../data/deliveries/';
const MANIFESTS = import.meta.glob('../../../data/deliveries/*/delivery.json', { eager: true, import: 'default' });
const FILE_URLS = import.meta.glob(['../../../data/deliveries/*/*', '!../../../data/deliveries/*/delivery.json'], {
  eager: true,
  query: '?url&no-inline',
  import: 'default',
});

// #/entrega with no id opens the walk, the first clip with a delivery.
const DEFAULT_CLIP = 'clip_2026-10-23_caminar-perfil_01';
// Clip ids as data/server.py makes them (its CLIP_ID); nothing else is asked of the server.
const CLIP_ID = /^clip_[A-Za-z0-9_-]+$/;
// A file of a delivery: a bare name, so it can only point inside the delivery's folder.
const FILE_NAME = /^[A-Za-z0-9_-]+(\.[A-Za-z0-9]+)+$/;

// The dataset has one row per policy decision (20 ms, docs/contrato.md) and the first is written
// after the first decision; replay.json keeps every other row, so replay row i is at
// FIRST_ROW_S + i / hz seconds, (2i + 1) / 50 at 25 Hz. Halving can drop the episode's last row, and
// the delivery may append it: a replay with more rows than that rule fits in the episode's
// `seconds` (delivery.json) has its last row at `seconds`, closer to the row before it.
const DATASET_HZ = 50;
const FIRST_ROW_S = 1 / DATASET_HZ;
// `seconds` is a whole number of dataset rows written with two decimals: half a row of slack keeps
// that rounding from passing for an extra replay row.
const ROW_SLACK_S = 0.5 / DATASET_HZ;
// The first random push of a test episode comes 2 to 4 s after it starts (training/env.py,
// PUSH_EVERY_S): until then, a world that varies nothing but its pushes runs the same episode.
const FIRST_PUSH_S = 2;
// What ends a test episode (training/imitate.py MimicEnv.step): the pelvis more than 0.6 m from the
// reference on the floor plane, or a fall, which training/env.py calls the pelvis below 0.5 m or
// the torso tilted past 60 degrees (its "up" below 0.5).
const OFF_PATH_M = 0.6;
const FALL_HEIGHT_M = 0.5;
// The last pose stays on screen this long before the episode starts over, so its end (a fall, a
// drift off the path) can be seen instead of flashing by.
const HOLD_END_S = 0.8;
// A stalled frame (a hidden tab, a model being rebuilt) moves the clock this much at most instead of
// jumping, as in stage.js.
const MAX_FRAME_S = 1 / 30;
const SPEEDS = [0.25, 0.5, 1];
// Where the camera sits from the pelvis (three.js axes: x is MuJoCo's x, z is MuJoCo's -y). The
// clips start heading +y, so this is the walker's right side, a little ahead: the legs read in
// profile. About 2.6 m away, the camera's 40° view spans the robot's 1.3 m with the floor around it.
const CAMERA_OFFSET = { x: 2.45, y: 0.3, z: -0.85 };

// The telemetry lanes, top to bottom. The two feet share one scale; every lane keeps its scale across
// episodes, so clicking through them compares like with like. `short` is the name on a narrow chart.
const LANES = [
  { key: 'left', name: 'Pie izquierdo', short: 'Pie izq.', unit: 'N', digits: 0 },
  { key: 'right', name: 'Pie derecho', short: 'Pie der.', unit: 'N', digits: 0 },
  { key: 'pose', name: 'Error de pose', short: 'Err. pose', unit: 'rad', digits: 3 },
  // The dataset's pelvis error is the 3D distance to the reference (height included), while the cut
  // measures it on the floor only: the line marks the cut's size, and a fall alone can cross it.
  { key: 'pelvis', name: 'Error pelvis 3D', short: 'Err. pelvis 3D', unit: 'm', digits: 2, limit: OFF_PATH_M, limitLabel: 'corte · 0,6 m medidos en el piso (este error suma la altura)', limitShort: 'corte · en el piso' },
  { key: 'height', name: 'Altura de pelvis', short: 'Altura pelvis', unit: 'm', digits: 2, limit: FALL_HEIGHT_M, limitLabel: 'caída · bajo 0,5 m', limitShort: 'caída' },
];

// The world parameters drawn per episode (docs/contrato.md, "Mundos"). push_n is the strongest of
// the episode's random pushes.
const PARAMS = [
  { key: 'friction', name: 'Fricción del piso', digits: 2, prefix: '', unit: '' },
  { key: 'wind_mps', name: 'Viento', digits: 1, prefix: '', unit: ' m/s' },
  { key: 'mass_scale', name: 'Masa', digits: 2, prefix: '×', unit: '' },
  { key: 'motor_scale', name: 'Motores', digits: 2, prefix: '×', unit: '' },
  { key: 'push_n', name: 'Empujón máximo', digits: 0, prefix: '', unit: ' N' },
];
const paramText = ({ digits, prefix, unit }, v) => `${prefix}${trim(num(v, digits))}${unit}`;
const rangeText = (param, [lo, hi]) => (lo === hi ? paramText(param, lo) : `${param.prefix}${trim(num(lo, param.digits))} a ${paramText(param, hi)}`);

const SVG_NS = 'http://www.w3.org/2000/svg';
const num = (value, digits) => Number(value).toFixed(digits).replace('.', ',');
// "2,50" -> "2,5", "1,00" -> "1": for axis ticks and ranges, where the zeros say nothing.
const trim = (text) => (text.includes(',') ? text.replace(/0+$/, '').replace(/,$/, '') : text);
const int = new Intl.NumberFormat('es');
const esc = (text) => String(text ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const pad2 = (n) => String(n).padStart(2, '0');

function bytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${num(n / 1024 / 1024, 2)} MB`;
}

// The smallest clean number (1, 1.5, 2, 2.5, 3, 4, 5, 6 or 8 times a power of ten) at least `v`: the
// top of an axis. Steps this fine put the tallest value at two thirds of its lane or higher.
function niceCeil(v) {
  if (!(v > 0)) return 1;
  const step = 10 ** Math.floor(Math.log10(v));
  return [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((m) => m * step).find((m) => m >= v * (1 - 1e-9));
}

class DeliveryError extends Error {}

/**
 * Finds a delivery: the bundled copy first, then the video server's (docs/contrato.md).
 * @returns {{ manifest: object, source: 'static' | 'server', url(name: string): string | null }}
 */
async function loadDelivery(clipId, api, signal) {
  const manifest = MANIFESTS[`${BUNDLED}${clipId}/delivery.json`];
  if (manifest) {
    return { manifest, source: 'static', url: (name) => (FILE_NAME.test(name ?? '') ? FILE_URLS[`${BUNDLED}${clipId}/${name}`] ?? null : null) };
  }
  if (!CLIP_ID.test(clipId)) throw new DeliveryError(`"${clipId}" no es el id de un clip.`);
  if (!api?.url) {
    throw new DeliveryError('Esta entrega no viene con la página y no hay un servidor de videos configurado. Abre la página con el enlace que da el servidor (…?api=<url>) para verla.');
  }
  const base = `${api.url}/deliveries/${clipId}/`;
  let response;
  try {
    response = await fetch(`${base}delivery.json`, { signal });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new DeliveryError('El servidor de videos no responde ahora. Intenta de nuevo en un rato.');
  }
  if (response.status === 404) throw new DeliveryError('El servidor no tiene una entrega de este clip: puede que su entrenamiento todavía no haya terminado.');
  if (!response.ok) throw new DeliveryError(`El servidor de videos respondió ${response.status} al pedir la entrega.`);
  return { manifest: await response.json(), source: 'server', url: (name) => (FILE_NAME.test(name ?? '') ? new URL(name, base).href : null) };
}

export function mount(root, { api }, [param] = []) {
  // "#/entrega/" gives an empty id, which a default parameter would let through.
  const clipId = param || DEFAULT_CLIP;
  document.documentElement.classList.add('is-delivery');
  root.innerHTML = `
    <section class="dl">
      <header class="dl-top"><a class="dl-back" href="#/">← Tridi</a><p class="dl-kicker">// Entrega · <span class="dl-mono">${esc(clipId)}</span></p></header>
      <p class="dl-message" role="status">Buscando la entrega…</p>
    </section>`;
  const abort = new AbortController();
  let unmount = null;
  let gone = false;
  loadDelivery(clipId, api, abort.signal)
    .then((delivery) => {
      if (!gone) unmount = showDelivery(root, delivery, abort.signal);
    })
    .catch((error) => {
      if (gone) return;
      if (!(error instanceof DeliveryError)) console.error(error);
      root.querySelector('.dl-message').textContent = error instanceof DeliveryError ? error.message : 'No se pudo abrir la entrega.';
      root.querySelector('.dl-message').classList.add('dl-error');
      // The deliveries that come with the page always open: offer them instead of a dead end.
      const bundled = Object.values(MANIFESTS).filter((manifest) => manifest.clip_id !== clipId);
      root.querySelector('.dl').insertAdjacentHTML('beforeend', bundled.map((manifest) => `
        <a class="dl-get dl-other" href="#/entrega/${encodeURIComponent(manifest.clip_id)}">Ver la entrega de ${esc(manifest.title || manifest.clip_id)} →</a>`).join(''));
    });
  return () => {
    gone = true;
    abort.abort();
    unmount?.();
    document.documentElement.classList.remove('is-delivery');
  };
}

function showDelivery(root, { manifest: m, source, url }, signal) {
  const duration = m.duration_s;
  const policy = m.policy ?? {};
  const episodes = m.episodes.map((ep, index) => ({ ...ep, index }));
  const worlds = m.worlds.map((world, row) => {
    const eps = episodes.filter((ep) => ep.world === world.id);
    eps.forEach((ep, k) => Object.assign(ep, { row, k }));
    return { ...world, row, eps };
  });
  const order = worlds.flatMap((world) => world.eps); // the matrix, row by row: what the arrows walk
  const trained = new Set(policy.trained_worlds ?? []);
  const worldOf = (ep) => worlds[ep.row];
  const total = episodes.length;
  const completed = episodes.filter((ep) => !ep.fell).length;
  // Each parameter's span over every world, so the range bars of different worlds line up.
  const spans = Object.fromEntries(PARAMS.map(({ key }) => {
    const values = worlds.flatMap((world) => world.params?.[key] ?? []);
    return [key, [Math.min(...values), Math.max(...values)]];
  }));
  const followed = policy.followed_s ?? null;
  const created = m.created_at ? new Date(m.created_at) : null;
  const createdText = created && !Number.isNaN(created.getTime())
    ? `${created.toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })} · ${pad2(created.getHours())}:${pad2(created.getMinutes())}`
    : '—';
  const trainedTitles = worlds.filter((world) => trained.has(world.id)).map((world) => world.title);
  const testOnly = worlds.length - trainedTitles.length;

  const status = [
    followed !== null ? `Sigue ${num(followed, 2)} s de ${num(duration, 2)} s del clip (${Math.round((100 * followed) / duration)} %), en piso plano y sin empujones` : null,
    trainedTitles.length ? `practicó solo en ${trainedTitles.join(', ').toLowerCase()}${testOnly ? `: los otros ${testOnly} mundos son prueba` : ''}` : null,
    `${completed} de ${total} episodios de la prueba llegan al final`,
  ].filter(Boolean).join(' · ');

  root.innerHTML = `
    <section class="dl">
      <div class="dl-screen">
      <header class="dl-top">
        <a class="dl-back" href="#/" aria-label="Volver al inicio">← Tridi</a>
        <div class="dl-name">
          <p class="dl-kicker">// Entrega${source === 'server' ? ' · del servidor' : ''}</p>
          <h1>${esc(m.title || m.clip_id)}</h1>
        </div>
        <dl class="dl-meta">
          <div><dt>Clip</dt><dd class="dl-mono dl-clip" title="${esc(m.clip_id)}">${esc(m.clip_id)}</dd></div>
          <div><dt>Política</dt><dd><span class="dl-mono">${esc(policy.id ?? '—')}</span>${policy.task === 'mimic' ? ' · imitación' : ''}</dd></div>
          <div><dt>Práctica</dt><dd>${policy.steps ? `${num(policy.steps / 1e6, 1)} M pasos` : '—'}</dd></div>
          <div class="dl-follow"><dt>Sigue el clip</dt><dd>${followed !== null ? `${num(followed, 2)} s de ${num(duration, 2)} s` : '—'}
            <i class="dl-meter" aria-hidden="true"><b style="width:${followed !== null ? Math.min(100, (100 * followed) / duration) : 0}%"></b></i></dd></div>
          <div><dt>Creada</dt><dd>${esc(createdText)}</dd></div>
        </dl>
        <button class="dl-jump" type="button" data-jump="dl-files">Descargas · ${m.files?.length ?? 0} ↓</button>
      </header>
      <p class="dl-status"><b>Estado</b> ${esc(status)}</p>

      <div class="dl-main">
        <section class="dl-win dl-sim" aria-label="Repetición en 3D">
          <div class="dl-bar"><span>repetición — g1 · mujoco</span><span class="dl-sim-info">dataset ${DATASET_HZ} → 25 Hz</span></div>
          <div class="dl-view">
            <div class="dl-boot"><i class="dl-meter"><b class="dl-boot-fill"></b></i><span class="dl-boot-text">Preparando el mundo de física…</span></div>
            <p class="dl-hud dl-hud-left"><span class="dl-hud-ep">—</span><span class="dl-hud-state"></span></p>
            <p class="dl-hud dl-hud-right"><span class="dl-feet" title="Pie apoyado: el piso lo empuja hacia arriba"><i data-foot="left"></i>izq <i data-foot="right"></i>der</span><span class="dl-hud-t">0,00 s</span></p>
            <p class="dl-hud dl-hud-note"><span>Poses del dataset, cuadro a cuadro: lo que hizo el robot con física en la prueba</span></p>
          </div>
          <div class="dl-transport">
            <button class="dl-play" type="button" aria-label="Pausa"><svg viewBox="0 0 16 16" aria-hidden="true"><path class="i-pause" d="M4 3h3v10H4zM9 3h3v10H9z"/><path class="i-play" d="M4 2.5v11l9.5-5.5z"/></svg></button>
            <input class="dl-scrub" type="range" min="0" max="1" step="0.01" value="0" aria-label="Tiempo del episodio" />
            <output class="dl-time dl-mono">0,00 / 0,00 s</output>
            <div class="dl-speeds" role="group" aria-label="Velocidad">
              ${SPEEDS.map((s) => `<button type="button" data-speed="${s}" aria-pressed="${s === 1}">×${trim(num(s, 2))}</button>`).join('')}
            </div>
          </div>
        </section>

        <div class="dl-side">
          <section class="dl-win dl-matrix" aria-label="Mundos y episodios">
            <div class="dl-bar"><span>prueba — ${worlds.length} mundos × ${Math.max(...worlds.map((w) => w.eps.length))} episodios</span><span>${completed}/${total} completos</span></div>
            <div class="dl-grid">
              ${worlds.map((world) => `
              <div class="dl-row" role="group" aria-label="${esc(world.title)}">
                <button class="dl-world" type="button" data-world="${world.row}" aria-label="${esc(world.title)}, ${trained.has(world.id) ? 'practicó aquí' : 'solo prueba'}: ver su primer episodio">
                  <b>${esc(world.title)}</b>
                  <span class="${trained.has(world.id) ? 'dl-tag on' : 'dl-tag'}">${trained.has(world.id) ? 'practicó' : 'prueba'}</span>
                </button>
                <div class="dl-cells">
                  ${world.eps.map((ep) => `
                  <button class="dl-cell" type="button" data-i="${ep.index}" aria-pressed="false"
                    aria-label="${esc(world.title)}, episodio ${ep.k + 1}: ${ep.fell ? `terminó a ${num(ep.seconds, 2)} s` : 'llegó al final'} de ${num(duration, 2)} s"
                    style="--f:${Math.min(1, ep.seconds / duration)}">
                    <span class="dl-cell-s">${num(ep.seconds, 1)}</span><span class="dl-cell-mark" aria-hidden="true">${ep.fell ? '' : '✓'}</span><i aria-hidden="true"></i>
                  </button>`).join('')}
                </div>
                <div class="dl-sum">
                  <b>${esc(world.completed)}/${esc(world.episodes)}</b>
                  <span>${num(world.seconds.mean, 2)} s</span>
                </div>
              </div>`).join('')}
            </div>
            <p class="dl-legend"><i class="dl-legend-bar" aria-hidden="true"></i>Segundos que siguió el clip, sobre ${num(duration, 2)} s · <b>✓</b> llegó al final · a la derecha: completos y media</p>
          </section>

          <section class="dl-win dl-episode" aria-live="polite">
            <div class="dl-bar"><span class="dl-ep-title">episodio</span><span class="dl-ep-world"></span></div>
            <div class="dl-ep-body">
              <dl class="dl-stats"></dl>
              <ul class="dl-params"></ul>
              <p class="dl-ep-end"></p>
              <p class="dl-ep-peak"></p>
              <p class="dl-ep-why"></p>
            </div>
          </section>
        </div>

        <section class="dl-win dl-tele" aria-label="Telemetría del episodio">
          <div class="dl-bar">
            <span class="dl-tele-title">telemetría — ${LANES.length} canales · 25 Hz</span>
            <span class="dl-tools">
              <span class="dl-seg" role="group" aria-label="Eje del tiempo">
                <button type="button" data-axis="episode" aria-pressed="true">Episodio</button>
                <button type="button" data-axis="clip" aria-pressed="false">Clip · ${num(duration, 2)} s</button>
              </span>
              <button class="dl-table-toggle" type="button" aria-pressed="false">Tabla</button>
            </span>
          </div>
          <div class="dl-plot">
            <svg class="dl-svg" role="img" aria-label="Fuerza de cada pie, error de pose, error y altura de la pelvis del episodio elegido"></svg>
            <div class="dl-table" hidden></div>
            <p class="dl-plot-msg">Cargando la repetición…</p>
          </div>
        </section>
      </div>
      </div>

      <div class="dl-more">
        <section class="dl-win dl-train" aria-label="Entrenamiento">
          <div class="dl-bar"><span>entrenamiento — checkpoints</span><span>${esc(policy.id ?? '')}</span></div>
          <div class="dl-train-body"></div>
        </section>
        <section class="dl-win dl-files" id="dl-files" aria-label="Descargas">
          <div class="dl-bar"><span>archivos — lo que se llevan</span><span>${m.files?.length ?? 0} · ${bytes((m.files ?? []).reduce((sum, f) => sum + (f.bytes ?? 0), 0))}</span></div>
          <ul class="dl-file-list">
            ${(m.files ?? []).map((file) => {
              const href = url(file.name);
              return `
            <li>
              <span class="dl-file-name dl-mono">${esc(file.name)}</span>
              <span class="dl-file-what">${esc(file.what)}</span>
              <span class="dl-file-size dl-mono">${bytes(file.bytes ?? 0)}</span>
              ${href ? `<a class="dl-get" href="${esc(href)}" download="${esc(file.name)}">Descargar</a>` : '<span class="dl-get off">No incluido</span>'}
            </li>`;
            }).join('')}
          </ul>
        </section>
        <section class="dl-win dl-guide" aria-label="Qué es cada cosa">
          <div class="dl-bar"><span>léeme — qué es cada cosa</span><span>formatos</span></div>
          <div class="dl-guide-body">${guideHTML(m, episodes)}</div>
        </section>
      </div>
      <div class="dl-tip" role="tooltip" hidden></div>
    </section>`;

  const $ = (selector) => root.querySelector(selector);
  const $$ = (selector) => [...root.querySelectorAll(selector)];
  const tip = $('.dl-tip');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cleanups = [];
  const listen = (target, type, fn, options) => {
    target.addEventListener(type, fn, options);
    cleanups.push(() => target.removeEventListener(type, fn, options));
  };

  let sel = order[0]?.index ?? 0;
  let t = 0; // s from the episode's start
  let playing = !reduced; // a reader who asked for less motion starts it themselves
  let speed = 1;
  let scrubbing = false;
  let axis = 'episode';
  let tableShown = false;
  let replay = null; // { hz, series: [...] } once replay.json is in
  let scales = null; // lane key -> top of its axis
  let plot = null; // the telemetry geometry of the last draw, for the playhead and the pointer
  let view = null;
  let saved = null; // the camera offset the previous screen left, given back on unmount
  let worldBusy = null; // a world change in progress (the stones rebuild the model)
  let noteTimer = 0; // the HUD's "cargando…" during that change
  let gone = false;

  // ---- Tooltip: one for the page, filled with textContent (server deliveries are not ours) ----

  function showTip(target, rows, at) {
    tip.replaceChildren(...rows.map(([strong, rest]) => {
      const line = document.createElement('p');
      if (strong) line.append(Object.assign(document.createElement('b'), { textContent: strong }));
      if (rest) line.append(document.createTextNode(strong ? ` ${rest}` : rest));
      return line;
    }));
    tip.hidden = false;
    const box = at ?? target.getBoundingClientRect();
    const { width, height } = tip.getBoundingClientRect();
    const x = Math.min(Math.max(8, box.left + box.width / 2 - width / 2), innerWidth - width - 8);
    const above = box.top - height - 10;
    tip.style.transform = `translate(${x}px, ${above > 8 ? above : box.bottom + 10}px)`;
  }
  const hideTip = () => (tip.hidden = true);
  // Hover and keyboard focus show a tooltip. A finger shows it only while it is down: the focus a
  // tap leaves on a button is not :focus-visible, so it does not bring the tooltip back over the
  // rows below.
  function tipOn(target, rows) {
    const tell = () => showTip(target, rows());
    listen(target, 'pointerenter', tell);
    listen(target, 'pointerleave', hideTip);
    listen(target, 'pointerup', (event) => event.pointerType !== 'mouse' && hideTip());
    listen(target, 'focus', () => target.matches(':focus-visible') && tell());
    listen(target, 'blur', hideTip);
  }

  const paramsRows = (values) => PARAMS.map((param) => [paramText(param, values[param.key]), param.name.toLowerCase()]);

  // Half of an element (or of the window, for one taller than it) in the window counts as seen.
  function onScreen(el) {
    const box = el.getBoundingClientRect();
    const seen = Math.min(box.bottom, innerHeight) - Math.max(box.top, 0);
    return seen >= Math.min(box.height, innerHeight) / 2;
  }

  // ---- Matrix ----

  const cells = $$('.dl-cell');
  const cellOf = (index) => cells.find((cell) => Number(cell.dataset.i) === index);
  // The one-column layout (delivery.css, max-width: 1099px) puts the robot above the matrix, out of
  // sight once the matrix is scrolled to: a pick there brings the robot back into view.
  const oneColumn = matchMedia('(max-width: 1099px)');
  function pick(index) {
    select(index);
    if (oneColumn.matches && !onScreen($('.dl-view'))) $('.dl-sim').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  }
  for (const cell of cells) {
    const ep = episodes[Number(cell.dataset.i)];
    cell.onclick = () => pick(ep.index);
    tipOn(cell, () => [
      [`${worldOf(ep).title} · episodio ${ep.k + 1}`, ''],
      [ep.fell ? `${num(ep.seconds, 2)} s` : 'Llegó al final', ep.fell ? `de ${num(duration, 2)} s: se cayó o se alejó del camino` : `del clip, ${num(duration, 2)} s`],
      ...paramsRows(ep.params),
    ]);
  }
  for (const label of $$('.dl-world')) {
    const world = worlds[Number(label.dataset.world)];
    label.onclick = () => world.eps.length && pick(world.eps[0].index);
    tipOn(label, () => [
      [world.title, trained.has(world.id) ? '· practicó aquí' : '· solo prueba, no practicó aquí'],
      [`${world.completed}/${world.episodes}`, `completos · media ${num(world.seconds.mean, 2)} s (${num(world.seconds.min, 2)} a ${num(world.seconds.max, 2)})`],
      ...PARAMS.map((param) => [rangeText(param, world.params[param.key]), `${param.name.toLowerCase()}, sorteado por episodio`]),
    ]);
  }

  // ---- The selected episode ----

  function select(index, { focus = false } = {}) {
    sel = index;
    t = 0;
    for (const cell of cells) {
      const on = Number(cell.dataset.i) === index;
      cell.classList.toggle('on', on);
      cell.setAttribute('aria-pressed', String(on));
      cell.tabIndex = on ? 0 : -1; // one tab stop for the matrix; the arrows move inside it
    }
    for (const label of $$('.dl-world')) label.classList.toggle('on', Number(label.dataset.world) === episodes[index].row);
    if (focus) cellOf(index)?.focus();
    renderEpisode();
    renderTelemetry();
    syncWorld();
  }

  function renderEpisode() {
    const ep = episodes[sel];
    const world = worldOf(ep);
    $('.dl-ep-title').textContent = `ep ${pad2(ep.index + 1)} / ${total} · ${world.title.toLowerCase()} #${ep.k + 1}`;
    $('.dl-ep-world').textContent = trained.has(world.id) ? 'practicó aquí' : 'no practicó aquí';
    $('.dl-hud-ep').textContent = `EP ${pad2(ep.index + 1)}/${total} · ${world.title}`;
    $('.dl-hud-state').textContent = ep.fell ? `terminó a ${num(ep.seconds, 2)} s` : 'llegó al final';
    $('.dl-hud-state').classList.toggle('done', !ep.fell);
    const degrees = (ep.pose_error * 180) / Math.PI;
    const peak = sharedPeak(ep, world);
    $('.dl-stats').innerHTML = `
      <div><dt>Duró</dt><dd><b>${num(ep.seconds, 2)}</b> s <small>de ${num(duration, 2)}</small></dd></div>
      <div><dt>Error de pose</dt><dd><b>${num(ep.pose_error, 3)}</b> rad <small>${num(degrees, 1)}° media</small></dd></div>
      <div><dt>Error de pelvis 3D</dt><dd><b>${num(ep.pelvis_error, 2)}</b> m <small>máximo, en 3D</small></dd></div>
      <div><dt>Pico de fuerza</dt><dd><b>${int.format(Math.round(ep.foot_force_peak))}</b> N <small>${peak ? `un pie · igual en ${world.eps.length}` : 'un pie'}</small></dd></div>`;
    $('.dl-ep-peak').textContent = peak;
    $('.dl-params').innerHTML = PARAMS.map((param) => {
      const [lo, hi] = spans[param.key];
      const [wlo, whi] = world.params[param.key];
      const at = (v) => (hi > lo ? (100 * (v - lo)) / (hi - lo) : 50);
      return `
        <li>
          <span class="dl-param-name">${param.name}</span>
          <span class="dl-range" aria-hidden="true"><i class="dl-band" style="left:${at(wlo)}%;width:${Math.max(0.6, at(whi) - at(wlo))}%"></i><b style="left:${at(ep.params[param.key])}%"></b></span>
          <span class="dl-param-value dl-mono">${esc(paramText(param, ep.params[param.key]))}</span>
          <span class="dl-param-span dl-mono">${esc(rangeText(param, world.params[param.key]))}</span>
        </li>`;
    }).join('');
    // The world file's own reason for its ranges (physics/worlds/<id>.json), the same the training read.
    const why = WORLDS.find((w) => w.id === world.id)?.why;
    $('.dl-ep-why').textContent = why ? `${world.title}: ${why}` : '';
    $('.dl-ep-end').textContent = ep.fell
      ? `Terminó a ${num(ep.seconds, 2)} s: se cayó (pelvis bajo 0,5 m o torso inclinado más de 60°) o su pelvis se alejó más de 0,6 m del camino. La franja es el rango del mundo; la marca, el valor sorteado.`
      : `Siguió el clip hasta el final, ${num(duration, 2)} s. La franja es el rango del mundo; la marca, el valor sorteado.`;
    fadeEpisode();
  }

  // Every episode of a world with the same force peak (the flat floor's eight) reads like a copy
  // error, so the card says why, once: a world that varies only its pushes runs the same episode
  // until the first push, and a peak before it is the same in all.
  function sharedPeak(ep, world) {
    const n = world.eps.length;
    if (n < 2 || !world.eps.every((other) => other.foot_force_peak === ep.foot_force_peak)) return '';
    const value = `${int.format(Math.round(ep.foot_force_peak))} N`;
    const onlyPushes = PARAMS.every(({ key }) => key === 'push_n' || world.params[key]?.[0] === world.params[key]?.[1]);
    if (!onlyPushes) return `Pico de fuerza: los ${n} episodios de este mundo marcan el mismo, ${value}.`;
    // When the peak happened, from the replay (once it is in, and if its 25 Hz rows kept the peak).
    const s = replay?.series[ep.index];
    let at = null;
    if (s) {
      let best = 0;
      for (let r = 0; r < s.n; r++) if (Math.max(s.left[r], s.right[r]) > Math.max(s.left[best], s.right[best])) best = r;
      if (Math.abs(Math.max(s.left[best], s.right[best]) - ep.foot_force_peak) < 0.5) at = s.times[best];
    }
    if (at !== null && at >= FIRST_PUSH_S) return `Pico de fuerza: los ${n} episodios de este mundo marcan el mismo, ${value}.`;
    return `Pico de fuerza: los ${n} episodios de este mundo marcan el mismo, ${value}${at !== null ? ` a ${num(at, 2)} s, al pisar` : ''}. Aquí solo cambia el empujón, y el primero llega a los ${FIRST_PUSH_S} s o después: hasta ahí los ${n} son idénticos.`;
  }

  // A card taller than its window (a short screen, 1280 x 720) scrolls inside itself; while there is
  // more below, its bottom fades (delivery.css). 2 px of slack for fractional scroll positions.
  const epBody = $('.dl-ep-body');
  function fadeEpisode() {
    epBody.classList.toggle('more', epBody.scrollTop + epBody.clientHeight < epBody.scrollHeight - 2);
  }
  listen(epBody, 'scroll', fadeEpisode, { passive: true });

  // ---- Replay data ----

  const series = () => replay?.series[sel] ?? null;

  // The replay row at `time`, with its fraction toward the next: rows are 1 / hz apart, except an
  // appended last row (see FIRST_ROW_S), which can sit closer to the one before it.
  function rowAt(s, time) {
    if (s.n < 2) return 0;
    const k = s.n - 2;
    if (time >= s.times[k]) {
      const gap = s.times[k + 1] - s.times[k];
      return gap > 0 ? Math.min(k + (time - s.times[k]) / gap, k + 1) : k + 1;
    }
    return Math.max((time - FIRST_ROW_S) * replay.hz, 0);
  }

  function valueAt(s, key, time) {
    const x = rowAt(s, time);
    const i = Math.floor(x);
    const j = Math.min(i + 1, s.n - 1);
    return s[key][i] + (s[key][j] - s[key][i]) * (x - i);
  }

  // The pose at `time`, blended between the two replay rows around it (25 Hz under a 60 Hz screen).
  const pose = new Float64Array(36);
  function poseAt(s, time) {
    const x = rowAt(s, time);
    const i = Math.floor(x);
    const a = s.qpos[i];
    const b = s.qpos[Math.min(i + 1, s.n - 1)];
    const k = x - i;
    // q and -q are the same turn: blend toward the nearer one, or the pelvis spins between rows.
    const flip = a[3] * b[3] + a[4] * b[4] + a[5] * b[5] + a[6] * b[6] < 0 ? -1 : 1;
    for (let c = 0; c < a.length; c++) {
      const bc = c >= 3 && c < 7 ? flip * b[c] : b[c];
      pose[c] = a[c] + (bc - a[c]) * k;
    }
    const norm = Math.hypot(pose[3], pose[4], pose[5], pose[6]);
    for (let c = 3; c < 7; c++) pose[c] /= norm;
    return pose;
  }

  const replayUrl = url(m.replay);
  if (replayUrl) {
    fetch(replayUrl, { signal })
      .then((response) => {
        if (!response.ok) throw new Error(`replay.json: HTTP ${response.status}`);
        return response.json();
      })
      .then((data) => {
        if (gone) return;
        const hz = data.hz;
        replay = {
          hz,
          series: data.episodes.map((ep, index) => {
            const n = ep.qpos.length;
            const seconds = episodes[index]?.seconds;
            const times = Array.from({ length: n }, (_, r) => FIRST_ROW_S + r / hz);
            // More rows than the rule fits in the episode: the last one was appended, at its end.
            if (n > 1 && seconds > 0 && times[n - 1] > seconds + ROW_SLACK_S) times[n - 1] = Math.max(seconds, times[n - 2]);
            return {
              n,
              times,
              // Where the replay stops: the episode's own end, as the matrix and the HUD say it, also
              // when halving dropped its last row (the pose holds the row before).
              end: Math.max(times[n - 1], seconds > 0 ? seconds : 0),
              qpos: ep.qpos,
              left: ep.foot_force.map((f) => f[0]),
              right: ep.foot_force.map((f) => f[1]),
              pose: ep.pose_error,
              pelvis: ep.pelvis_error,
              height: ep.qpos.map((q) => q[2]),
            };
          }),
        };
        const top = (key) => Math.max(...replay.series.flatMap((s) => s[key]));
        const force = niceCeil(Math.max(top('left'), top('right')));
        scales = {
          left: force,
          right: force,
          pose: niceCeil(top('pose')),
          pelvis: niceCeil(Math.max(top('pelvis'), OFF_PATH_M * 1.15)), // room above the cut line for its label
          height: niceCeil(top('height')),
        };
        $('.dl-plot-msg').hidden = true;
        $('.dl-tele-title').textContent = `telemetría — ${LANES.length} canales · ${hz} Hz`;
        $('.dl-sim-info').textContent = `dataset ${DATASET_HZ} → ${hz} Hz`;
        renderEpisode(); // the shared force peak can now say when it happened
        renderTelemetry();
      })
      .catch((error) => {
        if (gone || signal.aborted) return;
        console.error(error);
        $('.dl-plot-msg').textContent = 'No se pudo cargar la repetición de los episodios.';
      });
  } else {
    $('.dl-plot-msg').textContent = 'Esta entrega no trae la repetición de los episodios.';
  }

  // ---- Telemetry ----

  const svg = $('.dl-svg');
  const plotBox = $('.dl-plot');

  function svgEl(name, attrs = {}, parent = null) {
    const el = document.createElementNS(SVG_NS, name);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    parent?.append(el);
    return el;
  }

  function renderTelemetry() {
    const s = series();
    if (tableShown) renderTable();
    if (!s) return;
    const ep = episodes[sel];
    const { width: W, height: H } = svg.getBoundingClientRect();
    if (W < 10 || H < 10) return;
    // The label column holds a lane's name with its top value on the same line ("ALTURA DE PELVIS",
    // "1 M" in 9.5 px mono: about 140 px) and its live value below. Under 560 px (a phone's chart is
    // about 320 px) that column would leave the traces less than 400 px, so the short names and no
    // top values go in 92 px, the widest short name ("ERR. PELVIS 3D") plus a little air.
    const narrow = W < 560;
    const labelW = narrow ? 92 : 148;
    const padR = 12;
    const padT = 6;
    const axisH = 20;
    const gap = 6;
    const laneH = (H - padT - axisH - gap * (LANES.length - 1)) / LANES.length;
    const x0 = labelW;
    const x1 = W - padR;
    const span = axis === 'clip' ? duration : Math.max(s.end, ep.seconds);
    const x = (time) => x0 + (Math.min(Math.max(time, 0), span) / span) * (x1 - x0);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.replaceChildren();

    const defs = svgEl('defs', {}, svg);
    const hatch = svgEl('pattern', { id: 'dl-hatch', width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
    svgEl('line', { x1: 0, y1: 0, x2: 0, y2: 6, class: 'dl-hatch-line' }, hatch);

    const lanes = LANES.map((lane, i) => {
      const top = padT + i * (laneH + gap);
      const base = top + laneH;
      const max = scales[lane.key];
      const y = (v) => base - (Math.min(Math.max(v, 0), max) / max) * laneH;
      const g = svgEl('g', { class: 'dl-lane' }, svg);
      svgEl('line', { x1: x0, x2: x1, y1: top + 0.5, y2: top + 0.5, class: 'dl-gl' }, g);
      svgEl('line', { x1: x0, x2: x1, y1: base - 0.5, y2: base - 0.5, class: 'dl-base' }, g);
      // The lane's top value, as a y axis would put it: at the plot's left edge, in the label column.
      if (!narrow) svgEl('text', { x: x0 - 8, y: top + 8, class: 'dl-tick', 'text-anchor': 'end' }, g).textContent = `${trim(num(max, 2))} ${lane.unit}`;
      const name = svgEl('text', { x: 0, y: top + 10, class: 'dl-lane-name' }, g);
      name.textContent = narrow ? lane.short : lane.name;
      const value = svgEl('text', { x: 0, y: Math.min(base - 2, top + 30), class: 'dl-lane-value' }, g);
      if (lane.limit !== undefined) {
        const ly = y(lane.limit);
        svgEl('line', { x1: x0, x2: x1, y1: ly, y2: ly, class: 'dl-limit' }, g);
        // At the left, where every episode starts far from its limit, so the trace never covers it.
        svgEl('text', { x: x0 + 4, y: ly - 3, class: 'dl-limit-label' }, g).textContent = narrow ? lane.limitShort : lane.limitLabel;
      }
      const values = s[lane.key];
      let line = '';
      for (let r = 0; r < s.n; r++) line += `${r ? 'L' : 'M'}${x(s.times[r]).toFixed(1)},${y(values[r]).toFixed(1)}`;
      const lastX = x(s.times[s.n - 1]).toFixed(1);
      svgEl('path', { d: `${line}L${lastX},${base}L${x(s.times[0]).toFixed(1)},${base}Z`, class: 'dl-area' }, g);
      svgEl('path', { d: line, class: 'dl-line' }, g);
      return { lane, y, value, top, base };
    });

    const bottom = padT + LANES.length * laneH + (LANES.length - 1) * gap;
    // On the clip's axis, the part the episode never reached is marked as such.
    if (axis === 'clip' && ep.seconds < duration) {
      const ex = x(ep.seconds);
      svgEl('rect', { x: ex, y: padT, width: Math.max(0, x1 - ex), height: bottom - padT, class: 'dl-nodata' }, svg);
      svgEl('line', { x1: ex, x2: ex, y1: padT, y2: bottom, class: 'dl-end' }, svg);
      if (x1 - ex > 120) svgEl('text', { x: ex + 8, y: padT + 12, class: 'dl-end-label' }, svg).textContent = `sin datos: terminó a ${num(ep.seconds, 2)} s`;
    }

    // Time axis: about one tick per 70 px, at a clean step.
    const step = [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5].find((st) => span / st <= (x1 - x0) / 70) ?? 5;
    const ticks = svgEl('g', { class: 'dl-axis' }, svg);
    for (let v = 0; v <= span + 1e-6; v += step) {
      const tx = x(v);
      svgEl('line', { x1: tx, x2: tx, y1: bottom, y2: bottom + 4 }, ticks);
      svgEl('text', { x: tx, y: H - 4, 'text-anchor': 'middle' }, ticks).textContent = `${trim(num(v, 2))} s`;
    }

    const cross = svgEl('line', { y1: padT, y2: bottom, class: 'dl-cross', visibility: 'hidden' }, svg);
    const head = svgEl('g', { class: 'dl-head' }, svg);
    svgEl('line', { x1: 0, x2: 0, y1: padT - 2, y2: bottom + 2 }, head);
    const dots = lanes.map(() => svgEl('circle', { r: 4, cx: 0, class: 'dl-dot' }, svg));
    const hit = svgEl('rect', { x: x0, y: padT, width: x1 - x0, height: bottom - padT, class: 'dl-hit' }, svg);
    plot = { s, x, x0, x1, span, lanes, head, dots, cross, hit, bottom };
    bindPlotPointer(hit);
    updatePlayhead();
  }

  function timeAtPointer(event) {
    const box = svg.getBoundingClientRect();
    const px = event.clientX - box.left;
    return ((Math.min(Math.max(px, plot.x0), plot.x1) - plot.x0) / (plot.x1 - plot.x0)) * plot.span;
  }

  function bindPlotPointer(hit) {
    hit.onpointerdown = (event) => {
      hit.setPointerCapture(event.pointerId);
      scrubbing = true;
      seek(timeAtPointer(event));
    };
    hit.onpointermove = (event) => {
      const s = plot.s;
      const time = timeAtPointer(event);
      if (scrubbing) seek(time);
      // The crosshair snaps to the nearest replay row, the values it shows are that row's.
      const r = Math.round(rowAt(s, time));
      const rowT = s.times[r];
      const inData = time <= s.end + 0.5 / replay.hz;
      plot.cross.setAttribute('visibility', 'visible');
      plot.cross.setAttribute('x1', plot.x(inData ? rowT : time));
      plot.cross.setAttribute('x2', plot.x(inData ? rowT : time));
      const box = svg.getBoundingClientRect();
      const at = { left: box.left + plot.x(inData ? rowT : time) - 1, width: 2, top: box.top + 8, bottom: box.top + 8 };
      showTip(hit, inData
        ? [[`${num(rowT, 2)} s`, ''], ...LANES.map((lane) => [`${num(s[lane.key][r], lane.digits)} ${lane.unit}`, lane.name.toLowerCase()])]
        : [[`${num(time, 2)} s`, `sin datos: el episodio terminó a ${num(episodes[sel].seconds, 2)} s`]], at);
    };
    const leave = () => {
      plot?.cross.setAttribute('visibility', 'hidden');
      hideTip();
    };
    const end = (event) => {
      scrubbing = false;
      if (event.pointerType !== 'mouse') leave(); // a finger lifted: nothing is hovering any more
    };
    hit.onpointerup = end;
    hit.onpointercancel = end;
    hit.onpointerleave = leave;
  }

  function renderTable() {
    const s = series();
    const box = $('.dl-table');
    if (!s) return void (box.textContent = '');
    const head = `<tr><th>t (s)</th>${LANES.map((lane) => `<th>${lane.name} (${lane.unit})</th>`).join('')}</tr>`;
    let rows = '';
    for (let r = 0; r < s.n; r++) {
      rows += `<tr><td>${num(s.times[r], 2)}</td>${LANES.map((lane) => `<td>${num(s[lane.key][r], lane.digits)}</td>`).join('')}</tr>`;
    }
    box.innerHTML = `<table><caption>Episodio ${sel + 1}, una fila cada ${num(1000 / replay.hz, 0)} ms</caption><thead>${head}</thead><tbody>${rows}</tbody></table>`;
  }

  // ---- Playback: the clock, the playhead and the robot ----

  const scrub = $('.dl-scrub');
  const timeOut = $('.dl-time');
  const hudT = $('.dl-hud-t');
  const feet = { left: $('[data-foot="left"]'), right: $('[data-foot="right"]') };

  function seek(time) {
    const s = series();
    if (!s) return;
    t = Math.min(Math.max(time, 0), s.end);
  }

  function updatePlayhead() {
    const s = series();
    if (!s) return;
    const shown = Math.min(t, s.end);
    scrub.max = s.end.toFixed(2);
    if (document.activeElement !== scrub || !scrubbing) scrub.value = shown.toFixed(2);
    timeOut.textContent = `${num(shown, 2)} / ${num(s.end, 2)} s`;
    hudT.textContent = `t ${num(shown, 2)} s`;
    // A foot is down when the floor pushes on it: the replay row's force, not a blend of two rows.
    const row = Math.round(rowAt(s, shown));
    feet.left.classList.toggle('on', s.left[row] > 0);
    feet.right.classList.toggle('on', s.right[row] > 0);
    if (!plot || plot.s !== s) return;
    const hx = plot.x(shown);
    plot.head.setAttribute('transform', `translate(${hx.toFixed(1)},0)`);
    plot.lanes.forEach(({ lane, y, value }, i) => {
      const v = valueAt(s, lane.key, shown);
      plot.dots[i].setAttribute('cx', hx.toFixed(1));
      plot.dots[i].setAttribute('cy', y(v).toFixed(1));
      value.textContent = `${num(v, lane.digits)} ${lane.unit}`;
    });
  }

  function setPlaying(next) {
    playing = next;
    $('.dl-play').classList.toggle('paused', !playing);
    $('.dl-play').setAttribute('aria-label', playing ? 'Pausa' : 'Reproducir');
  }
  setPlaying(playing);
  $('.dl-play').onclick = () => setPlaying(!playing);
  scrub.oninput = () => {
    scrubbing = true;
    seek(Number(scrub.value));
  };
  scrub.onchange = () => (scrubbing = false);
  listen(scrub, 'pointerup', () => (scrubbing = false));
  for (const button of $$('[data-speed]')) {
    button.onclick = () => {
      speed = Number(button.dataset.speed);
      for (const b of $$('[data-speed]')) b.setAttribute('aria-pressed', String(b === button));
    };
  }
  for (const button of $$('[data-axis]')) {
    button.onclick = () => {
      axis = button.dataset.axis;
      for (const b of $$('[data-axis]')) b.setAttribute('aria-pressed', String(b === button));
      renderTelemetry();
    };
  }
  $('.dl-table-toggle').onclick = (event) => {
    tableShown = !tableShown;
    event.currentTarget.setAttribute('aria-pressed', String(tableShown));
    $('.dl-table').hidden = !tableShown;
    svg.style.visibility = tableShown ? 'hidden' : '';
    renderTelemetry();
  };
  for (const button of $$('[data-jump]')) {
    button.onclick = () => document.getElementById(button.dataset.jump)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  }

  let last = performance.now();
  let frameId = requestAnimationFrame(function frame(now) {
    const wall = Math.min(MAX_FRAME_S, Math.max(0, (now - last) / 1000));
    last = now;
    const s = series();
    if (s) {
      if (playing && !scrubbing) {
        t += wall * speed;
        if (t > s.end + HOLD_END_S) t = 0; // start over, after holding the last pose
      }
      // The robot copies the row at t (mj_forward only, so a paused robot costs next to nothing),
      // also while the stones rebuild: the new model is in place before setWorld's first await.
      if (view) view.sim.puppet(poseAt(s, Math.min(t, s.end)));
      updatePlayhead();
    }
    frameId = requestAnimationFrame(frame);
  });

  // ---- The robot ----

  const pane = $('.dl-view');
  const host = attachRobot(pane);
  if (robotView()) pane.classList.add('ready');
  const stopProgress = onRobotProgress(({ done, total, compiling, policy: loadingPolicy }) => {
    $('.dl-boot-fill').style.width = `${(100 * done) / total}%`;
    $('.dl-boot-text').textContent = loadingPolicy
      ? 'Terminando de preparar al robot…'
      : compiling ? 'Armando al robot en MuJoCo…' : `Descargando MuJoCo y el G1 · ${Math.round((100 * done) / total)} %`;
  });
  host.ready
    .then((loaded) => {
      if (!loaded || gone) return;
      view = loaded;
      pane.classList.add('ready');
      // The walker's side, a little ahead; the follow keeps this offset as the pelvis moves.
      const { camera, controls } = view.viewer;
      saved = { x: camera.position.x - controls.target.x, y: camera.position.y - controls.target.y, z: camera.position.z - controls.target.z };
      camera.position.set(controls.target.x + CAMERA_OFFSET.x, controls.target.y + CAMERA_OFFSET.y, controls.target.z + CAMERA_OFFSET.z);
      syncWorld();
    })
    .catch((error) => {
      console.error(error);
      $('.dl-boot-text').textContent = 'No se pudo cargar el robot. Recarga la página para intentar de nuevo.';
    });

  // Puts the robot in the selected episode's world. Only the stones change the floor (and rebuild
  // the model, a moment); the other worlds differ in grip, wind, mass and motors, which a replay
  // without dynamics does not use, but view.world() stays true to what is shown. Clicks during a
  // rebuild are not queued: the one running checks again when it ends.
  function syncWorld() {
    if (!view || gone || worldBusy) return;
    const want = episodes[sel].world;
    if ((view.world()?.id ?? 'plano') === want) return;
    const world = WORLDS.find((w) => w.id === want);
    if (!world) return; // a world this build does not know: the flat floor stands in
    // A rebuild shorter than 150 ms (the flat floor) says nothing, instead of flashing the note.
    noteTimer = setTimeout(() => {
      if (!gone) $('.dl-hud-state').textContent = `cargando ${world.title.toLowerCase()}…`;
    }, 150);
    worldBusy = view.setWorld(world)
      .catch((error) => console.error(error))
      .finally(() => {
        clearTimeout(noteTimer);
        worldBusy = null;
        if (gone) return;
        renderEpisode();
        syncWorld();
      });
  }

  // ---- Keyboard: space plays and pauses, the arrows walk the matrix ----

  // The keys drive the replay only while it is in sight: focus inside the main view, or the robot,
  // the matrix or the chart on screen. Below them (the downloads, the guide) space scrolls the page.
  const watched = [$('.dl-sim'), $('.dl-matrix'), $('.dl-tele')];
  const watching = (target) => {
    if (target instanceof Element && target.closest('.dl-more')) return false;
    if (target instanceof Element && target.closest('.dl-main')) return true;
    return watched.some(onScreen);
  };
  const typing = (target) => target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) && target !== scrub;
  let tookSpace = false;
  listen(window, 'keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey || typing(event.target)) return;
    if (![' ', 'ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(event.key) || !watching(event.target)) return;
    const inMatrix = event.target instanceof Element && event.target.closest('.dl-grid');
    const at = order.findIndex((ep) => ep.index === sel);
    if (event.key === ' ') {
      event.preventDefault();
      tookSpace = true;
      setPlaying(!playing);
    } else if ((event.key === 'ArrowRight' || event.key === 'ArrowLeft') && event.target !== scrub) {
      event.preventDefault();
      const next = order[(at + (event.key === 'ArrowRight' ? 1 : -1) + order.length) % order.length];
      select(next.index, { focus: Boolean(inMatrix) });
    } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && inMatrix) {
      event.preventDefault();
      const ep = episodes[sel];
      const row = worlds[(ep.row + (event.key === 'ArrowDown' ? 1 : -1) + worlds.length) % worlds.length];
      const next = row.eps[Math.min(ep.k, row.eps.length - 1)];
      if (next) select(next.index, { focus: true });
    }
  });
  // A focused button clicks on the space bar's keyup; the keydown above already toggled playback.
  listen(window, 'keyup', (event) => {
    if (event.key !== ' ' || !tookSpace) return;
    tookSpace = false;
    if (event.target instanceof HTMLButtonElement) event.preventDefault();
  });

  let resizeFrame = 0;
  const resize = new ResizeObserver(() => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      renderTelemetry();
      fadeEpisode();
    });
  });
  resize.observe(plotBox);
  resize.observe(epBody);
  // Any scroll, the page's or a panel's (capture: element scrolls do not bubble), moves what a
  // tooltip points at.
  listen(window, 'scroll', hideTip, { passive: true, capture: true });

  renderTraining(root.querySelector('.dl-train-body'), m, worlds, tipOn);
  const policyUrl = url(policy.json);
  if (policyUrl) {
    fetch(policyUrl, { signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((meta) => meta && !gone && ($('.dl-guide-body').innerHTML = guideHTML(m, episodes, meta)))
      .catch(() => {}); // the guide keeps the sizes by name
  }
  select(sel);

  return () => {
    gone = true;
    clearTimeout(noteTimer);
    cancelAnimationFrame(frameId);
    cancelAnimationFrame(resizeFrame);
    resize.disconnect();
    cleanups.forEach((fn) => fn());
    stopProgress();
    if (view) {
      // Give the robot back as the app screens expect it: their camera, flat ground, standing.
      const { camera, controls } = view.viewer;
      if (saved) camera.position.set(controls.target.x + saved.x, controls.target.y + saved.y, controls.target.z + saved.z);
      const loaded = view;
      const restore = () => (loaded.world() && loaded.world().id !== 'plano' ? loaded.setWorld(WORLDS.find((w) => w.id === 'plano')) : loaded.stop());
      if (worldBusy) worldBusy.then(restore);
      else restore();
    }
    host.detach();
  };
}

// The training ladder: how much of the clip each checkpoint follows, against its steps. When the
// delivery has none (the checkpoints were not kept), it says so, with the final policy's numbers.
function renderTraining(box, m, worlds, tipOn) {
  const policy = m.policy ?? {};
  const duration = m.duration_s;
  const ladder = [...(m.checkpoints ?? [])].sort((a, b) => a.steps - b.steps);
  const plano = worlds.find((world) => world.id === 'plano');
  const facts = `
    <dl class="dl-train-facts">
      <div><dt>Política final</dt><dd><b>${policy.steps ? num(policy.steps / 1e6, 1) : '—'}</b> M pasos</dd></div>
      <div><dt>Sigue el clip</dt><dd><b>${policy.followed_s != null ? num(policy.followed_s, 2) : '—'}</b> s de ${num(duration, 2)}</dd></div>
      <div><dt>Practicó en</dt><dd>${esc(worlds.filter((w) => (policy.trained_worlds ?? []).includes(w.id)).map((w) => w.title).join(', ') || '—')}</dd></div>
    </dl>
    <p class="dl-train-note">"Sigue el clip" se mide en el piso plano, sin empujones ni ruido (training/evaluate_walk.py): los segundos desde el principio sin caerse ni alejarse 0,6 m del camino.${plano ? ` La prueba de arriba sí empuja al robot, así que mide otra cosa: en el plano duró ${num(plano.seconds.mean, 2)} s de media.` : ''}</p>`;
  if (!ladder.length) {
    box.innerHTML = `${facts}<p class="dl-train-empty">Esta entrega no trae la escalera: los checkpoints intermedios de ${esc(policy.id ?? 'la política')} no quedaron guardados con su medida, así que solo se entrega la política final.</p>`;
    return;
  }
  // The final policy is the ladder's last step, if the list does not already end with it.
  if (policy.steps && policy.followed_s != null && ladder.at(-1).steps !== policy.steps) ladder.push({ steps: policy.steps, followed_s: policy.followed_s, final: true });
  else ladder.at(-1).final = true;
  const W = 640;
  const H = 220;
  const padding = { l: 44, r: 16, t: 14, b: 26 };
  const maxSteps = niceCeil(ladder.at(-1).steps / 1e6);
  const x = (steps) => padding.l + (steps / 1e6 / maxSteps) * (W - padding.l - padding.r);
  const y = (seconds) => H - padding.b - (seconds / duration) * (H - padding.t - padding.b);
  // Clean seconds up to the clip's length (whose own line is labelled): about three of them.
  const yStep = [1, 2, 2.5, 5, 10, 20, 30, 60].find((st) => duration / st <= 3.5) ?? 60;
  const yTicks = Array.from({ length: Math.floor(duration / yStep + 1e-9) + 1 }, (_, i) => i * yStep);
  const xTicks = [0, maxSteps / 2, maxSteps];
  const line = ladder.map((c, i) => `${i ? 'L' : 'M'}${x(c.steps).toFixed(1)},${y(c.followed_s).toFixed(1)}`).join('');
  box.innerHTML = `
    <figure class="dl-ladder">
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Segundos del clip que sigue cada checkpoint, contra sus pasos de entrenamiento">
        ${yTicks.map((v) => `<line class="dl-gl" x1="${padding.l}" x2="${W - padding.r}" y1="${y(v)}" y2="${y(v)}"/><text class="dl-tick" x="${padding.l - 6}" y="${y(v) + 3}" text-anchor="end">${trim(num(v, 1))} s</text>`).join('')}
        <line class="dl-limit" x1="${padding.l}" x2="${W - padding.r}" y1="${y(duration)}" y2="${y(duration)}"/>
        <text class="dl-limit-label" x="${W - padding.r}" y="${y(duration) - 4}" text-anchor="end">clip completo · ${num(duration, 2)} s</text>
        ${xTicks.map((v) => `<text class="dl-tick" x="${x(v * 1e6)}" y="${H - 6}" text-anchor="middle">${num(v, v % 1 ? 1 : 0)} M</text>`).join('')}
        <path class="dl-line" d="${line}"/>
        ${ladder.map((c, i) => `<circle class="dl-dot${c.final ? ' final' : ''}" data-i="${i}" cx="${x(c.steps)}" cy="${y(c.followed_s)}" r="${c.final ? 5 : 4}"/>`).join('')}
        ${ladder.map((c, i) => `<circle class="dl-dot-hit" data-i="${i}" cx="${x(c.steps)}" cy="${y(c.followed_s)}" r="12" tabindex="0"/>`).join('')}
        <text class="dl-end-label" x="${x(ladder.at(-1).steps) - 8}" y="${y(ladder.at(-1).followed_s) - 10}" text-anchor="end">${num(ladder.at(-1).followed_s, 2)} s</text>
      </svg>
      <figcaption>Segundos del clip que sigue cada checkpoint (eje vertical) según sus pasos de práctica (horizontal)</figcaption>
    </figure>
    ${facts}`;
  for (const dot of box.querySelectorAll('.dl-dot-hit')) {
    const c = ladder[Number(dot.dataset.i)];
    tipOn(dot, () => [[`${num(c.followed_s, 2)} s`, `de ${num(duration, 2)} s`], [`${num(c.steps / 1e6, 1)} M`, c.final ? 'pasos · la política que se entrega' : 'pasos de práctica']]);
  }
}

// "Qué es cada cosa", for whoever opens the files: the formats, number for number, from
// docs/contrato.md and training/export.py (ONNX opset 17, input "obs", output "ctrl"). `meta` is
// policy.json once it arrives, for the policy's own sizes; until then they show by name.
function guideHTML(m, episodes, meta = null) {
  const names = new Set((m.files ?? []).map((file) => file.name));
  const mimic = (meta?.task ?? m.policy?.task) === 'mimic';
  const obs = meta?.obs_dim ?? 'obs_dim';
  const nu = meta?.nu ?? 'nu';
  const rows = Math.round(episodes.reduce((sum, ep) => sum + ep.seconds, 0) * DATASET_HZ);
  const worlds = m.worlds?.length ?? 0;
  const items = [
    ['policy.onnx', 'La política, en ONNX (opset 17)', `Entrada <code>obs</code>: float32 [n, ${esc(obs)}], lo que el robot siente${mimic ? ' y la referencia que sigue' : ''}. Salida <code>ctrl</code>: float32 [n, ${esc(nu)}], los ángulos objetivo de los motores del G1 (rad)${mimic ? ', ya con la pose de referencia sumada: se escriben tal cual en <code>data.ctrl</code>' : ''}. Una decisión cada 20 ms${meta?.mjcf ? `, sobre el modelo <code>${esc(meta.mjcf)}</code> de MuJoCo` : ''}.`],
    ['policy.json', 'La ficha de la política', 'El clip que imita, sus pasos de práctica, los mundos en que practicó, cuánto del clip sigue y el modelo de MuJoCo que necesita (<code>mjcf</code>, <code>obs_dim</code>, <code>nu</code>, <code>lookahead_s</code>).'],
    ['dataset.zip', 'Datos para entrenar robots', `<code>meta.json</code> (cada episodio: mundo, parámetros sorteados, si terminó antes y cuánto duró) y <code>rollouts.npz</code> con ${int.format(rows)} filas a ${DATASET_HZ} Hz de ${episodes.length} episodios en ${worlds} mundos: <code>episode</code> [N], <code>t</code> [N], <code>qpos</code> [N, 36], <code>qvel</code> [N, 35], <code>ctrl</code> [N, 29], <code>foot_force</code> [N, 2, 3] (N, izquierdo y derecho), <code>pose_error</code> [N] (rad) y <code>pelvis_error</code> [N] (m).`],
    ['motion.json', 'El movimiento que imita (RobotMotion)', 'La persona pasada al cuerpo del G1: <code>fps</code> y <code>qpos</code> [cuadros, 36]: la pelvis (x, y, z en m, z arriba), su cuaternión (w, x, y, z) y los 29 ángulos en rad, en el orden de <code>g1_mjx.xml</code>.'],
    ['poseclip.json', 'El esqueleto de la persona (PoseClip)', 'Los 33 puntos de MediaPipe Pose por cuadro, <code>[x, y, z, visibilidad]</code> en metros, y arriba, con el origen en las caderas del primer cuadro.'],
    ['scene.json', 'El lugar del video', 'Los objetos sobre el piso detectados en el primer cuadro: caja o cilindro, tamaño y posición en metros, giro en radianes.'],
  ].filter(([name]) => names.has(name));
  const code = `import numpy as np, onnxruntime as ort
policy = ort.InferenceSession("policy.onnx")
# obs: lo que arma MimicEnv.observe() en training/imitate.py
ctrl = policy.run(["ctrl"], {"obs": obs[None].astype(np.float32)})[0][0]

data = np.load("rollouts.npz")   # dentro de dataset.zip
first = data["qpos"][data["episode"] == 0]   # [filas, 36]`;
  return `
    <dl class="dl-formats">${items.map(([name, what, how]) => `<div><dt><span class="dl-mono">${name}</span> ${what}</dt><dd>${how}</dd></div>`).join('')}</dl>
    ${names.has('policy.onnx') && names.has('dataset.zip') ? `<pre class="dl-code"><code>${esc(code)}</code></pre>` : ''}`;
}
