// Home: the landing, told like a film. There is no stock footage: the "camera" is the real G1
// from physics/ (MuJoCo + three.js), fixed behind the page, and scrolling directs it from shot to
// shot (a close-up, the walk, the training, the legs). Over it, chapters named after the parts of
// the product (Capture, Gym, Policy) bring in the rest of the real material: the source video, the
// PoseClip skeleton from data/ and the training log of training/.
import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import * as THREE from 'three';
import '../landing/landing.css';
import curve from '../landing/training-curve.json';
import { dressStreet } from '../landing/street.js';
import { savedMotion } from '../motions.js';
import { FINAL_LEVEL, policyUrls } from '../policies.js';
import { fetchClip, preloaded } from '../preloaded.js';
import { attachRobot, onRobotProgress, robotView } from '../robot-host.js';
import { prefetch } from '../router.js';
import { SkeletonView } from '../skeleton.js';

gsap.registerPlugin(ScrollTrigger);

export const title = '';

const REPO = 'https://github.com/platanus-hack/platanus-hack-26-ve-team-26';
// The walk of Capture: the clip extracted from this very video (data/samples/mixkit-4855.mp4,
// re-encoded small into public/media). Clip and video start together and last the same 11.8 s.
const WALK = preloaded.find((item) => item.clip === 'clip_2026-10-23_caminar-perfil_01');
const WALK_VIDEO = `${import.meta.env.BASE_URL}media/caminar.mp4`;
const PUSH_N = 250; // physics/ pushes with 250 N for 0.1 s (physics/README.md)
const FALLEN_PELVIS_M = 0.45; // the standing G1 has its pelvis at 0.78 m
const GYM_PUSH_EVERY_S = 2.5; // the Gym pushes the standing robot this often, so every level shows itself
const GYM_RESTART_S = 1.6; // a fallen robot lies this long before it is stood up again
const AFTER_PUSH_S = 5; // after a push in the hero, the robot stands this long before it is reset
// The Gym in three stops of the real training, each a saved checkpoint, with what
// training/README.md measured for it: seconds standing (of 20) and 250 N pushes held (of 4).
const GYM_STAGES = [
  { level: 'g1-stand-step-0', steps: 0, verdict: 'No sirve', up: '1,1 s', pushes: '0 de 4', text: 'Sin práctica se cae en un segundo.' },
  { level: 'g1-stand-step-10000000', steps: 10e6, verdict: 'Más o menos', up: '9,6 s', pushes: '1 de 4', text: 'Ya se para, pero un empujón lo tumba casi siempre.' },
  { level: 'g1-stand', steps: 40e6, verdict: 'Estable', up: '20 s', pushes: '4 de 4', text: 'Aguanta de pie y se recupera de los empujones.' },
];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const narrow = () => innerWidth < 860;

// The shots. The camera orbits the robot's pelvis: azimuth 0 looks at the robot from the front
// (MuJoCo +x), elevation lifts it, distance in meters, aim is the height it looks at, and shift
// slides the robot across the frame (a share of the width, + to the right) to leave room for words.
const SHOTS = {
  hero: { az: 22, el: 3, dist: 1.35, aim: 1.08, shift: 0.2 },
  capture: { az: 188, el: 6, dist: 3.3, aim: 0.8, shift: 0.24 },
  gym: { az: 38, el: 12, dist: 3.7, aim: 0.75, shift: 0.2 },
  policy: { az: 78, el: -3, dist: 1.6, aim: 0.45, shift: -0.26 },
  close: { az: 140, el: 16, dist: 6.5, aim: 0.8, shift: 0 },
};
// On phones the words sit low: no sideways shift, farther away, and aimed below the robot so it
// stands in the upper half of the screen.
const narrowShot = (shot) => ({ ...shot, shift: 0, dist: shot.dist * 1.6, aim: shot.aim - 0.4 });

const num = (value, digits = 2) => value.toFixed(digits).replace('.', ',');
const steps = (n) => Math.round(n).toLocaleString('es');

