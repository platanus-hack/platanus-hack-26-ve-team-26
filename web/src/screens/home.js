// Home: the landing, in four blocks: the robot you can push, how it works, the proof (it learns
// by falling) and who it is for. Every moving image is the real thing: the G1 from physics/
// (MuJoCo + three.js), the PoseClip skeleton from data/, and the training log of training/.
// There is only one robot (robot-host.js), so the page moves it: whichever robot stage is most on
// screen borrows its canvas, and each stage puts the robot in its own mode.
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
const AFTER_PUSH_S = 4.5; // after a push the policy keeps the robot up; then back to the movement
// The lab pushes the standing robot on its own, so every checkpoint shows what it learned.
const LAB_PUSH_EVERY_S = 3.5;
const LAB_RESTART_S = 1.8; // a fallen robot lies this long before it is stood up again
const FALLEN_PELVIS_M = 0.45; // the standing G1 has its pelvis at 0.78 m
const PUSH_N = 250; // physics/ pushes with 250 N for 0.1 s (physics/README.md)
// qpos of the G1: 7 values for the floating base, then the 29 joints in the order of g1.xml.
const QPOS = { leftKnee: 10, leftHip: 7 };
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const num = (value, digits = 2) => value.toFixed(digits).replace('.', ',');

// A robot stage: the canvas lands in it when this stage has the robot.
function stageHTML(id, extra = '') {
  return `
    <div class="stage" data-slot="${id}">
      <div class="boot" aria-live="polite">
        <p>&gt; mujoco.wasm <b class="boot-files">0/39</b></p>
        <p class="boot-line">&gt; cargando el mundo de física…</p>
        <div class="boot-track"><i class="boot-bar"></i></div>
      </div>
      <dl class="telemetry">
        <div><dt>t</dt><dd data-t="time">—</dd></div>
        <div><dt>pelvis</dt><dd data-t="pelvis">—</dd></div>
        <div><dt>rodilla</dt><dd data-t="knee">—</dd></div>
        <div><dt>cadera</dt><dd data-t="hip">—</dd></div>
      </dl>
      ${extra}
    </div>`;
}

