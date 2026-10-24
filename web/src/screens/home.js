// Home, in two slides. Slide 1 says what Tridi is (the team's pitch, in short) next to the real
// G1 from the simulations: it goes through the preloaded movements on its own, and "Empujar"
// shows the trained policy catching it. Slide 2: three big choices, each with its dot robot, whose dots gather into
// the robot's face on hover (or, on touch screens, in turns).
import { dancing, scrolling, watching } from '../dots/poses.js';
import { hasSavedMotion, savedMotion } from '../motions.js';
import { preloaded } from '../preloaded.js';
import { mountRobotPane, robotPaneHTML } from '../robot-pane.js';
import { prefetch } from '../router.js';

export const title = '';

const CHOICES = [
  {
    route: 'en-vivo',
    variant: dancing,
    title: 'Entrena a Tridi en vivo',
    text: 'Muévete frente a la cámara y el robot te copia.',
    action: 'Usar la cámara',
  },
  {
    route: 'subir',
    variant: watching,
    title: 'Sube un video',
    text: 'Hasta 30 s de video. Tridi encuentra a la persona y saca su esqueleto 3D.',
    action: 'Elegir un video',
  },
  {
    route: 'simulaciones',
    variant: scrolling,
    title: 'Ver simulaciones',
    text: 'El robot sin entrenar y entrenado. Empújalo.',
    action: 'Ver ahora',
  },
];

// The movements the robot repeats on slide 1: the preloaded clips that have a saved RobotMotion.
const DEMO_CLIPS = preloaded.filter((item) => hasSavedMotion(item.clip));
// Each movement plays this long before the next one, so both show without a click.
const DEMO_SWITCH_S = 9;
// After a push the robot is physical (the policy keeps it up); it goes back to the movement after this.
const AFTER_PUSH_S = 4;

// The card leans toward the cursor by up to this angle; the robot camera follows (dots/stage.js).
const TILT_DEG = { x: 10, y: 8 };
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
function tiltWithPointer(card, view) {
  if (reducedMotion) return;
  card.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse') return; // a finger scrolling the page should not tilt it
    const rect = card.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    card.style.setProperty('--ry', `${x * TILT_DEG.x}deg`);
    card.style.setProperty('--rx', `${-y * TILT_DEG.y}deg`);
    card.style.setProperty('--px', `${((x + 1) / 2) * 100}%`);
    card.style.setProperty('--py', `${((y + 1) / 2) * 100}%`);
    view.tilt.set(x, -y);
  });
  card.addEventListener('pointerleave', () => {
    for (const name of ['--rx', '--ry', '--px', '--py']) card.style.removeProperty(name);
    view.tilt.set(0, 0);
  });
}