export function mount(root, { api }) {
  document.documentElement.classList.add('is-landing');
  root.innerHTML = `
  <div class="landing">
    <div class="film" aria-hidden="true">
      <div class="boot">
        <p>mujoco.wasm <b class="boot-files">0/39</b></p>
        <p class="boot-line">cargando el mundo de física</p>
        <div class="boot-track"><i class="boot-bar"></i></div>
      </div>
    </div>
    <div class="film-shade" aria-hidden="true"></div>
    <div class="film-wash" aria-hidden="true"></div>

    <header class="topbar">
      <a class="wordmark" href="#/" aria-label="Tridi, inicio">
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24"/><circle cx="12" cy="6.5" r="2.6"/><path d="M12 10v6.5M7 12.5h10M12 16.5l-3.5 5M12 16.5l3.5 5"/></svg>
        Tridi
      </a>
      <nav class="topnav" aria-label="Producto">
        <a href="#capture">Capture</a>
        <a href="#gym">Gym</a>
        <a href="#policy">Policy</a>
      </nav>
      <a class="btn btn-light" href="#/en-vivo" data-warm="en-vivo">Probar en vivo</a>
    </header>

    <section class="chapter hero" id="inicio" data-shot="hero" data-mode="stand">
      <div class="hero-live"><i class="live-dot"></i>En vivo · Unitree G1 · MuJoCo</div>
      <div class="caption hero-caption">
        <h1>Robots que aprenden de un video</h1>
        <p>Grabas a una persona moviéndose. Un humanoide aprende a hacerlo igual, practicando en física real hasta no caerse.</p>
        <div class="cta-row">
          <button class="btn btn-signal hero-push" type="button" disabled>Empújalo <kbd>espacio</kbd></button>
          <a class="btn btn-ghost" href="#capture">Cómo aprende</a>
        </div>
      </div>
      <div class="hud">
        <p class="state" data-state="stand"><i></i><span>Física real · de pie con su política</span></p>
        <p class="tally"><span data-hud="pushes">0</span> empujones · <span data-hud="falls">0</span> caídas</p>
        <button class="btn btn-signal hero-push hud-push" type="button" disabled>Empújalo</button>
      </div>
      <div class="scroll-cue" aria-hidden="true"><span></span></div>
    </section>

    <section class="chapter capture" id="capture" data-shot="capture" data-mode="walk">
      <div class="sticky">
        <div class="capture-media">
          <figure class="frame frame-video">
            <video class="walk-video" src="${WALK_VIDEO}" muted playsinline loop preload="auto"></video>
            <figcaption>Video de celular · Mixkit</figcaption>
          </figure>
          <figure class="frame frame-skeleton">
            <canvas class="skeleton-canvas"></canvas>
            <figcaption>Esqueleto 3D · 33 puntos</figcaption>
          </figure>
        </div>
        <div class="caption capture-caption">
          <p class="product">Tridi Capture</p>
          <h2>De un video de celular al cuerpo del robot</h2>
          <p>Saca el esqueleto 3D de la persona, 33 puntos 30 veces por segundo, y lo pasa a las 29 articulaciones del robot con 3,2 cm de error. Aquí lo copia sin física todavía.</p>
        </div>
      </div>
    </section>

    <section class="chapter gym" id="gym" data-shot="gym" data-mode="gym">
      <div class="sticky">
        <div class="caption gym-caption">
          <p class="product">Tridi Gym</p>
          <p class="gym-text">Nadie le escribe cómo pararse: lo intenta, se cae y vuelve a intentarlo. Lo empujamos cada ${num(GYM_PUSH_EVERY_S, 1)} segundos.</p>
          <ol class="gym-stages">
            ${GYM_STAGES.map((stage, i) => `
            <li data-stage="${i}">
              <span class="stage-steps">${stage.steps ? `${stage.steps / 1e6} M` : '0'} pasos</span>
              <b class="stage-verdict">${stage.verdict}</b>
              <span class="stage-text">${stage.text}</span>
              <span class="stage-numbers">${stage.up} de pie · ${stage.pushes} empujones</span>
            </li>`).join('')}
          </ol>
          <p class="gym-status"><span data-gym="up">—</span> de pie ahora · <span data-gym="status">el robot real, con ese entrenamiento</span></p>
          <figure class="chart-fig">
            <svg class="chart" viewBox="0 0 400 150" role="img" aria-label="Segundos de pie por intento durante el entrenamiento: de 1,2 s al principio a cerca de 20 s al final"></svg>
            <figcaption>Segundos de pie por intento · ${curve.minutes} minutos en una laptop · log real</figcaption>
          </figure>
        </div>
      </div>
    </section>

    <section class="chapter policy" id="policy" data-shot="policy" data-mode="stand">
      <div class="sticky">
        <div class="caption policy-caption">
          <p class="product">Tridi Policy</p>
          <h2>Lo que entregamos cabe en un correo</h2>
          <ul class="specs">
            <li><b>265 KB</b><span>la red completa que mueve al robot</span></li>
            <li><b>29</b><span>motores que controla a la vez</span></li>
            <li><b>20 ms</b><span>entre una decisión y la siguiente</span></li>
            <li><b>&lt; 1 ms</b><span>lo que tarda en decidir</span></li>
          </ul>
          <p class="policy-note">Hoy entregamos la política de pie, que corre aquí, en tu navegador. Lo siguiente es entregar también los datos: el movimiento de la persona corregido por la física, para entrenar tu propio robot.</p>
        </div>
      </div>
    </section>

    <section class="chapter closing" id="equipos" data-shot="close" data-mode="stand">
      <div class="closing-inner">
        <p class="product">Para equipos de humanoides</p>
        <p class="lede">La IA aprendió a hablar leyendo internet. La IA física no tiene un internet de movimiento.</p>
        <h2 class="manifesto">Los robots ya tienen cuerpo. Les falta experiencia.</h2>
        <p class="closing-text">Enseñarle un movimiento nuevo a un humanoide hoy exige trajes de captura, un estudio y mucho tiempo. Con Tridi, cualquier video de una persona se vuelve práctica para tu robot.</p>
        <ol class="roadmap" aria-label="Dónde estamos">
          <li class="done"><span>Hoy</span><b>Pararse y recuperarse de empujones de ${PUSH_N} N</b></li>
          <li class="now"><span>Entrenando</span><b>Caminar como la persona del video</b></li>
          <li><span>Lo que viene</span><b>Practicar sobre piedras, viento y piso resbaloso, que ya existen en el simulador, y aprender cualquier movimiento de cualquier video</b></li>
        </ol>
        <nav class="tries" aria-label="Probar Tridi">
          <a class="try" href="#/en-vivo" data-warm="en-vivo"><span>Cámara</span><b>Muévete y el robot te copia</b></a>
          <a class="try" href="#/subir" data-warm="subir" data-route="subir"><span>Video</span><b>Sube un video: solo guardamos el movimiento</b></a>
          <a class="try" href="#/simulaciones" data-warm="simulaciones"><span>Laboratorio</span><b>Persona y robot, lado a lado</b></a>
        </nav>
      </div>
      <footer class="footer">
        <p>El motor de física es MuJoCo, el estándar en robótica; lo nuestro es todo lo que va encima. Y no es un LLM: es una red pequeña que aprendió a no caerse.</p>
        <div class="foot-row">
          <span class="wordmark big">Tridi</span>
          <dl class="foot-specs">
            <div><dt>Hecho en</dt><dd>Platanus Hack 26, Caracas</dd></div>
            <div><dt>Robot</dt><dd>Unitree G1, MuJoCo Menagerie</dd></div>
            <div><dt>Código</dt><dd><a href="${REPO}" target="_blank" rel="noopener">Abierto en GitHub</a></dd></div>
          </dl>
        </div>
      </footer>
    </section>
  </div>`;

  const $ = (selector) => root.querySelector(selector);
  const $$ = (selector) => [...root.querySelectorAll(selector)];
  let gone = false;
  const cleanups = [];
  const on = (target, type, fn, options) => {
    target.addEventListener(type, fn, options);
    cleanups.push(() => target.removeEventListener(type, fn, options));
  };

  // ---- Smooth scroll, and GSAP's scroll triggers driven by it ----
  const lenis = reducedMotion ? null : new Lenis({ lerp: 0.09 });
  const tick = (time) => lenis?.raf(time * 1000);
  if (lenis) {
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
  }
  const scrollTo = (target) => (lenis ? lenis.scrollTo(target, { duration: 1.6 }) : target.scrollIntoView());

  for (const link of $$('[data-warm]')) {
    const warm = () => prefetch(link.dataset.warm);
    link.addEventListener('pointerenter', warm, { once: true });
    link.addEventListener('focus', warm, { once: true });
  }
  for (const link of $$('a[href^="#"]:not([href^="#/"])')) {
    on(link, 'click', (event) => {
      event.preventDefault();
      const target = root.querySelector(link.getAttribute('href'));
      if (target) scrollTo(target);
    });
  }

  // ---- The film: the one robot, behind everything ----
  const film = $('.film');
  cleanups.push(
    onRobotProgress(({ done, total, compiling, policy }) => {
      $('.boot-files').textContent = `${done}/${total}`;
      $('.boot-bar').style.width = `${(100 * done) / total}%`;
      $('.boot-line').textContent = policy ? 'cargando la política entrenada' : compiling ? 'armando el G1: 29 articulaciones, 33,3 kg' : 'cargando el mundo de física';
    }),
  );
  if (robotView()) film.classList.add('ready');
  const robot = attachRobot(film);
  let view = null;
  let saved = null; // the viewer's camera as the app screens expect it, put back on unmount
  let lights = []; // the landing's extra lights
  let key = null; // the one of them that rides with the camera
  let undressStreet = () => {}; // puts the floor back as the app screens expect it

  // The camera eases toward the shot of the chapter on screen, blending between neighbours.
  const shot = { ...SHOTS.hero };
  const chapters = $$('.chapter');
  function targetShot() {
    const mid = scrollY + innerHeight * 0.5;
    let from = chapters[0];
    let to = chapters[0];
    let t = 0;
    for (let i = 0; i < chapters.length; i++) {
      const top = chapters[i].offsetTop;
      const next = chapters[i + 1]?.offsetTop ?? Infinity;
      if (mid >= top && mid < next) {
        from = chapters[i];
        to = chapters[i + 1] ?? chapters[i];
        // Hold the chapter's shot for most of it, and move to the next one in its last stretch.
        const span = next - top;
        t = Math.min(1, Math.max(0, ((mid - top) / span - 0.7) / 0.3));
        break;
      }
    }
    const a = SHOTS[from.dataset.shot];
    const b = SHOTS[to.dataset.shot];
    const s = t * t * (3 - 2 * t);
    const blend = Object.fromEntries(Object.keys(a).map((k) => [k, a[k] + (b[k] - a[k]) * s]));
    return narrow() ? narrowShot(blend) : blend;
  }

  function directCamera(v) {
    const goal = targetShot();
    const k = reducedMotion ? 1 : 0.06;
    for (const key of Object.keys(shot)) shot[key] += (goal[key] - shot[key]) * k;
    const { camera, controls } = v.viewer;
    const az = (shot.az * Math.PI) / 180;
    const el = (shot.el * Math.PI) / 180;
    v.viewer.targetHeight = shot.aim;
    const { x, z } = controls.target;
    camera.position.set(
      x + Math.cos(az) * Math.cos(el) * shot.dist,
      shot.aim + Math.sin(el) * shot.dist,
      z - Math.sin(az) * Math.cos(el) * shot.dist,
    );
    // Slide the image sideways (three.js film offset), so the robot stands where the words are not.
    const filmWidth = camera.filmGauge * Math.min(camera.aspect, 1);
    camera.filmOffset = -shot.shift * camera.aspect * 2 * Math.tan((camera.fov * Math.PI) / 360) * filmWidth;
    camera.updateProjectionMatrix();
    key?.position.copy(camera.position).add(KEY_LIFT);
  }
  const KEY_LIFT = new THREE.Vector3(0, 0.8, 0); // the key light sits a little above the lens

  // ---- What the robot does in each chapter ----
  let level = FINAL_LEVEL; // the policy it has (robot-host loads the final one)
  let queue = Promise.resolve();
  function useLevel(id) {
    queue = queue
      .then(async () => {
        if (gone || !view || level === id) return;
        const { onnx, json } = policyUrls(id);
        await view.loadPolicy(onnx, json);
        level = id;
      })
      .catch((error) => console.error(error));
    return queue;
  }
  const walkMotion = WALK ? savedMotion(WALK.clip) : Promise.resolve(null);
  let mode = null; // 'stand' | 'walk' | 'gym'
  let modeToken = 0;
  async function setMode(next) {
    if (!view || mode === next) return;
    mode = next;
    const token = ++modeToken;
    gym.since = 0;
    if (next === 'walk') {
      await useLevel(FINAL_LEVEL);
      const motion = await walkMotion;
      if (token === modeToken && motion) view.playClip(motion);
    } else if (next === 'gym') {
      await useLevel(gymLevel());
      if (token === modeToken) startGymRun();
    } else {
      await useLevel(FINAL_LEVEL);
      if (token === modeToken) view.stop();
    }
  }
  const modeAt = () => {
    const mid = scrollY + innerHeight * 0.5;
    return chapters.findLast((c) => c.offsetTop <= mid)?.dataset.mode ?? 'stand';
  };

  // Hero: the robot stands on its own with the trained policy; a push shows it catching itself.
  const hero = { pushes: 0, falls: 0, pushedAt: 0, fallen: false };
  const stateEl = $('.hud .state');
  const say = (state, text) => {
    stateEl.dataset.state = state;
    stateEl.querySelector('span').textContent = text;
  };
  let heroTimer = 0;
  function pushHero() {
    if (!view || mode !== 'stand') return;
    view.push();
    hero.pushes += 1;
    hero.pushedAt = performance.now();
    hero.fallen = false;
    $('[data-hud="pushes"]').textContent = hero.pushes;
    say('push', `Empujón de ${PUSH_N} N · la política lo atrapa`);
    for (const button of $$('.hero-push')) {
      button.classList.remove('kick');
      void button.offsetWidth; // restart the animation
      button.classList.add('kick');
    }
    clearTimeout(heroTimer);
    heroTimer = setTimeout(() => {
      if (hero.fallen && mode === 'stand') view.reset();
      say('stand', 'Física real · de pie con su política');
    }, AFTER_PUSH_S * 1000);
  }
  $$('.hero-push').forEach((button) => on(button, 'click', pushHero));
  on(window, 'keydown', (event) => {
    if (event.code !== 'Space' || event.target.closest?.('input, textarea, button, a')) return;
    if (scrollY > innerHeight * 0.6) return; // space scrolls the page further down
    event.preventDefault();
    pushHero();
  });

  // Gym: scrolling through the chapter moves through the training. Each stop is a saved
  // checkpoint of training/, on the real robot, pushed every few seconds.
  const gymEl = $('.gym');
  const gym = { since: 0, lastPush: 0, fallen: false, loading: false };
  const gymProgress = () => {
    const top = gymEl.offsetTop;
    const span = gymEl.offsetHeight - innerHeight;
    return Math.min(1, Math.max(0, (scrollY - top) / span));
  };
  // The stage on screen: the chapter is split in three equal stretches of scroll.
  const gymStage = () => Math.min(GYM_STAGES.length - 1, Math.floor(gymProgress() * GYM_STAGES.length));
  const gymLevel = () => GYM_STAGES[gymStage()].level;
  let shownStage = -1;
  function showGymStage() {
    const stage = gymStage();
    if (stage === shownStage) return;
    shownStage = stage;
    $$('.gym-stages li').forEach((li, i) => li.classList.toggle('on', i === stage));
    // The training log draws itself up to this stage's steps.
    const upTo = GYM_STAGES[stage].steps / curve.steps;
    gsap.to('.chart .line', { strokeDashoffset: 1 - Math.max(upTo, 0.02), duration: reducedMotion ? 0 : 0.9, ease: 'power2.out' });
  }
  // Times are the simulation's own clock, not the wall's: a slow or hidden tab cannot fake them.
  function startGymRun() {
    view.stop();
    const t = view.sim.data.time;
    Object.assign(gym, { since: t || 1e-6, lastPush: t, fallen: false });
  }
  function runGym() {
    const wanted = gymLevel();
    if (wanted !== level) {
      if (gym.loading) return; // one checkpoint at a time; the next frame asks again if needed
      gym.since = 0;
      gym.loading = true;
      const token = modeToken;
      useLevel(wanted).then(() => {
        gym.loading = false;
        if (token === modeToken && mode === 'gym') startGymRun();
      });
      return;
    }
    if (!gym.since || gym.fallen) return;
    const now = view.sim.data.time;
    const up = now - gym.since;
    $('[data-gym="up"]').textContent = `${num(up, 1)} s`;
    if (view.sim.bodyPosition('pelvis')[2] < FALLEN_PELVIS_M) {
      gym.fallen = true;
      $('[data-gym="status"]').textContent = `Se cayó a los ${num(up, 1)} s. Lo levantamos y vuelve a intentarlo.`;
      setTimeout(() => mode === 'gym' && level === wanted && startGymRun(), GYM_RESTART_S * 1000);
      return;
    }
    if (now - gym.lastPush > GYM_PUSH_EVERY_S) {
      gym.lastPush = now;
      view.push();
      $('[data-gym="status"]').textContent = `Empujón de ${PUSH_N} N.`;
    }
  }

  // ---- Capture: the video, the skeleton and the robot on one clock (the video's) ----
  const video = $('.walk-video');
  let skeleton = null;
  const captureEl = $('.capture');

  // ---- The wash: one fixed dark veil behind the words, on the side they are on ----
  // A veil per chapter ended in a hard line where the chapter ended; one veil for the whole page,
  // eased toward each chapter's side, leaves no edge. On phones the words sit low: a floor instead.
  const washEl = $('.film-wash');
  const WASH = { hero: [0, 0], capture: [1, 0], gym: [1, 0], policy: [0, 1], close: [0, 0] };
  const wash = { left: 0, right: 0, floor: 0 };
  function updateWash() {
    const mid = scrollY + innerHeight * 0.5;
    const chapter = chapters.findLast((c) => c.offsetTop <= mid) ?? chapters[0];
    const [left, right] = WASH[chapter.dataset.shot] ?? [0, 0];
    const goal = narrow() ? { left: 0, right: 0, floor: chapter.dataset.shot === 'close' ? 0 : 1 } : { left, right, floor: 0 };
    const k = reducedMotion ? 1 : 0.08;
    for (const side of Object.keys(wash)) wash[side] += (goal[side] - wash[side]) * k;
    washEl.style.setProperty('--wash-left', wash.left.toFixed(3));
    washEl.style.setProperty('--wash-right', wash.right.toFixed(3));
    washEl.style.setProperty('--wash-floor', wash.floor.toFixed(3));
  }

  // ---- Every frame ----
  let frameId = requestAnimationFrame(function frame() {
    updateWash();
    if (view) {
      directCamera(view);
      setMode(modeAt());
      if (mode === 'walk') {
        if (video.paused) video.play().catch(() => {});
        if (skeleton?.clip) {
          skeleton.time = video.currentTime;
          skeleton.render();
        }
        view.seek(video.currentTime);
      } else if (!video.paused) video.pause();
      if (mode === 'gym') {
        showGymStage();
        runGym();
      }
      if (mode === 'stand' && hero.pushedAt && !hero.fallen && view.sim.bodyPosition('pelvis')[2] < FALLEN_PELVIS_M) {
        hero.fallen = true; // the policy misses about 1 push in 15 (physics/README.md): say so
        hero.falls += 1;
        $('[data-hud="falls"]').textContent = hero.falls;
        say('fall', 'Esta vez se cayó. También pasa: 1 de cada 15');
      }
    }
    frameId = requestAnimationFrame(frame);
  });

  robot.ready.then(
    (loaded) => {
      if (!loaded || gone) return;
      view = loaded;
      const { camera, controls } = view.viewer;
      saved = { offset: camera.position.clone().sub(controls.target), targetHeight: view.viewer.targetHeight };
      controls.enabled = false; // the scroll directs the camera here
      // Trailer lighting while the landing has the robot: a key light that rides with the camera
      // (directCamera moves it), so every shot is lit from the front whatever the angle, and a
      // rim from behind that draws the silhouette. Taken out again on unmount.
      key = new THREE.PointLight(0xffffff, 9, 0, 1.2);
      const rim = new THREE.DirectionalLight(0xfff1e6, 2.2);
      rim.position.set(-3, 2.5, 2);
      // Ambient sky light and a brighter exposure, so the dark scene never swallows the robot.
      const sky = new THREE.HemisphereLight(0xffffff, 0x3a3833, 1.4);
      lights = [key, rim, sky];
      saved.exposure = view.viewer.renderer.toneMappingExposure;
      view.viewer.renderer.toneMappingExposure = 1.35;
      lights.forEach((light) => view.viewer.scene.add(light));
      // A street under the robot instead of the grid, while the landing has it.
      undressStreet = dressStreet(view.viewer.scene, view.viewer.renderer);
      film.classList.add('ready');
      $$('.hero-push').forEach((button) => (button.disabled = false));
    },
    (error) => {
      $('.boot-line').textContent = 'No se pudo cargar el robot. Recarga la página.';
      console.error(error);
    },
  );

  // ---- Scroll choreography (GSAP) ----
  drawChart($('.chart')); // before the tweens, which animate its line
  $('.chart .line').style.strokeDashoffset = '1'; // hidden until the Gym's first stage draws it
  const ctx = gsap.context(() => {
    if (reducedMotion) return;
    // Hero words: lines rise in on load; the whole caption drifts up and fades as you leave.
    gsap.from('.hero-caption > *', { y: 40, opacity: 0, duration: 1.2, ease: 'expo.out', stagger: 0.08, delay: 0.2 });
    gsap.to('.hero-caption, .hud, .hero-live', {
      y: -80,
      opacity: 0,
      ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom 40%', scrub: true },
    });

    // Capture: video, skeleton and robot are all on screen at once; the frames and the one text
    // rise in as the chapter arrives.
    gsap.from('.capture-media .frame, .capture-caption > *', {
      opacity: 0,
      y: 40,
      stagger: 0.06,
      scrollTrigger: { trigger: '.capture', start: 'top 75%', end: 'top 15%', scrub: true },
    });

    // Gym: its words come in; the stages and the chart move with the stage on screen (showGymStage).
    gsap.from('.gym-caption > *', { opacity: 0, y: 30, stagger: 0.08, scrollTrigger: { trigger: '.gym', start: 'top 60%', end: 'top top', scrub: true } });

    // Policy: the numbers come in one by one.
    gsap.from('.policy-caption h2, .policy-caption .product', { opacity: 0, y: 30, stagger: 0.1, scrollTrigger: { trigger: '.policy', start: 'top 60%', end: 'top 10%', scrub: true } });
    gsap.from('.specs li', { opacity: 0, x: 40, stagger: 0.25, scrollTrigger: { trigger: '.policy', start: 'top top', end: '60% bottom', scrub: true } });

    // Closing: the page closes over the film like a curtain, and the manifesto rises word by word.
    gsap.fromTo('.film-shade', { '--shade': 0 }, { '--shade': 0.88, immediateRender: false, scrollTrigger: { trigger: '.closing', start: 'top bottom', end: 'top 30%', scrub: true } });
    const words = $('.manifesto');
    words.innerHTML = words.textContent.split(' ').map((w) => `<span class="w"><span>${w}</span></span>`).join(' ');
    gsap.from('.manifesto .w > span', { yPercent: 110, stagger: 0.04, ease: 'power3.out', scrollTrigger: { trigger: '.manifesto', start: 'top 85%', end: 'top 45%', scrub: true } });
    gsap.from('.lede, .closing-text, .roadmap li, .try', { opacity: 0, y: 40, stagger: 0.06, scrollTrigger: { trigger: '.closing-text', start: 'top 90%', end: 'top 40%', scrub: true } });
  }, root);

  // The skeleton of Capture is built when the chapter comes near.
  const skeletonObserver = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting && !skeleton && WALK) {
      skeleton = new SkeletonView($('.skeleton-canvas'));
      skeleton.controls.enabled = false;
      // Seen from the side the video was filmed from, so the skeleton walks the same way as the person.
      skeleton.camera.position.set(0, 1.1, -3.4);
      fetchClip(WALK).then((clip) => !gone && skeleton.setClip(clip), console.error);
    }
  }, { rootMargin: '400px' });
  skeletonObserver.observe(captureEl);

  api.checked.then((ok) => {
    if (ok || gone) return;
    const card = $('[data-route="subir"]');
    card.classList.add('unavailable');
    card.removeAttribute('href');
    card.setAttribute('aria-disabled', 'true');
    card.querySelector('b').textContent = 'El servidor de videos está apagado ahora';
  });

  return () => {
    gone = true;
    document.documentElement.classList.remove('is-landing');
    cancelAnimationFrame(frameId);
    clearTimeout(heroTimer);
    ctx.revert();
    ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
    if (lenis) {
      gsap.ticker.remove(tick);
      lenis.destroy();
    }
    skeletonObserver.disconnect();
    cleanups.forEach((fn) => fn());
    video.pause();
    skeleton?.dispose();
    // Give the camera back to the app screens as they expect it.
    if (view && saved) {
      const { camera, controls } = view.viewer;
      view.viewer.targetHeight = saved.targetHeight;
      controls.target.y = saved.targetHeight;
      camera.position.copy(controls.target).add(saved.offset);
      camera.filmOffset = 0;
      camera.updateProjectionMatrix();
      controls.enabled = true;
      lights.forEach((light) => view.viewer.scene.remove(light));
      view.viewer.renderer.toneMappingExposure = saved.exposure;
      undressStreet();
    }
    robot.detach();
  };
}

// The training log as a line: mean seconds up per attempt against millions of steps. An episode
// ends at 20 s, so 20 is "never fell". pathLength=1 lets the scroll draw it (stroke-dashoffset).
function drawChart(svg) {
  const W = 400;
  const H = 150;
  const pad = { l: 26, r: 6, t: 10, b: 20 };
  const maxX = curve.steps / 1e6;
  const x = (v) => pad.l + (v / maxX) * (W - pad.l - pad.r);
  const y = (v) => H - pad.b - (v / curve.episodeCap) * (H - pad.t - pad.b);
  const line = curve.points.map(([s, e], i) => `${i ? 'L' : 'M'}${x(s).toFixed(1)},${y(e).toFixed(1)}`).join('');
  const gridY = [0, 10, 20]
    .map((v) => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${pad.l - 6}" y="${y(v) + 3}" text-anchor="end">${v}s</text>`)
    .join('');
  const gridX = [0, 20, 40].map((v) => `<text x="${x(v)}" y="${H - 5}" text-anchor="middle">${v}M</text>`).join('');
  svg.innerHTML = `<g class="grid">${gridY}${gridX}</g><path class="line" d="${line}" pathLength="1"/>`;
}
