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
import { dressCity } from '../landing/city.js';
import { dressTelemetry } from '../landing/telemetry.js';
import { savedMotion } from '../motions.js';
import { FINAL_LEVEL, policyUrls } from '../policies.js';
// The walk being trained (training/): its step count feeds the roadmap, so the page follows the
// training without anyone editing it. Optional: the build works without the file.
const walkPolicy = Object.values(import.meta.glob('../../../training/policies/g1-walk.json', { eager: true, import: 'default' }))[0] ?? null;
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
// The first push comes sooner, so a stage shows itself while its stop holds the scroll; never
// before 2 s, the earliest training ever pushes (training/env.py PUSH_EVERY_S): earlier is outside
// what the policies learned, and "Estable" could fall.
const GYM_FIRST_PUSH_S = 2.0;
const GYM_RESTART_S = 1.6; // a fallen robot lies this long before it is stood up again
const AFTER_PUSH_S = 5; // after a push in the hero, the robot stands this long before it is reset
// The Gym in three stops of the real training, each a saved checkpoint, with what
// training/README.md measured for it: seconds standing (of 20) and 250 N pushes held (of 4).
const GYM_STAGES = [
  { level: 'g1-stand-step-0', steps: 0, verdict: 'No sirve', up: '1,1 s', pushes: '0 de 4', text: 'Sin práctica se cae en un segundo.' },
  { level: 'g1-stand-step-10000000', steps: 10e6, verdict: 'Más o menos', up: '9,6 s', pushes: '1 de 4', text: 'Ya se para, pero un empujón lo tumba casi siempre.' },
  // More steps only help a harder test from here: with 350 N it holds 1.2 of 4 (training/README.md).
  { level: 'g1-stand', steps: 40e6, verdict: 'Estable', up: '20 s', pushes: '4 de 4', text: 'Pasa la prueba entera. Más práctica serviría para empujones más fuertes: con 350 N aguanta 1 de 4.' },
];
// What a step is, for the Gym's explanation (training/README.md): the policy decides 50 times a
// second, and training runs 64 simulated robots at once.
const DECISIONS_PER_S = 50;
const PARALLEL_ROBOTS = 64;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
// The film fills the whole screen, so on a retina screen a pixel ratio of 2 drew four times the
// pixels of 1: 1.5 keeps the robot sharp and draws 44 % fewer pixels than 2, every frame.
const FILM_PIXEL_RATIO = 1.5;
const narrow = () => innerWidth < 860;

