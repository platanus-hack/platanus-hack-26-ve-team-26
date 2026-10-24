// Home: the landing. Every moving image on it is the real thing: the G1 from physics/ (MuJoCo +
// three.js), the PoseClip skeleton from data/, and the training log of training/. There is only
// one robot (robot-host.js), so the page moves it: whichever robot window is most on screen
// borrows its canvas, and each window puts the robot in its own mode (repeating a clip, in step
// with the skeleton, or standing with a checkpoint of the policy while it gets pushed).
import '../landing/landing.css';
import curve from '../landing/training-curve.json';
import { hasSavedMotion, savedMotion } from '../motions.js';
import { FINAL_LEVEL, LEVELS, policyUrls } from '../policies.js';
import { fetchClip, preloaded } from '../preloaded.js';
import { attachRobot, onRobotProgress, robotView } from '../robot-host.js';
import { prefetch } from '../router.js';
import { SkeletonView } from '../skeleton.js';

export const title = '';

const REPO = 'https://github.com/platanus-hack/platanus-hack-26-ve-team-26';
// The movements the hero robot repeats: the preloaded clips that have a saved RobotMotion.
const DEMO_CLIPS = preloaded.filter((item) => hasSavedMotion(item.clip));
const DEMO_SWITCH_S = 9; // each movement plays this long before the next one
const AFTER_PUSH_S = 4; // after a push the policy keeps the robot up; then back to the movement
// The lab pushes the standing robot on its own, so every checkpoint shows what it learned.
const LAB_PUSH_EVERY_S = 3.5;
const LAB_RESTART_S = 1.8; // a fallen robot lies this long before it is stood up again
const FALLEN_PELVIS_M = 0.45; // the standing G1 has its pelvis at 0.78 m
// qpos of the G1: 7 values for the floating base, then the 29 joints in the order of g1.xml.
const QPOS = { leftKnee: 10, rightKnee: 16, leftHip: 7 };
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const num = (value, digits = 2) => value.toFixed(digits).replace('.', ',');

function windowBar(left, right = '') {
  return `<div class="win-bar"><span>${left}</span><span>${right}</span></div>`;
}

// A robot window: the canvas lands in .slot-stage when this window has the robot.
function slotHTML(id, barLeft, extra = '') {
  return `
    <div class="win sim-slot" data-slot="${id}">
      ${windowBar(barLeft, '<i class="live-dot"></i>en vivo')}
      <div class="slot-stage">
        <div class="slot-boot" aria-live="polite">
          <p>&gt; mujoco.wasm <b class="boot-files">0/39</b></p>
          <p class="boot-line">&gt; cargando el mundo de física…</p>
          <div class="boot-track"><i class="boot-bar"></i></div>
        </div>
        <dl class="telemetry">
          <div><dt>t</dt><dd data-t="time">—</dd></div>
          <div><dt>pelvis</dt><dd data-t="pelvis">—</dd></div>
          <div><dt>rodilla izq.</dt><dd data-t="knee">—</dd></div>
          <div><dt>cadera izq.</dt><dd data-t="hip">—</dd></div>
        </dl>
        ${extra}
      </div>
    </div>`;
}