export function mount(root, { api }) {
  document.documentElement.classList.add('is-landing');
  const levels = LEVELS.map(({ id, label }, i) => ({ id, label, short: i === 0 ? '0' : label.replace(/ millones de pasos/, ' M') }));
  root.innerHTML = `
  <div class="landing">
    <header class="topbar">
      <a class="wordmark" href="#/" aria-label="Tridi, inicio">
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24"/><circle cx="12" cy="6.5" r="2.6"/><path d="M12 10v6.5M7 12.5h10M12 16.5l-3.5 5M12 16.5l3.5 5"/></svg>
        Tridi
      </a>
      <nav class="topnav" aria-label="Secciones">
        <a href="#como">Cómo funciona</a>
        <a href="#prueba">La prueba</a>
        <a href="#para-quien">Para quién</a>
      </nav>
      <a class="btn btn-light" href="#/en-vivo" data-warm="en-vivo">Probar en vivo</a>
    </header>

    <section class="hero" aria-labelledby="hero-title">
      ${stageHTML('hero', `
        <div class="hero-hud">
          <p class="mode" data-mode="clip"><i></i><span>copiando el video · sin física</span></p>
          <p class="counter"><span data-hud="pushes">0</span> empujones · <span data-hud="falls">0</span> caídas</p>
          <button class="btn btn-signal hero-push stage-push" type="button" disabled>Empújalo</button>
        </div>`)}
      <div class="hero-copy">
        <p class="eyebrow"><i class="live-dot"></i>Simulación en vivo · en tu navegador</p>
        <h1 id="hero-title"><span class="line">Enséñale a un robot</span> <span class="line">a moverse</span> <span class="line accent">con un video.</span></h1>
        <p class="lead">Tridi saca el movimiento de una persona de cualquier video y un robot humanoide lo practica en física real hasta hacerlo sin caerse.</p>
        <div class="cta-row">
          <button class="btn btn-signal hero-push" type="button" disabled>Empújalo <kbd>espacio</kbd></button>
          <a class="btn btn-ghost" href="#como">Cómo funciona ↓</a>
        </div>
        <p class="fine">Este es un Unitree G1 simulado con MuJoCo, de verdad, ahora mismo. Un video de un robot no se deja empujar.</p>
      </div>
    </section>

    <section class="block" id="como" aria-labelledby="how-title">
      <div class="wrap">
        <p class="kicker">01 — Cómo funciona</p>
        <h2 id="how-title">Un video entra. <span>Un robot que se mueve sale.</span></h2>
        <div class="pair">
          <figure class="pair-cell">
            <div class="stage skel"><canvas class="skeleton-canvas"></canvas></div>
            <figcaption><b>La persona</b> · esqueleto 3D sacado de un video de celular</figcaption>
          </figure>
          <figure class="pair-cell">
            ${stageHTML('pipeline')}
            <figcaption><b>El robot</b> · copiando el video, todavía sin física</figcaption>
          </figure>
        </div>
        <ol class="steps">
          <li><span class="n">1</span><h3>Grabas un video</h3><p>30 segundos con el celular. Funciona aunque haya más gente: eliges a la persona con un click.</p><small>MediaPipe · 33 puntos · 30 fps</small></li>
          <li><span class="n">2</span><h3>Lo pasamos al robot</h3><p>Sacamos su esqueleto en 3D y lo ajustamos al cuerpo del robot, que tiene otras medidas y otro peso.</p><small>retargeting al Unitree G1 · 3,2 cm de error</small></li>
          <li><span class="n">3</span><h3>El robot practica</h3><p>Lo intenta millones de veces en un simulador con física real, solo con sus motores, hasta que no se cae.</p><small>MuJoCo · 40 M pasos · 73 min en una laptop</small></li>
        </ol>
      </div>
    </section>

    <section class="block" id="prueba" aria-labelledby="proof-title">
      <div class="wrap">
        <p class="kicker">02 — La prueba</p>
        <h2 id="proof-title">Nadie le programa cómo no caerse. <span>Aprende cayéndose.</span></h2>
        <div class="lab">
          <div class="lab-main">
            ${stageHTML('lab', `
              <div class="lab-readout">
                <div><span>de pie</span><b data-lab="up">—</b></div>
                <div><span>empujones aguantados</span><b data-lab="pushes">—</b></div>
                <p data-lab="status">lo empujamos cada ${num(LAB_PUSH_EVERY_S, 1)} s</p>
              </div>`)}
            <div class="ladder" role="radiogroup" aria-label="Momento del entrenamiento">
              <span class="ladder-label">pasos de práctica</span>
              <div class="ladder-track">
                ${levels.map(({ id, label, short }) => `<button type="button" role="radio" data-level="${id}" aria-label="${label}" aria-checked="${id === FINAL_LEVEL}"><i></i><span>${short}</span></button>`).join('')}
              </div>
            </div>
          </div>
          <div class="lab-side">
            <figure class="chart-fig">
              <svg class="chart" viewBox="0 0 400 200" role="img" aria-label="Segundos que aguanta de pie, durante el entrenamiento: de 1,2 s al principio a cerca de 20 s al final"></svg>
              <figcaption>Segundos que aguanta de pie, mientras entrena · log real de <code>training/</code></figcaption>
            </figure>
            <div class="figures">
              <div><b>1,2 s</b><span>sin entrenar: se cae solo</span></div>
              <div><b>4 de 4</b><span>empujones de ${PUSH_N} N aguantados</span></div>
              <div><b>${curve.minutes} min</b><span>de práctica, en una laptop</span></div>
            </div>
          </div>
        </div>
        <ol class="roadmap" aria-label="Lo que viene">
          <li class="done"><span>hoy</span><b>Pararse y recuperarse de empujones</b></li>
          <li class="now"><span>entrenando</span><b>Caminar como la persona del video</b></li>
          <li><span>después</span><b>Cualquier movimiento, de cualquier video, en mundos con piedras, viento y piso resbaloso</b></li>
        </ol>
      </div>
    </section>

    <section class="block closing" id="para-quien" aria-labelledby="who-title">
      <div class="wrap">
        <p class="kicker">03 — Para quién</p>
        <h2 id="who-title" class="giant">Los humanoides ya tienen cuerpo. <span>Les falta experiencia.</span></h2>
        <div class="who">
          <p>Para los equipos que construyen robots humanoides. Hoy enseñarles a moverse exige trajes de captura, estudios y meses. Con Tridi, cualquier video de una persona se vuelve práctica para su robot.</p>
          <ul class="delivers">
            <li><b>Una política</b><span>la red neuronal que mueve los 29 motores · 265 KB · decide cada 20 ms</span></li>
            <li><b>Los datos</b><span>el movimiento humano corregido para que el robot sí pueda hacerlo</span></li>
          </ul>
        </div>
        <nav class="tries" aria-label="Probar Tridi">
          <a class="try" href="#/en-vivo" data-warm="en-vivo"><span class="n">A</span><b>Muévete frente a la cámara</b><span class="try-go">el robot te copia →</span></a>
          <a class="try" href="#/subir" data-warm="subir" data-route="subir"><span class="n">B</span><b>Sube un video</b><span class="try-go">hasta 30 s →</span></a>
          <a class="try" href="#/simulaciones" data-warm="simulaciones"><span class="n">C</span><b>Mira las simulaciones</b><span class="try-go">persona y robot lado a lado →</span></a>
        </nav>
      </div>
    </section>

    <footer class="footer">
      <p class="honest">El motor de física es <b>MuJoCo</b>, el estándar en robótica; lo nuestro es todo lo que va encima. Y no es un LLM: es una red pequeña que aprende a no caerse.</p>
      <div class="foot-row">
        <span class="wordmark big">Tridi</span>
        <dl class="foot-specs">
          <div><dt>hecho en</dt><dd>Platanus Hack 26 · Caracas</dd></div>
          <div><dt>robot</dt><dd>Unitree G1 · MuJoCo Menagerie</dd></div>
          <div><dt>código</dt><dd><a href="${REPO}" target="_blank" rel="noopener">abierto en GitHub ↗</a></dd></div>
        </dl>
      </div>
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
  // Headline and blocks rise in once, as they first come on screen.
  const reveal = new IntersectionObserver((entries) => {
    for (const entry of entries) if (entry.isIntersecting) entry.target.classList.add('in');
  }, { threshold: 0.15 });
  $$('.hero-copy, .block .wrap > *').forEach((el) => reveal.observe(el));

  // Scrolling over a stage scrolls the page (the orbit camera would eat the wheel), and every
  // stage shows the robot's download while it loads.
  const slots = new Map($$('.stage[data-slot]').map((el) => [el.dataset.slot, el]));
  for (const el of $$('.stage')) on(el, 'wheel', (event) => event.stopPropagation(), { capture: true });
  cleanups.push(
    onRobotProgress(({ done, total, compiling, policy }) => {
      for (const el of slots.values()) {
        el.querySelector('.boot-files').textContent = `${done}/${total}`;
        el.querySelector('.boot-bar').style.width = `${(100 * done) / total}%`;
        el.querySelector('.boot-line').textContent = policy
          ? '> cargando la política entrenada…'
          : compiling
            ? '> armando el G1: 29 articulaciones, 33,3 kg…'
            : '> cargando el mundo de física…';
      }
    }),
  );
  if (robotView()) for (const el of slots.values()) el.classList.add('ready');

  // ---- The one robot, lent to the stage most on screen ----
  const motions = DEMO_CLIPS.map((item) => savedMotion(item.clip));
  let level = FINAL_LEVEL; // the policy the robot has (robot-host loads the final one)
  let labLevel = FINAL_LEVEL; // the one picked on the ladder
  let queue = Promise.resolve(); // policy loads, one at a time
  let active = null; // { name, handle, view }
  let timers = [];
  const later = (fn, s) => timers.push(setTimeout(fn, s * 1000));
  const clearTimers = () => (timers.forEach(clearTimeout), (timers = []));

  function useLevel(view, id) {
    queue = queue
      .then(async () => {
        if (gone || level === id) return;
        const { onnx, json } = policyUrls(id);
        await view.loadPolicy(onnx, json);
        level = id;
      })
      .catch((error) => console.error(error));
    return queue;
  }

  // Hero: the robot copies the clips (a puppet, no physics, and the badge says so); a push hands
  // it to physics and the trained policy, which catches it. Falls are counted, not hidden.
  const hero = { pushes: 0, falls: 0, physical: false, fallen: false, index: 0 };
  const modeEl = $('.hero .mode');
  const setMode = (mode, text) => {
    modeEl.dataset.mode = mode;
    modeEl.querySelector('span').textContent = text;
  };
  async function playDemo(view, i) {
    hero.index = i;
    const motion = await motions[i];
    if (active?.name !== 'hero' || !motion) return;
    hero.physical = false;
    view.playClip(motion);
    setMode('clip', `copiando el video: ${DEMO_CLIPS[i].title.toLowerCase()} · sin física`);
    clearTimers();
    later(() => playDemo(view, (i + 1) % DEMO_CLIPS.length), DEMO_SWITCH_S);
  }
  function pushHero() {
    const view = active?.name === 'hero' ? active.view : null;
    if (!view) return;
    clearTimers();
    view.push();
    hero.pushes += 1;
    hero.physical = true;
    hero.fallen = false;
    $('[data-hud="pushes"]').textContent = hero.pushes;
    setMode('physics', `física real · empujón de ${PUSH_N} N · la política lo atrapa`);
    for (const button of $$('.hero-push')) {
      button.classList.remove('kick');
      void button.offsetWidth; // restart the animation
      button.classList.add('kick');
    }
    later(() => {
      if (hero.fallen) view.reset();
      playDemo(view, hero.index);
    }, AFTER_PUSH_S);
  }

  const modes = {
    async hero(view) {
      await useLevel(view, FINAL_LEVEL);
      $$('.hero-push').forEach((button) => (button.disabled = false));
      if (DEMO_CLIPS.length) playDemo(view, hero.index);
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
      labStatus(`lo empujamos cada ${num(LAB_PUSH_EVERY_S, 1)} s`);
    },
  };

  function lend(name) {
    if (active?.name === name || gone) return;
    clearTimers();
    active?.handle.detach();
    const el = slots.get(name);
    const handle = attachRobot(el);
    active = { name, handle, view: null };
    const mine = active;
    handle.ready.then(
      (view) => {
        if (!view || active !== mine) return;
        mine.view = view;
        for (const slot of slots.values()) slot.classList.add('ready');
        modes[name](view);
      },
      (error) => {
        el.querySelector('.boot-line').textContent = '> no se pudo cargar el robot. Recarga la página.';
        console.error(error);
      },
    );
  }

  // The stage with the largest visible share gets the robot.
  const shares = new Map();
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) shares.set(entry.target.dataset.slot, entry.intersectionRatio);
      const [best, share] = [...shares].sort((a, b) => b[1] - a[1])[0] ?? [];
      if (best && share > 0.2) lend(best);
    },
    { threshold: [0, 0.2, 0.4, 0.6, 0.8, 1] },
  );
  slots.forEach((el) => observer.observe(el));
  lend('hero');

  $$('.hero-push').forEach((button) => on(button, 'click', pushHero));
  on(window, 'keydown', (event) => {
    if (event.code !== 'Space' || event.target.closest?.('input, textarea, button, a')) return;
    if (active?.name !== 'hero') return;
    event.preventDefault();
    pushHero();
  });

  // Ladder: pick a moment of the training.
  const ladder = $$('.ladder button');
  for (const button of ladder) {
    on(button, 'click', () => {
      labLevel = button.dataset.level;
      ladder.forEach((b) => b.setAttribute('aria-checked', String(b === button)));
      labStatus('cargando ese momento del entrenamiento…');
      if (active?.name === 'lab' && active.view) modes.lab(active.view);
    });
  }
  const labStatus = (text) => ($('[data-lab="status"]').textContent = text);

  // ---- The pipeline skeleton: built when its block comes near, drawn only while visible ----
  let skeleton = null;
  let skeletonVisible = false;
  const skeletonObserver = new IntersectionObserver(
    ([entry]) => {
      skeletonVisible = entry.isIntersecting;
      if (skeletonVisible && !skeleton && DEMO_CLIPS.length) {
        skeleton = new SkeletonView($('.skeleton-canvas'));
        fetchClip(DEMO_CLIPS[0]).then((clip) => !gone && skeleton.setClip(clip), console.error);
      }
    },
    { rootMargin: '200px' },
  );
  skeletonObserver.observe($('.skel'));

  // ---- Every frame: the skeleton, the robot in step with it, the lab, the readouts ----
  const readouts = Object.fromEntries($$('[data-t]').map((el) => [el.dataset.t + el.closest('[data-slot]').dataset.slot, el]));
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
      if (active.name === 'hero' && hero.physical && !hero.fallen && view.sim.bodyPosition('pelvis')[2] < FALLEN_PELVIS_M) {
        hero.fallen = true; // the policy misses about 1 push in 15 (physics/README.md): say so
        hero.falls += 1;
        $('[data-hud="falls"]').textContent = hero.falls;
        setMode('fall', 'física real · esta vez se cayó: también pasa');
      }
      if (frameCount++ % 6 === 0) showTelemetry(view, active.name);
    }
    frameId = requestAnimationFrame(frame);
  });

  function showTelemetry(view, name) {
    const { sim } = view;
    const qpos = sim.data.qpos;
    const set = (key, text) => readouts[key + name] && (readouts[key + name].textContent = text);
    set('time', `${num(view.clipTime() || sim.data.time)} s`);
    set('pelvis', `${num(sim.bodyPosition('pelvis')[2])} m`);
    set('knee', `${num(qpos[QPOS.leftKnee])} rad`);
    set('hip', `${num(qpos[QPOS.leftHip])} rad`);
  }

  function runLab(view, lab, now) {
    if (lab.fallen) return;
    const up = (now - lab.since) / 1000;
    if (view.sim.bodyPosition('pelvis')[2] < FALLEN_PELVIS_M) {
      lab.fallen = true;
      upEl.textContent = `${num(up, 1)} s`;
      labStatus(`se cayó a los ${num(up, 1)} s · vuelve a intentarlo`);
      later(() => {
        if (active?.lab !== lab) return;
        view.reset();
        Object.assign(lab, { since: performance.now(), lastPush: performance.now(), fallen: false, pushes: 0 });
        labStatus(`lo empujamos cada ${num(LAB_PUSH_EVERY_S, 1)} s`);
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
      labStatus(`empujón de ${PUSH_N} N`);
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
    card.querySelector('.try-go').textContent = 'el servidor de videos está apagado ahora';
  });

  return () => {
    gone = true;
    document.documentElement.classList.remove('is-landing');
    cancelAnimationFrame(frameId);
    clearTimers();
    observer.disconnect();
    reveal.disconnect();
    skeletonObserver.disconnect();
    cleanups.forEach((fn) => fn());
    active?.handle.detach();
    skeleton?.dispose();
  };
}

// The training log as a line: mean seconds up per episode against millions of steps, with the
// moments of the ladder marked on it. An episode ends at 20 s, so 20 is "never fell".
function drawChart(svg) {
  const W = 400;
  const H = 200;
  const pad = { l: 30, r: 8, t: 12, b: 24 };
  const maxX = curve.steps / 1e6;
  const x = (v) => pad.l + (v / maxX) * (W - pad.l - pad.r);
  const y = (v) => H - pad.b - (v / curve.episodeCap) * (H - pad.t - pad.b);
  const line = curve.points.map(([s, e], i) => `${i ? 'L' : 'M'}${x(s).toFixed(1)},${y(e).toFixed(1)}`).join('');
  const area = `${line}L${x(curve.points.at(-1)[0]).toFixed(1)},${y(0)}L${x(curve.points[0][0]).toFixed(1)},${y(0)}Z`;
  const gridY = [0, 10, 20]
    .map((v) => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${pad.l - 6}" y="${y(v) + 3}" text-anchor="end">${v}s</text>`)
    .join('');
  const gridX = [0, 10, 20, 30, 40].map((v) => `<text x="${x(v)}" y="${H - 6}" text-anchor="middle">${v}M</text>`).join('');
  const marks = [0, 3, 10, 20, 40]
    .map((v) => {
      const point = curve.points.reduce((best, p) => (Math.abs(p[0] - v) < Math.abs(best[0] - v) ? p : best));
      return `<circle class="mark" cx="${x(v)}" cy="${y(point[1])}" r="3"/>`;
    })
    .join('');
  svg.innerHTML = `
    <defs><pattern id="dither" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="1.4" height="1.4"/></pattern></defs>
    <g class="grid">${gridY}${gridX}</g>
    <line class="split" x1="${x(curve.secondRunAt)}" x2="${x(curve.secondRunAt)}" y1="${pad.t}" y2="${H - pad.b}"/>
    <text class="split-label" x="${x(curve.secondRunAt) + 5}" y="${pad.t + 8}">empujones más fuertes</text>
    <path class="area" d="${area}"/>
    <path class="line" d="${line}"/>
    ${marks}`;
}