export function mount(root, { dots, api }) {
  root.innerHTML = `
    <section class="slide intro" aria-labelledby="intro-title">
      <div class="intro-copy">
        <h1 class="brand">Tridi</h1>
        <h2 id="intro-title">Los humanoides ya tienen cuerpo. Les falta experiencia.</h2>
        <p class="lead">Tridi convierte video en experiencia: saca el movimiento de una persona de cualquier video y el robot lo practica en física real hasta hacerlo sin caerse.</p>
        <p class="flow" aria-label="Cómo funciona"><span>Video</span><i>→</i><span>Esqueleto 3D</span><i>→</i><span>Práctica en física real</span><i>→</i><span>Política y datos</span></p>
        <p class="motto">El video le dice qué hacer. La simulación le enseña cómo.</p>
        <div class="row">
          <button class="primary next" type="button">Elegir cómo empezar ↓</button>
          <a class="button" href="#/en-vivo">Probar en vivo</a>
        </div>
      </div>
      <div class="intro-robot">
        ${robotPaneHTML('Unitree G1')}
        <p class="demo-note">Empújalo: un video de un robot no se deja empujar.</p>
      </div>
    </section>

    <section class="slide choose" id="elegir" aria-labelledby="choose-title">
      <h2 id="choose-title" class="choose-title">Elige cómo empezar</h2>
      <nav class="choices" aria-label="¿Qué quieres hacer?"></nav>
      <p class="honest">El motor de física es MuJoCo, el estándar en robótica. Lo nuestro es el camino del video al robot, el mundo donde aprende y el entrenamiento. Y no es un LLM: es una red pequeña que mueve los motores.</p>
    </section>`;

  const $ = (selector) => root.querySelector(selector);
  document.documentElement.classList.add('snap'); // slides snap into place while home is shown

  // Slide 1: the robot goes through the preloaded movements on its own, one after the other.
  const robot = mountRobotPane($('.intro-robot .robot-pane'), dots, {
    beforePush: () => {
      // The push takes the robot off the movement; the policy catches it, and a few seconds later
      // it goes back to the movement (the automatic switch waits meanwhile).
      clearTimeout(resumeTimer);
      clearTimeout(switchTimer);
      label.textContent = 'Unitree G1 · se recupera solo';
      resumeTimer = setTimeout(() => playDemo(current), AFTER_PUSH_S * 1000);
    },
  });
  const label = $('.intro-robot .pane-label');
  const motions = DEMO_CLIPS.map((item) => savedMotion(item.clip));
  let current = 0;
  let resumeTimer = 0;
  let switchTimer = 0;
  let gone = false;
  async function playDemo(index) {
    current = index;
    const [view, motion] = await Promise.all([robot.ready, motions[index]]);
    if (gone || !view || !motion || current !== index) return;
    view.playClip(motion);
    label.textContent = `Unitree G1 · repite: ${DEMO_CLIPS[index].title.toLowerCase()}`;
    clearTimeout(switchTimer);
    switchTimer = setTimeout(() => playDemo((index + 1) % DEMO_CLIPS.length), DEMO_SWITCH_S * 1000);
  }
  if (DEMO_CLIPS.length) playDemo(0);

  // Scrolling to slide 2 fades slide 1 out; the cards rise in.
  const intro = $('.intro');
  const cards = [];
  function onScroll() {
    const p = Math.min(1, Math.max(0, window.scrollY / window.innerHeight));
    intro.style.opacity = String(Math.max(0, 1 - p * 1.3));
    intro.style.transform = `translateY(${-p * 70}px)`;
    cards.forEach((card, i) => {
      // Each card starts a little later than the one before it.
      const shown = Math.min(1, Math.max(0, (p - 0.35 - i * 0.08) / 0.35));
      card.style.setProperty('--reveal', String(shown));
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  $('.next').onclick = () => $('#elegir').scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });

  // Slide 2: the three choices.
  const nav = $('.choices');
  const views = CHOICES.map((choice, i) => {
    const card = document.createElement('a');
    card.className = 'choice';
    card.href = `#/${choice.route}`;
    card.innerHTML = `
      <div class="choice-scene"></div>
      <div class="choice-text">
        <span class="step">${i + 1}</span>
        <h2></h2>
        <p></p>
        <span class="action"></span>
      </div>`;
    card.querySelector('h2').textContent = choice.title;
    card.querySelector('p').textContent = choice.text;
    card.querySelector('.action').textContent = `${choice.action} →`;
    // Intent to open a screen starts loading it, so the click lands on a ready page.
    const warm = () => prefetch(choice.route);
    card.addEventListener('pointerenter', warm, { once: true });
    card.addEventListener('focus', warm, { once: true });
    card.addEventListener('touchstart', warm, { once: true, passive: true });
    nav.append(card);
    cards.push(card);
    const view = dots.addView(card.querySelector('.choice-scene'), choice.variant, card);
    tiltWithPointer(card, view);
    return view;
  });
  onScroll();

  // Without the video server, "Subir" stays in place (no flicker, and the pitch still shows the
  // feature) but says why it cannot be used and does not open. Camera and gallery remain.
  api.checked.then((ok) => {
    if (ok || gone) return;
    const card = nav.children[CHOICES.findIndex((choice) => choice.route === 'subir')];
    card.classList.add('unavailable');
    card.removeAttribute('href');
    card.setAttribute('aria-disabled', 'true');
    card.querySelector('p').textContent = 'El servidor de videos está apagado ahora.';
    card.querySelector('.action').textContent = 'No disponible ahora';
  });

  return () => {
    gone = true;
    document.documentElement.classList.remove('snap');
    window.removeEventListener('scroll', onScroll);
    clearTimeout(resumeTimer);
    clearTimeout(switchTimer);
    robot.dispose();
    views.forEach((view) => dots.removeView(view));
  };
}