export function mount(root, { api }) {
  document.documentElement.classList.add('is-landing');
  root.innerHTML = `
  <div class="landing">
    <header class="topbar">
      <a class="wordmark" href="#/" aria-label="Tridi, inicio">
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24"/><circle cx="12" cy="6.5" r="2.6"/><path d="M12 10v6.5M7 12.5h10M12 16.5l-3.5 5M12 16.5l3.5 5"/></svg>
        Tridi
      </a>
      <nav class="topnav" aria-label="Secciones">
        <a href="#problema">Problema</a>
        <a href="#pipeline">Cómo funciona</a>
        <a href="#laboratorio">Entrenamiento</a>
        <a href="#entrega">Qué entrega</a>
      </nav>
      <a class="btn btn-ink" href="#/en-vivo" data-warm="en-vivo">Probar en vivo</a>
    </header>
    <p class="ticker"><span><i class="live-dot"></i>Simulación en vivo en tu navegador</span><span>MuJoCo 3.16 · Unitree G1 · 29 articulaciones · <b data-t="clock">t = 0,00 s</b></span></p>

    <section class="hero" aria-labelledby="hero-title">
      <div class="hero-copy">
        <p class="label">// Physical AI · de video a robot</p>
        <h1 id="hero-title">Los humanoides ya tienen cuerpo. <span>Les falta experiencia.</span></h1>
        <p class="lead">Tridi convierte video de personas en experiencia para robots: saca el movimiento 3D de cualquier video y el robot lo practica millones de veces en física real, hasta hacerlo sin caerse.</p>
        <div class="cta-row">
          <a class="btn btn-signal" href="#/en-vivo" data-warm="en-vivo">Probar en vivo →</a>
          <a class="btn btn-line" href="#pipeline">Cómo funciona ↓</a>
        </div>
      </div>
      <div class="hero-sim">
        ${slotHTML('hero', 'sim.01 — unitree_g1 · mujoco', `
          <div class="slot-foot">
            <span class="slot-caption">repite: —</span>
            <button class="btn btn-signal push" type="button" disabled>Empujar ↯</button>
          </div>`)}
        <p class="hero-note">Empújalo. Un video de un robot no se deja empujar.</p>
        <aside class="chip chip-a" aria-hidden="true">${windowBar('clip.caminar-perfil')}<p>356 cuadros · 30 fps<br/>video de Mixkit</p></aside>
        <aside class="chip chip-b" aria-hidden="true">${windowBar('policy.g1-stand')}<p>265 KB · decide cada 20 ms<br/>40 M pasos de práctica</p></aside>
      </div>
    </section>

    <section class="band dark" id="problema" aria-labelledby="problem-title">
      <div class="wrap">
        <p class="label">// 01 — El problema</p>
        <h2 id="problem-title" class="statement">Para aprender a caminar, bailar o cargar una caja, un robot necesita miles de ejemplos de una persona moviéndose. <span>Hoy se graban con trajes de captura, en estudios, sobre un piso perfecto que en la calle no existe.</span></h2>
        <div class="versus">
          <article class="win win-dark">
            ${windowBar('hoy · captura en estudio')}
            <ul class="spec">
              <li><span>Trajes y cámaras</span><b>caro</b></li>
              <li><span>Sesiones en estudio</span><b>lento</b></li>
              <li><span>Piso perfecto</span><b>no es la calle</b></li>
              <li><span>Resultado</span><b>no escala</b></li>
            </ul>
          </article>
          <article class="win win-dark">
            ${windowBar('ya existe · video')}
            <ul class="spec">
              <li><span>Personas moviéndose en video</span><b>millones de horas</b></li>
              <li><span>Proporciones del robot</span><b>otras</b></li>
              <li><span>Peso del robot</span><b>otro</b></li>
              <li><span>Si copia el video tal cual</span><b class="signal">se cae</b></li>
            </ul>
          </article>
        </div>
        <p class="kicker-big">Tridi convierte video en experiencia.</p>
      </div>
    </section>

    <section class="band" id="pipeline" aria-labelledby="pipeline-title">
      <div class="wrap">
        <p class="label">// 02 — Cómo funciona</p>
        <h2 id="pipeline-title" class="statement">Del video al cuerpo del robot. <span>La misma caminata, de la persona al G1, cuadro a cuadro.</span></h2>
        <div class="pair">
          <div class="win skel-win">
            ${windowBar('input.pose_clip — persona', '33 puntos · 30 fps')}
            <div class="slot-stage"><canvas class="skeleton-canvas"></canvas><p class="pair-tag">esqueleto 3D sacado del video</p></div>
          </div>
          <span class="pair-arrow" aria-hidden="true">→</span>
          ${slotHTML('pipeline', 'output.robot_motion — g1', '<p class="pair-tag">el mismo movimiento en el G1</p>')}
        </div>
        <ol class="flow-steps">
          <li><span class="step-n">01</span><h3>Video</h3><p>Grabas 30 s con el celular o la laptop, o subes un MP4.</p><b>10 s de video · ~40 s de proceso</b></li>
          <li><span class="step-n">02</span><h3>Esqueleto 3D</h3><p>Encuentra a la persona, aunque haya más gente en el cuadro, y saca su esqueleto en 3D.</p><b>elige al sujeto con un click</b></li>
          <li><span class="step-n">03</span><h3>Cuerpo del robot</h3><p>Pasa ese movimiento al G1, con sus proporciones y sus 29 articulaciones.</p><b>3,2 cm de error mediano</b></li>
          <li><span class="step-n">04</span><h3>Práctica en física</h3><p>El robot lo practica en MuJoCo, solo con sus motores. Si se cae, vuelve a intentarlo.</p><b>40 M pasos · 73 min en una laptop</b></li>
        </ol>
      </div>
    </section>

    <section class="band dark" id="laboratorio" aria-labelledby="lab-title">
      <div class="wrap">
        <p class="label">// 03 — El video le dice qué hacer. La simulación le enseña cómo.</p>
        <h2 id="lab-title" class="statement">Nadie le programa cómo mantenerse de pie. <span>Aprende intentándolo, y cayéndose, millones de veces.</span></h2>
        <div class="lab">
          <div class="lab-sim">
            ${slotHTML('lab', 'lab.02 — escalera del aprendizaje', `
              <div class="lab-readout">
                <div><span>de pie</span><b data-lab="up">—</b></div>
                <div><span>empujones aguantados</span><b data-lab="pushes">—</b></div>
                <p data-lab="status">el robot se empuja solo cada ${num(LAB_PUSH_EVERY_S, 1)} s</p>
              </div>`)}
            <div class="levels" role="radiogroup" aria-label="Checkpoint de la política">
              ${LEVELS.map(({ id, label }) => `<button type="button" role="radio" data-level="${id}" aria-checked="${id === FINAL_LEVEL}">${label}</button>`).join('')}
            </div>
          </div>
          <div class="lab-side">
            <div class="win win-dark chart-win">
              ${windowBar('train.log — segundos de pie por episodio', `${num(curve.steps / 1e6, 0)} M pasos`)}
              <svg class="chart" viewBox="0 0 400 220" role="img" aria-label="Segundos de pie por episodio durante el entrenamiento: de 1,2 s al principio a cerca de 20 s al final"></svg>
            </div>
            <div class="figures">
              <div><b>1,2 s</b><span>sin entrenar: se cae solo</span></div>
              <div><b>4 / 4</b><span>empujones de 250 N aguantados</span></div>
              <div><b>${curve.minutes} min</b><span>de entrenamiento en una laptop</span></div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="band" aria-labelledby="worlds-title">
      <div class="wrap">
        <p class="label">// 04 — No practica en un piso perfecto</p>
        <h2 id="worlds-title" class="statement">Un robot que solo aprendió en condiciones ideales <span>se cae en la calle.</span></h2>
        <ul class="worlds">
          <li><b>Empujones</b><span>250 N desde cualquier lado</span><em class="tag tag-on">hoy</em></li>
          <li><b>Piedras y piso irregular</b><span>el terreno cambia en cada intento</span><em class="tag">en camino</em></li>
          <li><b>Piso resbaloso</b><span>fricción distinta en cada episodio</span><em class="tag">en camino</em></li>
          <li><b>Viento</b><span>fuerzas que no avisan</span><em class="tag">en camino</em></li>
          <li><b>Peso y motores</b><span>otra masa, otra fuerza en cada motor</span><em class="tag">en camino</em></li>
        </ul>
      </div>
    </section>

    <section class="band dark" id="entrega" aria-labelledby="output-title">
      <div class="wrap">
        <p class="label">// 05 — Qué entrega</p>
        <h2 id="output-title" class="statement">Lo que una empresa de humanoides necesita <span>para entrenar sus robots.</span></h2>
        <div class="outputs">
          <article class="win win-dark">
            ${windowBar('output.01', 'policy.onnx')}
            <h3>Una política</h3>
            <p>Una red neuronal pequeña que mueve los motores del robot.</p>
            <ul class="spec">
              <li><span>tamaño</span><b>265 KB</b></li>
              <li><span>entradas → salidas</span><b>93 → 29 motores</b></li>
              <li><span>frecuencia</span><b>cada 20 ms</b></li>
              <li><span>tiempo por decisión</span><b>&lt; 1 ms</b></li>
            </ul>
          </article>
          <article class="win win-dark">
            ${windowBar('output.02', 'robot_motion.json')}
            <h3>Los datos</h3>
            <p>El mismo movimiento humano, corregido para que un robot sí pueda hacerlo.</p>
            <ul class="spec">
              <li><span>por cuadro</span><b>36 valores del G1</b></li>
              <li><span>incluye</span><b>recorrido y rumbo</b></li>
              <li><span>pie apoyado</span><b>patina menos que la persona</b></li>
              <li><span>formato</span><b>abierto, JSON</b></li>
            </ul>
          </article>
        </div>
      </div>
    </section>

    <section class="band honest" aria-labelledby="honest-title">
      <div class="wrap">
        <p class="label">// 06 — Lo decimos claro</p>
        <h2 id="honest-title" class="giant">No es un motor de física. <span>Tampoco es un LLM.</span></h2>
        <div class="columns">
          <p>El motor de física es <b>MuJoCo</b>, el estándar en robótica. Lo nuestro es todo lo que va encima: el camino del video al robot, el mundo donde aprende y el entrenamiento.</p>
          <p>Las empresas les van a poner un LLM a sus robots para decidir a dónde ir. Alguien tiene que enseñarles a <b>llegar sin caerse</b>. Eso es Tridi.</p>
        </div>
      </div>
    </section>

    <section class="band try" aria-labelledby="try-title">
      <div class="wrap">
        <p class="label">// 07 — Pruébalo</p>
        <h2 id="try-title" class="giant">Muévete. <span>El robot te copia.</span></h2>
        <nav class="tries" aria-label="Probar Tridi">
          <a class="win try-card" href="#/en-vivo" data-warm="en-vivo">${windowBar('01 · cámara')}<h3>En vivo</h3><p>Muévete frente a la cámara y el G1 te copia.</p><span class="try-go">Usar la cámara →</span></a>
          <a class="win try-card" href="#/subir" data-warm="subir" data-route="subir">${windowBar('02 · video')}<h3>Sube un video</h3><p>Hasta 30 s. Tridi encuentra a la persona y saca su esqueleto 3D.</p><span class="try-go">Elegir un video →</span></a>
          <a class="win try-card" href="#/simulaciones" data-warm="simulaciones">${windowBar('03 · laboratorio')}<h3>Simulaciones</h3><p>Persona y robot lado a lado, con cada checkpoint. Empújalo.</p><span class="try-go">Ver ahora →</span></a>
        </nav>
      </div>
    </section>

    <footer class="footer">
      <div class="wordmark big">Tridi</div>
      <dl class="foot-specs">
        <div><dt>versión</dt><dd>0.1 · Platanus Hack 26, Caracas</dd></div>
        <div><dt>física</dt><dd>MuJoCo 3.16 en WebAssembly</dd></div>
        <div><dt>robot</dt><dd>Unitree G1 · MuJoCo Menagerie</dd></div>
        <div><dt>código</dt><dd><a href="${REPO}" target="_blank" rel="noopener">abierto en GitHub ↗</a></dd></div>
      </dl>
    </footer>
  </div>`;

  const $ = (selector) => root.querySelector(selector);
  const $$ = (selector) => [...root.querySelectorAll(selector)];
  let gone = false;
  const cleanups = [];
  const on = (target, type, fn, options) => {
    target.addEventListener(type, fn, options);
    cleanups.push(() => target.removeEventListener(type, fn, options));
  };

  // Intent to open a screen starts loading it, so the click lands on a ready page.
  for (const link of $$('[data-warm]')) {
    const warm = () => prefetch(link.dataset.warm);
    link.addEventListener('pointerenter', warm, { once: true });
    link.addEventListener('focus', warm, { once: true });
  }
  // In-page anchors scroll instead of going through the hash router.
  for (const link of $$('a[href^="#"]:not([href^="#/"])')) {
    on(link, 'click', (event) => {
      event.preventDefault();
      root.querySelector(link.getAttribute('href'))?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
    });
  }

  // The robot windows: scrolling over them scrolls the page (the orbit camera would eat the wheel),
  // and they show the robot's download while it loads.
  const slots = new Map($$('.sim-slot').map((el) => [el.dataset.slot, el]));
  for (const el of [...slots.values(), $('.skel-win')]) {
    on(el, 'wheel', (event) => event.stopPropagation(), { capture: true });
  }
  const stopProgress = onRobotProgress(({ done, total, compiling, policy }) => {
    for (const el of slots.values()) {
      el.querySelector('.boot-files').textContent = `${done}/${total}`;
      el.querySelector('.boot-bar').style.width = `${(100 * done) / total}%`;
      el.querySelector('.boot-line').textContent = policy
        ? '> cargando la política entrenada…'
        : compiling
          ? '> compilando el G1: 29 articulaciones, 33,3 kg…'
          : '> cargando el mundo de física…';
    }
  });
  cleanups.push(stopProgress);
  if (robotView()) for (const el of slots.values()) el.classList.add('ready');

  // ---- The one robot, lent to the window most on screen ----
  const motions = DEMO_CLIPS.map((item) => savedMotion(item.clip));
  let level = FINAL_LEVEL; // the policy the robot has (robot-host loads the final one)
  let labLevel = FINAL_LEVEL; // the one picked in the lab
  let queue = Promise.resolve(); // policy loads, one at a time
  let active = null; // { name, handle, view }
  let timers = [];
  const later = (fn, s) => timers.push(setTimeout(fn, s * 1000));
  const clearTimers = () => (timers.forEach(clearTimeout), (timers = []));

  function useLevel(view, id) {
    queue = queue.then(async () => {
      if (gone || level === id) return;
      const { onnx, json } = policyUrls(id);
      await view.loadPolicy(onnx, json);
      level = id;
    }).catch((error) => console.error(error));
    return queue;
  }

  const modes = {
    async hero(view) {
      await useLevel(view, FINAL_LEVEL);
      const caption = slots.get('hero').querySelector('.slot-caption');
      const push = slots.get('hero').querySelector('.push');
      let index = 0;
      const playDemo = async (i) => {
        index = i;
        const motion = await motions[i];
        if (active?.name !== 'hero' || !motion) return;
        view.playClip(motion);
        caption.textContent = `repite: ${DEMO_CLIPS[i].title.toLowerCase()}`;
        clearTimers();
        later(() => playDemo((i + 1) % DEMO_CLIPS.length), DEMO_SWITCH_S);
      };
      push.disabled = false;
      push.onclick = () => {
        clearTimers();
        view.push();
        caption.textContent = 'empujado: la política lo recupera';
        later(() => playDemo(index), AFTER_PUSH_S);
      };
      if (DEMO_CLIPS.length) playDemo(0);
    },
    async pipeline(view) {
      await useLevel(view, FINAL_LEVEL);
      const motion = await motions[0];
      if (active?.name !== 'pipeline' || !motion) return;
      view.playClip(motion);
      active.sync = true; // follows the skeleton's clock (see the frame loop)
    },
    async lab(view) {
      await useLevel(view, labLevel);
      if (active?.name !== 'lab') return;
      view.stop();
      active.lab = { since: performance.now(), pushes: 0, lastPush: performance.now(), fallen: false };
    },
  };

  function lend(name) {
    if (active?.name === name || gone) return;
    clearTimers();
    active?.handle.detach();
    const el = slots.get(name);
    const handle = attachRobot(el.querySelector('.slot-stage'));
    active = { name, handle, view: null };
    const mine = active;
    handle.ready.then((view) => {
      if (!view || active !== mine) return;
      mine.view = view;
      for (const slot of slots.values()) slot.classList.add('ready');
      modes[name](view);
    }, (error) => {
      el.querySelector('.boot-line').textContent = '> no se pudo cargar el robot. Recarga la página.';
      console.error(error);
    });
  }

  // The window with the largest visible share gets the robot.
  const shares = new Map();
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) shares.set(entry.target.dataset.slot, entry.intersectionRatio);
    const [best, share] = [...shares].sort((a, b) => b[1] - a[1])[0] ?? [];
    if (best && share > 0.15) lend(best);
  }, { threshold: [0, 0.15, 0.3, 0.5, 0.7, 0.9, 1] });
  slots.forEach((el) => observer.observe(el));
  lend('hero');

  // Lab: pick a checkpoint.
  const levelButtons = $$('.levels button');
  for (const button of levelButtons) {
    on(button, 'click', () => {
      labLevel = button.dataset.level;
      levelButtons.forEach((b) => b.setAttribute('aria-checked', String(b === button)));
      labStatus('cargando el checkpoint…');
      if (active?.name === 'lab' && active.view) modes.lab(active.view);
      else slots.get('lab').scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
    });
  }
  const labStatus = (text) => ($('[data-lab="status"]').textContent = text);

  // ---- The pipeline skeleton: built when its section comes near, drawn only while visible ----
  let skeleton = null;
  let skeletonVisible = false;
  const skeletonObserver = new IntersectionObserver(([entry]) => {
    skeletonVisible = entry.isIntersecting;
    if (skeletonVisible && !skeleton && DEMO_CLIPS.length) {
      skeleton = new SkeletonView($('.skeleton-canvas'));
      fetchClip(DEMO_CLIPS[0]).then((clip) => !gone && skeleton.setClip(clip), console.error);
    }
  }, { rootMargin: '200px' });
  skeletonObserver.observe($('.skel-win'));

  // ---- Every frame: the skeleton, the robot in step with it, and the readouts ----
  const readouts = Object.fromEntries($$('[data-t]').map((el) => [el.dataset.t + (el.closest('.sim-slot')?.dataset.slot ?? ''), el]));
  const clock = $('[data-t="clock"]');
  const upEl = $('[data-lab="up"]');
  const pushesEl = $('[data-lab="pushes"]');
  let last = performance.now();
  let frameCount = 0;
  let frameId = requestAnimationFrame(function frame(now) {
    const wall = Math.min(1 / 30, Math.max(0, (now - last) / 1000));
    last = now;
    if (skeleton && skeletonVisible) {
      skeleton.advance(wall);
      skeleton.render();
    }
    const view = active?.view;
    if (view) {
      if (active.sync && skeleton?.clip) view.seek(skeleton.time);
      if (active.lab) runLab(view, active.lab, now);
      if (frameCount++ % 6 === 0) showTelemetry(view, active.name);
    }
    frameId = requestAnimationFrame(frame);
  });

  function showTelemetry(view, name) {
    const { sim } = view;
    const qpos = sim.data.qpos;
    const pelvis = sim.bodyPosition('pelvis')[2];
    const set = (key, text) => readouts[key + name] && (readouts[key + name].textContent = text);
    const t = view.clipTime() || sim.data.time;
    set('time', `${num(t)} s`);
    set('pelvis', `${num(pelvis)} m`);
    set('knee', `${num(qpos[QPOS.leftKnee])} rad`);
    set('hip', `${num(qpos[QPOS.leftHip])} rad`);
    clock.textContent = `t = ${num(t)} s`;
  }

  function runLab(view, lab, now) {
    const pelvis = view.sim.bodyPosition('pelvis')[2];
    const up = (now - lab.since) / 1000;
    if (lab.fallen) return;
    if (pelvis < FALLEN_PELVIS_M) {
      lab.fallen = true;
      upEl.textContent = `${num(up, 1)} s`;
      labStatus(`se cayó a los ${num(up, 1)} s · vuelve a intentarlo`);
      later(() => {
        if (active?.lab !== lab) return;
        view.reset();
        Object.assign(lab, { since: performance.now(), lastPush: performance.now(), fallen: false, pushes: 0 });
        labStatus(`el robot se empuja solo cada ${num(LAB_PUSH_EVERY_S, 1)} s`);
      }, LAB_RESTART_S);
      return;
    }
    upEl.textContent = `${num(up, 1)} s`;
    pushesEl.textContent = String(lab.pushes);
    if ((now - lab.lastPush) / 1000 > LAB_PUSH_EVERY_S) {
      // A push counts as taken once the next one comes and the robot is still up.
      if (lab.lastPush > lab.since) lab.pushes += 1;
      lab.lastPush = now;
      view.push();
      labStatus('empujón de 250 N');
    }
  }

  drawChart($('.chart'));

  // Without the video server, "Sube un video" says why it cannot be used and does not open.
  api.checked.then((ok) => {
    if (ok || gone) return;
    const card = $('[data-route="subir"]');
    card.classList.add('unavailable');
    card.removeAttribute('href');
    card.setAttribute('aria-disabled', 'true');
    card.querySelector('p').textContent = 'El servidor de videos está apagado ahora.';
    card.querySelector('.try-go').textContent = 'No disponible ahora';
  });

  return () => {
    gone = true;
    document.documentElement.classList.remove('is-landing');
    cancelAnimationFrame(frameId);
    clearTimers();
    observer.disconnect();
    skeletonObserver.disconnect();
    cleanups.forEach((fn) => fn());
    active?.handle.detach();
    skeleton?.dispose();
  };
}