// The shots. The camera orbits the robot's pelvis: azimuth 0 looks at the robot from the front
// (MuJoCo +x), elevation lifts it, distance in meters, aim is the height it looks at, and shift
// slides the robot across the frame (a share of the width, + to the right) to leave room for words.
// follow is how many seconds the camera takes to catch up with the pelvis (physics/ viewer
// followTau): a still frame instead of the street sliding with every small step; the walk keeps a
// short one so the robot stays in frame. Resets and clip loops still cut (the viewer snaps them).
// Capture looks from the robot's right (az -90): the walk is turned to head +x (faceForward), so
// it is the side the phone filmed, the robot walks the same way as the video, and the far arm is
// the one behind the body. Policy shows the whole robot the network moves, slightly from above.
const SHOTS = {
  hero: { az: 22, el: 3, dist: 1.35, aim: 1.08, shift: 0.2, follow: 0.5 },
  capture: { az: -90, el: 6, dist: 3.3, aim: 0.8, shift: 0.24, follow: 0.15 },
  gym: { az: 38, el: 12, dist: 3.7, aim: 0.75, shift: 0.2, follow: 1 },
  policy: { az: 60, el: 15, dist: 3.3, aim: 0.72, shift: -0.24, follow: 1.5 },
  close: { az: 140, el: 16, dist: 6.5, aim: 0.8, shift: 0, follow: 1.5 },
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
    <div class="film-hud" aria-hidden="true">
      <i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>
      <p class="sim-readout"><span data-sim="rates">MuJoCo</span><span>t <b data-sim="time">0,0</b> s</span><span>contactos <b data-sim="contacts">0</b></span></p>
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
      <div class="hero-live"><i class="live-dot"></i>Simulación en vivo · Unitree G1 · MuJoCo</div>
      <div class="caption hero-caption">
        <p class="eyebrow">Physical AI para humanoides</p>
        <h1>Robots que aprenden <em>de un video</em></h1>
        <p class="hero-lede">Grabas a una persona moviéndose. Un humanoide aprende a hacerlo igual, practicando en física real hasta no caerse.</p>
        <ol class="hero-steps" aria-label="Cómo funciona">
          <li><b>01</b>Video de celular</li>
          <li><b>02</b>Esqueleto 3D</li>
          <li><b>03</b>Robot que practica</li>
        </ol>
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
            <figcaption>Esqueleto 3D · 33 puntos · tenue: lo que la cámara no ve</figcaption>
          </figure>
        </div>
        <div class="caption capture-caption">
          <p class="product">Tridi Capture</p>
          <h2>De un video de celular al cuerpo del robot</h2>
          <p>Saca el esqueleto 3D de la persona, 33 puntos 30 veces por segundo, y lo pasa a las 29 articulaciones del robot con 3,2 cm de error. Aquí lo copia sin física todavía.</p>
        </div>
      </div>
    </section>

    <section class="chapter gym" id="gym" data-shot="gym" data-mode="gym" data-hold="0.8">
      <div class="sticky">
        <div class="caption gym-caption panel">
          <p class="product">Tridi Gym</p>
          <h2>Practica hasta no caerse</h2>
          <p class="gym-text">Nadie le programa cómo pararse: lo intenta en física simulada, se cae y vuelve a intentarlo. Cada ${num(GYM_PUSH_EVERY_S, 1)} s lo empujamos para ver qué aprendió.</p>
          <div class="steps-meter">
            <p class="steps-now"><b data-gym="steps">0</b><span>pasos de<br>práctica</span></p>
            <p class="steps-explain">Un paso es una decisión del robot: cómo mover sus 29 motores durante 1/${DECISIONS_PER_S} de segundo. ${GYM_STAGES.at(-1).steps / 1e6} millones son unas ${Math.round(GYM_STAGES.at(-1).steps / DECISIONS_PER_S / 3600)} horas de práctica, que ${PARALLEL_ROBOTS} robots simulados a la vez hacen en ${curve.minutes} minutos de laptop.</p>
            <div class="steps-axis">
              <div class="axis-track" aria-hidden="true">
                <i class="axis-line"><i class="axis-fill"></i></i>
                ${GYM_STAGES.map((stage) => `<i class="axis-tick" style="--at: ${(100 * stage.steps) / GYM_STAGES.at(-1).steps}%"></i>`).join('')}
              </div>
              <div class="axis-stops" role="group" aria-label="Etapas del entrenamiento">
              ${GYM_STAGES.map((stage, i) => `
                <button class="axis-stop" type="button" data-stage="${i}" style="--at: ${(100 * stage.steps) / GYM_STAGES.at(-1).steps}%">
                  <span class="axis-label">${stage.steps ? `${stage.steps / 1e6} M` : '0'} pasos</span>
                  <span class="axis-verdict">${stage.verdict}</span>
                </button>`).join('')}
              </div>
            </div>
            <div class="stage-detail">
              <b class="stage-verdict" data-gym="verdict"></b>
              <span class="stage-text" data-gym="text"></span>
              <span class="stage-numbers" data-gym="numbers"></span>
            </div>
          </div>
          <p class="gym-status"><i class="live-dot"></i><span><span data-gym="up">—</span> de pie ahora · <span data-gym="status">el robot real, con ese entrenamiento</span></span></p>
          <p class="gym-hint">Baja para entrenarlo · toca una etapa para ir a ella</p>
          <figure class="chart-fig">
            <svg class="chart" viewBox="0 0 400 150" role="img" aria-label="Segundos de pie por intento durante el entrenamiento: de 1,2 s al principio a unos 15 s, con empujones más fuertes en la segunda mitad"></svg>
            <figcaption>Segundos de pie por intento durante el entrenamiento · log real</figcaption>
          </figure>
        </div>
      </div>
    </section>

    <section class="chapter policy" id="policy" data-shot="policy" data-mode="stand" data-level="g1-stand-quiet">
      <div class="sticky">
        <div class="caption policy-caption panel">
          <p class="product">Tridi Policy</p>
          <h2>Lo que entregamos cabe en un correo</h2>
          <ul class="specs">
            <li><b>265 KB</b><span>la red completa que mueve al robot</span></li>
            <li><b>29</b><span>motores que controla a la vez</span></li>
            <li><b>20 ms</b><span>entre una decisión y la siguiente</span></li>
            <li><b>&lt; 1 ms</b><span>lo que tarda en decidir</span></li>
          </ul>
          <p class="policy-note">Entregamos la política, que corre aquí, en tu navegador, y los datos: el movimiento de la persona corregido por la física, probado en cuatro mundos, para entrenar tu propio robot. La de pie aguanta 4 de 4 empujones de 250 N; la de la caminata todavía sigue 3,5 s de 11,8.</p>
        </div>
      </div>
    </section>

    <section class="chapter closing" id="equipos" data-shot="close" data-mode="stand" data-level="g1-stand-quiet">
      <div class="closing-inner">
        <p class="product">Para equipos de humanoides</p>
        <p class="lede">La IA aprendió a hablar leyendo internet. La IA física no tiene un internet de movimiento.</p>
        <h2 class="manifesto">Los robots ya tienen cuerpo. Les falta experiencia.</h2>
        <p class="closing-text">Enseñarle un movimiento nuevo a un humanoide hoy exige trajes de captura, un estudio y mucho tiempo. Con Tridi, cualquier video de una persona se vuelve práctica para tu robot.</p>
        <div class="progress-track" aria-label="Dónde estamos">
          <div class="track-line" aria-hidden="true"><i class="track-fill"></i></div>
          <ol class="milestones">
            <li class="done">
              <i class="dot" aria-hidden="true"></i>
              <span class="when">Hoy</span>
              <b>Pararse y recuperarse de empujones</b>
              <span class="proof">4 de 4 empujones de ${PUSH_N} N</span>
            </li>
            <li class="now">
              <i class="dot" aria-hidden="true"></i>
              <span class="when">Entrenando</span>
              <b>Caminar como la persona del video</b>
              <span class="proof">${walkPolicy ? `${steps(walkPolicy.steps / 1e6)} M pasos de práctica · ` : ''}todavía no camina solo</span>
            </li>
            <li class="next">
              <i class="dot" aria-hidden="true"></i>
              <span class="when">Lo que viene</span>
              <b>Cualquier movimiento, en cualquier terreno</b>
              <span class="chips"><em>Piedras</em><em>Viento</em><em>Piso resbaloso</em></span>
              <span class="proof">Los terrenos ya existen en el simulador</span>
            </li>
          </ol>
        </div>
        <nav class="tries" aria-label="Probar Tridi">
          <a class="try" href="#/en-vivo" data-warm="en-vivo">
            <svg class="try-icon" viewBox="0 0 48 48" aria-hidden="true"><rect x="6" y="14" width="28" height="20" rx="3"/><path d="M34 21l9-5v16l-9-5z"/><circle cx="20" cy="24" r="5"/></svg>
            <span class="try-kind">Cámara</span>
            <b>Muévete y el robot te copia</b>
            <span class="try-detail">En vivo, en tu navegador</span>
            <span class="try-go">Abrir la cámara →</span>
          </a>
          <a class="try" href="#/subir" data-warm="subir" data-route="subir">
            <svg class="try-icon" viewBox="0 0 48 48" aria-hidden="true"><rect x="6" y="10" width="36" height="26" rx="3"/><path d="M24 31V17M18 22l6-6 6 6"/><path d="M14 40h20"/></svg>
            <span class="try-kind">Video</span>
            <b>Sube un video de una persona</b>
            <span class="try-detail">Hasta 30 s · solo guardamos el movimiento</span>
            <span class="try-go">Subir un video →</span>
          </a>
          <a class="try" href="#/simulaciones" data-warm="simulaciones">
            <svg class="try-icon" viewBox="0 0 48 48" aria-hidden="true"><circle cx="15" cy="11" r="4"/><path d="M15 15v12M9 20h12M15 27l-4 10M15 27l4 10"/><rect x="28" y="7" width="10" height="8" rx="2"/><path d="M33 15v12M27 19h12M33 27l-3 10M33 27l3 10"/></svg>
            <span class="try-kind">Laboratorio</span>
            <b>Persona y robot, lado a lado</b>
            <span class="try-detail">Clips, entrenamiento y mundos</span>
            <span class="try-go">Ver el laboratorio →</span>
          </a>
          <a class="try" href="#/entrega" data-warm="entrega">
            <svg class="try-icon" viewBox="0 0 48 48" aria-hidden="true"><rect x="8" y="16" width="32" height="24" rx="2"/><path d="M8 24h32M24 6v14M18 14l6 6 6-6"/></svg>
            <span class="try-kind">La entrega</span>
            <b>Política y datos del robot</b>
            <span class="try-detail">ONNX, episodios en 4 mundos, sus curvas</span>
            <span class="try-go">Ver lo que se llevan →</span>
          </a>
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
  // gymGate (Gym, below) sees every wheel step first, so a fast scroll stops at each stage.
  // lerp 0.15 settles a wheel step in about a quarter of a second: 0.09 glided for twice that and
  // the page felt heavy.
  const lenis = reducedMotion ? null : new Lenis({ lerp: 0.15, virtualScroll: (data) => gymGate(data) });
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
  let undressCity = () => {}; // takes the street, the sky and the buildings out again
  let telemetry = null; // the physics drawn into the scene (landing/telemetry.js)

  // The camera eases toward the shot of the chapter on screen, blending between neighbours.
  const shot = { ...SHOTS.hero };
  const chapters = $$('.chapter');
  // Where the chapters and the Gym's stages are, measured once and again on resize (measure(),
  // below). Reading offsetTop every frame made the browser lay the page out again every frame,
  // right after GSAP and the wash had written their styles.
  const layout = { tops: [], gymTop: 0, gymStep: 1 };
  const chapterAt = (y) => chapters[layout.tops.findLastIndex((top) => top <= y)] ?? chapters[0];
  function targetShot() {
    const mid = scrollY + innerHeight * 0.5;
    let from = chapters[0];
    let to = chapters[0];
    let t = 0;
    for (let i = 0; i < chapters.length; i++) {
      const top = layout.tops[i];
      const next = layout.tops[i + 1] ?? Infinity;
      if (mid >= top && mid < next) {
        from = chapters[i];
        to = chapters[i + 1] ?? chapters[i];
        // Hold the chapter's shot for most of it, and move to the next one in its last stretch.
        // The Gym holds it longer (data-hold): its last stage sits at 75 % of the chapter.
        const span = next - top;
        const hold = Number(chapters[i].dataset.hold ?? 0.7);
        t = Math.min(1, Math.max(0, ((mid - top) / span - hold) / (1 - hold)));
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
    v.viewer.followTau = reducedMotion ? 0 : shot.follow;
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

  // ---- The push, drawn in the robot's scene: an arrow from where the shove comes, and the Gym's
  // test ring on the floor around the robot it trains ----
  const SIGNAL = 0xff4f1a; // --signal in landing.css
  const ARROW_S = 0.9; // an arrow stays this long after its push (the push itself lasts 0.1 s)
  const RING_M = 1.2; // a fall of the G1 reaches about this far from where it stood
  let marks = null; // { arrow, ring, arrowMaterial, ringMaterial, pushedAt }
  function makeMarks(scene) {
    const arrowMaterial = new THREE.MeshBasicMaterial({ color: SIGNAL, transparent: true, depthWrite: false, toneMapped: false });
    const arrow = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.5, 10), arrowMaterial);
    shaft.position.y = 0.25;
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.18, 16), arrowMaterial);
    head.position.y = 0.59;
    arrow.add(shaft, head);
    arrow.visible = false;
    // The ring: a circle with a tick every 15°, flat on the sidewalk.
    const ringMaterial = new THREE.MeshBasicMaterial({ color: SIGNAL, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    const ring = new THREE.Group();
    ring.add(new THREE.Mesh(new THREE.RingGeometry(RING_M - 0.015, RING_M + 0.015, 128), ringMaterial));
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * 2 * Math.PI;
      const length = k % 6 ? 0.06 : 0.16;
      const tick = new THREE.Mesh(new THREE.PlaneGeometry(0.02, length), ringMaterial);
      tick.position.set(Math.cos(a) * (RING_M + 0.03 + length / 2), Math.sin(a) * (RING_M + 0.03 + length / 2), 0);
      tick.rotation.z = a - Math.PI / 2;
      ring.add(tick);
    }
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.006;
    ring.visible = false;
    scene.add(arrow, ring);
    return { arrow, ring, arrowMaterial, ringMaterial, pushedAt: -Infinity };
  }
  // Right after view.push(): the force on the torso says where the shove comes from.
  const tip = new THREE.Vector3();
  const along = new THREE.Vector3();
  function drawPush() {
    if (!marks || !view) return;
    const { sim } = view;
    const force = sim.data.xfrc_applied;
    const xpos = sim.data.xpos;
    const i = sim.pushBodyId;
    along.set(force[6 * i], 0, -force[6 * i + 1]).normalize(); // MuJoCo (x, y, z) is three.js (x, z, -y)
    tip.set(xpos[3 * i], xpos[3 * i + 2], -xpos[3 * i + 1]).addScaledVector(along, -0.16); // just short of the torso
    // Smaller in the hero, whose camera stands 1.35 m from the robot instead of 3.7 m.
    const size = mode === 'gym' ? 1 : 0.6;
    marks.arrow.scale.setScalar(size);
    marks.arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), along);
    marks.arrow.position.copy(tip).addScaledVector(along, -0.68 * size);
    marks.pushedAt = performance.now();
  }
  function updateMarks() {
    if (!marks) return;
    const t = (performance.now() - marks.pushedAt) / 1000;
    marks.arrow.visible = t < ARROW_S;
    marks.arrowMaterial.opacity = 1 - (t / ARROW_S) ** 3;
    const goal = mode === 'gym' ? 0.6 : 0;
    const ring = marks.ringMaterial;
    ring.opacity += (goal - ring.opacity) * (reducedMotion ? 1 : 0.08);
    marks.ring.visible = ring.opacity > 0.01;
  }

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
  // The walk of Capture, turned to start facing +x like the standing robot (faceForward), so the
  // walk begins without the robot snapping 90°.
  const walkMotion = WALK ? savedMotion(WALK.clip).then((motion) => motion && faceForward(motion)) : Promise.resolve(null);
  let mode = null; // 'stand' | 'walk' | 'gym'
  let modeToken = 0;
  async function setMode(next) {
    if (!view || mode === next) return;
    const [kind, wanted = FINAL_LEVEL] = next.split(':');
    const previous = mode?.split(':')[0];
    mode = next;
    const token = ++modeToken;
    Object.assign(gym, { since: 0, shownAt: 0 });
    if (kind === 'walk') {
      await useLevel(FINAL_LEVEL);
      const motion = await walkMotion;
      // From the first frame, with the video: resuming where the video was paused made the robot
      // jump along the walk (1.9 m) the moment it started.
      video.currentTime = 0;
      if (token === modeToken && motion) view.playClip(motion);
    } else if (kind === 'gym') {
      await useLevel(gymLevel());
      if (token === modeToken) startGymRun();
    } else {
      await useLevel(wanted);
      // Stood back up only when it is not already standing on its own: on the first visit, after
      // the walk (a puppet) or lying on the floor. From the Gym it keeps standing, with no jump.
      const fallen = view.sim.bodyPosition('pelvis')[2] < FALLEN_PELVIS_M;
      if (token === modeToken && (previous !== 'gym' || fallen)) view.stop();
    }
  }
  const modeAt = () => chapterAt(scrollY + innerHeight * 0.5).dataset.mode ?? 'stand';

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
    drawPush();
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

  // Gym: the three stages are three screens of scroll. The chapter is four screens tall and its
  // panel sticks for three of them (landing.css .gym); the stage is the third of that stretch you
  // are in, so scrolling is what trains the robot. Each stage's middle is a stop: scrolling down,
  // a wheel or trackpad gesture, however fast, stops there instead of flying past (gymGate), and
  // keeps the scroll until that checkpoint has shown what it does (gymShown): the untrained robot
  // falls (~1,1 s), the others take their first push. Up, the top bar's links and the axis move freely.
  const gymEl = $('.gym');
  const gymPanel = gymEl.querySelector('.sticky');
  const gym = { since: 0, lastPush: 0, fallen: false, loading: false, shownAt: 0 };
  const GYM_SHOWN_FALL_S = 0.4; // after a fall, a moment on the floor before the scroll is let go
  const GYM_SHOWN_PUSH_S = 0.8; // after a push, time to see it stagger and catch itself (or not)
  // A stop never keeps the scroll longer, even if a checkpoint is slow to load: longer reads as
  // stuck (2.5 s did), which is why the Gym once ran on its own clock instead of the scroll. And
  // each stop holds once per visit: coming back to a stage scrolls straight through it.
  const GYM_HOLD_MAX_S = 1.2;
  const STOP_PX = 4; // Lenis lands on fractional pixels: this close to a stop is on it
  const held = new Set(); // the stops that already held the scroll
  const gymStops = () => GYM_STAGES.map((_, i) => layout.gymTop + (i + 0.5) * layout.gymStep);
  const gymStage = () => Math.min(GYM_STAGES.length - 1, Math.max(0, Math.floor((scrollY - layout.gymTop) / layout.gymStep)));
  function measure() {
    layout.tops = chapters.map((chapter) => chapter.offsetTop);
    layout.gymTop = gymEl.offsetTop;
    layout.gymStep = (gymEl.offsetHeight - gymPanel.offsetHeight) / GYM_STAGES.length;
  }
  measure();
  const layoutObserver = new ResizeObserver(measure);
  layoutObserver.observe(root.querySelector('.landing'));
  cleanups.push(() => layoutObserver.disconnect());
  const gymLevel = () => GYM_STAGES[gymStage()].level;
  const gymShown = (stage) => level === GYM_STAGES[stage].level && gym.shownAt > 0 && performance.now() >= gym.shownAt;
  const gate = { stop: -1, since: 0 };
  function gymGate(data) {
    const { event } = data;
    // Touch scrolls natively (Lenis has no syncTouch here); before the robot loads there is nothing to wait for.
    if (!event.type.includes('wheel') || event.ctrlKey || !view) return true;
    const from = lenis.targetScroll;
    const stops = gymStops();
    const holding =
      gate.stop >= 0 && Math.abs(from - stops[gate.stop]) < STOP_PX && !gymShown(gate.stop) && performance.now() - gate.since < GYM_HOLD_MAX_S * 1000;
    if (!holding) gate.stop = -1;
    if (data.deltaY <= 0) return true; // up and sideways are always free
    if (holding) {
      if (event.cancelable) event.preventDefault(); // Lenis skips its own preventDefault when this returns false
      return false;
    }
    const next = stops.findIndex((stop) => from < stop - STOP_PX && stop <= from + data.deltaY);
    if (next < 0 || gymShown(next) || held.has(next)) return true;
    data.deltaY = stops[next] - from; // Lenis reads the delta after this callback: land on the stop
    Object.assign(gate, { stop: next, since: performance.now() });
    held.add(next);
    return true;
  }
  $$('.axis-stop').forEach((stop, i) =>
    on(stop, 'click', () => {
      const top = gymStops()[i];
      if (lenis) lenis.scrollTo(top, { duration: 1 });
      else window.scrollTo({ top });
    }),
  );
  let shownStage = -1;
  function showGymStage() {
    const stage = gymStage();
    if (stage === shownStage) return;
    shownStage = stage;
    const current = GYM_STAGES[stage];
    for (const selector of ['.axis-stop', '.axis-tick']) {
      $$(selector).forEach((stop, i) => {
        stop.classList.toggle('on', i === stage);
        stop.classList.toggle('past', i < stage);
      });
    }
    $('.axis-fill').style.width = $$('.axis-stop')[stage].style.getPropertyValue('--at');
    $('[data-gym="verdict"]').textContent = current.verdict;
    $('[data-gym="text"]').textContent = current.text;
    $('[data-gym="numbers"]').innerHTML = `<span><b>${current.up}</b> de pie, de 20 s</span><span><b>${current.pushes}</b> empujones de ${PUSH_N} N</span>`;
    // The big number counts up (or back) to this stage's steps.
    const shown = { value: Number($('[data-gym="steps"]').dataset.value ?? 0) };
    gsap.to(shown, {
      value: current.steps,
      duration: reducedMotion ? 0 : 0.9,
      ease: 'power2.out',
      onUpdate: () => {
        const el = $('[data-gym="steps"]');
        el.dataset.value = shown.value;
        el.textContent = shown.value >= 1e6 ? `${num(shown.value / 1e6, shown.value < 1e7 ? 1 : 0)} M` : steps(shown.value);
      },
    });
    // The training log draws itself up to this stage's steps.
    const upTo = GYM_STAGES[stage].steps / curve.steps;
    gsap.to('.chart .line', { strokeDashoffset: 1 - Math.max(upTo, 0.02), duration: reducedMotion ? 0 : 0.9, ease: 'power2.out' });
  }
  // Times are the simulation's own clock, not the wall's: a slow or hidden tab cannot fake them.
  function startGymRun() {
    view.stop();
    const [x, y] = view.sim.bodyPosition('pelvis');
    marks?.ring.position.set(x, marks.ring.position.y, -y);
    const t = view.sim.data.time;
    $('[data-gym="status"]').textContent = 'el robot real, con ese entrenamiento'; // not the last checkpoint's fall
    // The first push comes at GYM_FIRST_PUSH_S, then every GYM_PUSH_EVERY_S.
    Object.assign(gym, { since: t || 1e-6, lastPush: t - (GYM_PUSH_EVERY_S - GYM_FIRST_PUSH_S), fallen: false });
  }
  function runGym() {
    const wanted = gymLevel();
    if (wanted !== level) {
      if (gym.loading) return; // one checkpoint at a time; the next frame asks again if needed
      Object.assign(gym, { since: 0, shownAt: 0 }); // a new checkpoint has shown nothing yet
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
      gym.shownAt ||= performance.now() + GYM_SHOWN_FALL_S * 1000;
      $('[data-gym="status"]').textContent = `Se cayó a los ${num(up, 1)} s. Lo levantamos y vuelve a intentarlo.`;
      setTimeout(() => mode === 'gym' && level === wanted && startGymRun(), GYM_RESTART_S * 1000);
      return;
    }
    if (now - gym.lastPush > GYM_PUSH_EVERY_S) {
      gym.lastPush = now;
      gym.shownAt ||= performance.now() + GYM_SHOWN_PUSH_S * 1000;
      view.push();
      drawPush();
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
  // The hero's title sits low on the left, over the café of the street (landing/city.js).
  const WASH = { hero: [0.85, 0], capture: [1, 0], gym: [1, 0], policy: [0, 1], close: [0, 0] };
  const wash = { left: 0, right: 0, floor: 0 };
  const washed = { left: '', right: '', floor: '' }; // what the veil has now: write only changes
  function updateWash() {
    const chapter = chapterAt(scrollY + innerHeight * 0.5);
    const [left, right] = WASH[chapter.dataset.shot] ?? [0, 0];
    const goal = narrow() ? { left: 0, right: 0, floor: chapter.dataset.shot === 'close' ? 0 : 1 } : { left, right, floor: 0 };
    const k = reducedMotion ? 1 : 0.08;
    for (const side of Object.keys(wash)) {
      wash[side] += (goal[side] - wash[side]) * k;
      const value = wash[side].toFixed(3);
      if (value !== washed[side]) washEl.style.setProperty(`--wash-${side}`, (washed[side] = value));
    }
  }

  // The simulation's own readout, in the corner of the film: its clock and its contacts. Ten
  // times a second is enough to read and keeps the page from rewriting text every frame.
  const READOUT_EVERY_MS = 100;
  let readAt = 0;
  function updateReadout(now) {
    if (now - readAt < READOUT_EVERY_MS) return;
    readAt = now;
    $('[data-sim="time"]').textContent = num(view.sim.data.time, 1);
    $('[data-sim="contacts"]').textContent = view.sim.data.ncon;
  }

  // ---- Every frame ----
  let frameId = requestAnimationFrame(function frame(now) {
    updateWash();
    updateMarks();
    if (view) {
      // The walk of Capture is a puppet, with no physics to show.
      telemetry?.update(mode !== 'walk', { com: chapterAt(scrollY + innerHeight * 0.5).dataset.shot !== 'hero' });
      updateReadout(now);
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
      saved.pixelRatio = view.viewer.renderer.getPixelRatio();
      view.viewer.renderer.setPixelRatio(Math.min(devicePixelRatio, FILM_PIXEL_RATIO));
      view.viewer.resize();
      view.viewer.renderer.toneMappingExposure = 1.35;
      lights.forEach((light) => view.viewer.scene.add(light));
      // A city street at dusk around the robot instead of the grid, while the landing has it.
      undressCity = dressCity(view.viewer.scene, view.viewer.renderer);
      marks = makeMarks(view.viewer.scene);
      telemetry = dressTelemetry(view);
      $('[data-sim="rates"]').textContent = `MuJoCo · física ${Math.round(1 / view.sim.model.opt.timestep)} Hz · política ${DECISIONS_PER_S} Hz`;
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

    // Gym: its words come in once; the stages then follow the scroll (gymStage) and stop it (gymGate).
    gsap.from('.gym-caption > *', { opacity: 0, y: 30, stagger: 0.08, duration: 0.6, scrollTrigger: { trigger: '.gym', start: 'top 60%', toggleActions: 'play none none none' } });

    // Policy: the numbers come in one by one.
    gsap.from('.policy-caption h2, .policy-caption .product', { opacity: 0, y: 30, stagger: 0.1, scrollTrigger: { trigger: '.policy', start: 'top 60%', end: 'top 10%', scrub: true } });
    gsap.from('.specs li', { opacity: 0, x: 40, stagger: 0.25, scrollTrigger: { trigger: '.policy', start: 'top top', end: '60% bottom', scrub: true } });

    // Closing: the page closes over the film like a curtain, and the manifesto rises word by word.
    gsap.fromTo('.film-shade', { '--shade': 0 }, { '--shade': 0.88, immediateRender: false, scrollTrigger: { trigger: '.closing', start: 'top bottom', end: 'top 30%', scrub: true } });
    const words = $('.manifesto');
    words.innerHTML = words.textContent.split(' ').map((w) => `<span class="w"><span>${w}</span></span>`).join(' ');
    gsap.from('.manifesto .w > span', { yPercent: 110, stagger: 0.04, ease: 'power3.out', scrollTrigger: { trigger: '.manifesto', start: 'top 85%', end: 'top 45%', scrub: true } });
    gsap.from('.lede, .closing-text, .milestones li, .try', { opacity: 0, y: 40, stagger: 0.06, scrollTrigger: { trigger: '.closing-text', start: 'top 90%', end: 'top 40%', scrub: true } });
    // The progress line fills up to "Entrenando" (the middle milestone) as it scrolls in.
    gsap.fromTo('.track-fill', { scale: 0 }, { scale: 1, ease: 'none', scrollTrigger: { trigger: '.progress-track', start: 'top 85%', end: 'top 45%', scrub: true } });
  }, root);

  // The skeleton of Capture is built when the chapter comes near.
  const skeletonObserver = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting && !skeleton && WALK) {
      skeleton = new SkeletonView($('.skeleton-canvas'));
      skeleton.controls.enabled = false;
      // Seen from the side the video was filmed from (the PoseClip's z points to the phone), so the
      // skeleton walks the same way as the person and the far arm is the dimmed one behind the body.
      skeleton.camera.position.set(0, 1.1, 3.4);
      fetchClip(WALK).then((clip) => !gone && skeleton.setClip(clip), console.error);
    }
  }, { rootMargin: '400px' });
  skeletonObserver.observe(captureEl);

  // The top bar is clear over the hero and turns solid once the hero has scrolled past its bottom
  // edge: from there on chapter text scrolls under it (the Gym, the end of each pinned chapter and
  // the closing), in the same light ink as the bar's own words. An observer, not a ScrollTrigger,
  // so it also works with reduced motion, where the GSAP context below creates nothing.
  const topbar = $('.topbar');
  const barObserver = new IntersectionObserver(([entry]) => topbar.classList.toggle('solid', !entry.isIntersecting), {
    rootMargin: `-${Math.round(topbar.getBoundingClientRect().bottom)}px 0px 0px 0px`, // the bar floats below the top
  });
  barObserver.observe($('.hero'));

  api.checked.then((ok) => {
    if (ok || gone) return;
    const card = $('[data-route="subir"]');
    card.classList.add('unavailable');
    card.removeAttribute('href');
    card.setAttribute('aria-disabled', 'true');
    card.querySelector('.try-detail').textContent = 'El servidor de videos está apagado ahora';
    card.querySelector('.try-go').textContent = 'No disponible ahora';
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
    barObserver.disconnect();
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
      view.viewer.followTau = 0; // the app screens follow the robot rigidly
      lights.forEach((light) => view.viewer.scene.remove(light));
      view.viewer.renderer.toneMappingExposure = saved.exposure;
      view.viewer.renderer.setPixelRatio(saved.pixelRatio);
      view.viewer.resize();
      undressCity();
      telemetry?.dispose();
      if (marks) {
        view.viewer.scene.remove(marks.arrow, marks.ring);
        [marks.arrow, marks.ring].forEach((group) => group.traverse((o) => o.geometry?.dispose()));
        marks.arrowMaterial.dispose();
        marks.ringMaterial.dispose();
      }
    }
    robot.detach();
  };
}

// Turns a RobotMotion about the vertical through its first pelvis position so it starts facing +x,
// where the standing robot faces after a reset: the walk was filmed heading +y, and without this the
// robot snapped 90° when it started. The pelvis path and quaternion turn; the joints do not.
function faceForward(motion) {
  const [x0, y0, , w0, a0, b0, c0] = motion.qpos[0];
  const yaw = Math.atan2(2 * (w0 * c0 + a0 * b0), 1 - 2 * (b0 * b0 + c0 * c0));
  const cos = Math.cos(-yaw);
  const sin = Math.sin(-yaw);
  const hw = Math.cos(-yaw / 2); // the turn as a quaternion about z: (hw, 0, 0, hz)
  const hz = Math.sin(-yaw / 2);
  const qpos = motion.qpos.map(([x, y, z, w, a, b, c, ...joints]) => [
    x0 + cos * (x - x0) - sin * (y - y0),
    y0 + sin * (x - x0) + cos * (y - y0),
    z,
    hw * w - hz * c,
    hw * a - hz * b,
    hw * b + hz * a,
    hw * c + hz * w,
    ...joints,
  ]);
  return { ...motion, qpos };
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
