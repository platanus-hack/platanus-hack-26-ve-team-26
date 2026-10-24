// Home, in two slides. Slide 1 explains Tridi, with an intro: a person made of dots gathers out
// of a cloud and walks, with live readouts on its joints. Scrolling scatters it and brings up
// slide 2: three big choices, each with its dot robot, whose dots gather into the robot's face on
// hover (or, on touch screens, in turns). Structure adapted from the team's design reference
// (Tridi Design System, ui_kits/website/Intro.html), in the app's own light style.
import { dancing, scrolling, watching } from '../dots/poses.js';
import { createWalkingFigure } from '../dots/figure.js';
import { prefetch } from '../router.js';

export const title = '';

const CHOICES = [
  {
    route: 'en-vivo',
    variant: dancing,
    title: 'Entrena a Tridi en vivo',
    text: 'Párate frente a la cámara y muévete. Tridi te imita al momento.',
    action: 'Usar la cámara',
  },
  {
    route: 'subir',
    variant: watching,
    title: 'Sube un video',
    text: 'Elige un video de una persona moviéndose. Tridi aprende de ella.',
    action: 'Elegir un video',
  },
  {
    route: 'simulaciones',
    variant: scrolling,
    title: 'Ver simulaciones',
    text: 'Mira lo que Tridi ya aprendió de otras personas.',
    action: 'Ver ahora',
  },
];

// Joints that carry a live label on the intro figure, and what each one reads.
const LABELS = [
  { joint: 'head', name: 'cabeza' },
  { joint: 'wrR', name: 'muñeca' },
  { joint: 'kneeL', name: 'rodilla' },
];
const decimal = (value, digits) => value.toFixed(digits).replace('.', ',');

// The card leans toward the cursor by up to this angle; the robot camera follows (dots/stage.js).
const TILT_DEG = { x: 10, y: 8 };
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
// Fewer intro dots on phones: same look, a third of the work.
const SMALL_SCREEN = matchMedia('(max-width: 720px), (pointer: coarse)').matches;

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
        <p class="kicker">tri·di — «3D», dicho a nuestra manera</p>
        <h1 class="brand">Tridi</h1>
        <h2 id="intro-title">Del video de una persona al movimiento de un robot.</h2>
        <p class="lead">Tridi mira un video de alguien moviéndose, calcula cómo se mueve su cuerpo en 3D y se lo enseña a un robot humanoide, que aprende a hacerlo en un mundo de física real.</p>
        <p class="problem">Hoy, para enseñarle a un robot a moverse hacen falta estudios con trajes y cámaras, o una persona manejándolo durante meses. Pero el video de personas moviéndose ya existe.</p>
        <ol class="intro-steps">
          <li><strong>Video</strong><span>Cualquier video, aunque haya varias personas.</span></li>
          <li><strong>Movimiento 3D</strong><span>El esqueleto de una persona, cuadro a cuadro.</span></li>
          <li><strong>Robot</strong><span>Un robot que aprende ese movimiento sin caerse.</span></li>
        </ol>
        <div class="row">
          <button class="primary next" type="button">Elegir cómo empezar ↓</button>
          <a class="button" href="#/en-vivo">Probar en vivo</a>
        </div>
      </div>
      <div class="intro-figure" aria-hidden="true">
        ${LABELS.map(({ joint, name }) => `<span class="joint-label" data-joint="${joint}">${name} <b></b></span>`).join('')}
      </div>
    </section>

    <section class="slide choose" id="elegir" aria-labelledby="choose-title">
      <header class="choose-head">
        <h2 id="choose-title">Elige cómo empezar</h2>
        <p>Las tres usan el mismo robot y la misma física.</p>
      </header>
      <nav class="choices" aria-label="¿Qué quieres hacer?"></nav>
      <p class="hint">Acerca el mouse a un robot para saludarlo.</p>
    </section>`;

  const $ = (selector) => root.querySelector(selector);
  document.documentElement.classList.add('snap'); // slides snap into place while home is shown

  // Slide 1: the walking figure and its joint labels.
  let scatter = 0; // 0 on slide 1, 1 on slide 2 (from the scroll)
  const figure = createWalkingFigure({ count: SMALL_SCREEN ? 2600 : 5200 });
  const labels = [...root.querySelectorAll('.joint-label')];
  const scene = dots.addScene($('.intro-figure'), {
    ...figure,
    update(t, dt, rect) {
      figure.update(t, dt, rect);
      // Labels come in once the person has formed, and leave as it scatters.
      const shown = figure.formed() ** 4 * Math.max(0, 1 - scatter * 3);
      for (const label of labels) {
        label.style.opacity = String(shown);
        const { x, y } = figure.project(label.dataset.joint, rect);
        label.style.transform = `translate(${x}px, ${y}px)`;
        const joint = label.dataset.joint;
        const value =
          joint === 'kneeL' ? `${decimal(figure.kneeAngle(), 0)}°` : joint === 'wrR' ? `y ${decimal(figure.joint('wrR').y, 2)} m` : `z ${decimal(figure.joint('head').z, 3)}`;
        label.querySelector('b').textContent = value;
      }
    },
  });

  // Scrolling to slide 2 scatters the figure and fades slide 1 out; the cards rise in.
  const intro = $('.intro');
  const cards = [];
  function onScroll() {
    const p = Math.min(1, Math.max(0, window.scrollY / window.innerHeight));
    scatter = p;
    figure.setScatter(p);
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
  let gone = false;
  api.checked.then((ok) => {
    if (ok || gone) return;
    const card = nav.children[CHOICES.findIndex((choice) => choice.route === 'subir')];
    card.classList.add('unavailable');
    card.removeAttribute('href');
    card.setAttribute('aria-disabled', 'true');
    card.querySelector('p').textContent = 'El equipo que procesa los videos está apagado. Mientras tanto, usa la cámara o mira las simulaciones.';
    card.querySelector('.action').textContent = 'No disponible ahora';
  });

  return () => {
    gone = true;
    document.documentElement.classList.remove('snap');
    window.removeEventListener('scroll', onScroll);
    dots.removeScene(scene);
    views.forEach((view) => dots.removeView(view));
  };
}