// The training log as a line: mean seconds up per episode against millions of steps, with the
// checkpoints of the lab marked on it. The episode ends at 20 s, so 20 is "never fell".
function drawChart(svg) {
  const W = 400;
  const H = 220;
  const pad = { l: 34, r: 10, t: 14, b: 28 };
  const maxX = curve.steps / 1e6;
  const x = (v) => pad.l + (v / maxX) * (W - pad.l - pad.r);
  const y = (v) => H - pad.b - (v / curve.episodeCap) * (H - pad.t - pad.b);
  const line = curve.points.map(([s, e], i) => `${i ? 'L' : 'M'}${x(s).toFixed(1)},${y(e).toFixed(1)}`).join('');
  const area = `${line}L${x(curve.points.at(-1)[0]).toFixed(1)},${y(0)}L${x(curve.points[0][0]).toFixed(1)},${y(0)}Z`;
  const gridY = [0, 5, 10, 15, 20]
    .map((v) => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${pad.l - 6}" y="${y(v) + 3}" text-anchor="end">${v}s</text>`)
    .join('');
  const gridX = [0, 10, 20, 30, 40]
    .map((v) => `<text x="${x(v)}" y="${H - 8}" text-anchor="middle">${v}M</text>`)
    .join('');
  const marks = [0, 3, 10, 20, 40]
    .map((v) => {
      const point = curve.points.reduce((best, p) => (Math.abs(p[0] - v) < Math.abs(best[0] - v) ? p : best));
      return `<rect class="mark" x="${x(v) - 3}" y="${y(point[1]) - 3}" width="6" height="6"/>`;
    })
    .join('');
  svg.innerHTML = `
    <defs><pattern id="dither" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="1.4" height="1.4"/></pattern></defs>
    <g class="grid">${gridY}${gridX}</g>
    <line class="split" x1="${x(curve.secondRunAt)}" x2="${x(curve.secondRunAt)}" y1="${pad.t}" y2="${H - pad.b}"/>
    <text class="split-label" x="${x(curve.secondRunAt) + 5}" y="${pad.t + 8}">2ª vuelta: empujones más fuertes</text>
    <path class="area" d="${area}"/>
    <path class="line" d="${line}"/>
    ${marks}`;
}
