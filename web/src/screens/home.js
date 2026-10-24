// Home, in two slides. Slide 1 explains Tridi, with an intro: a person made of dots gathers out
// of a cloud and goes through activities that train a robot's mobility (dancing, boxing, guitar,
// sewing), with live readouts on its joints. Scrolling scatters it and brings up
// slide 2: three big choices, each with its dot robot, whose dots gather into the robot's face on
// hover (or, on touch screens, in turns). Structure adapted from the team's design reference
// (Tridi Design System, ui_kits/website/Intro.html), in the app's own light style.
import { dancing, scrolling, watching } from '../dots/poses.js';
import { ACTIVITIES, createWalkingFigure } from '../dots/figure.js';
import { prefetch } from '../router.js';

export const title = '';

const CHOICES = [
  {
    route: 'en-vivo',
    variant: dancing,
    title: 'Entrena a Tridi en vivo',
    text: 'Muévete frente a la cámara y Tridi te copia.',
    action: 'Usar la cámara',
  },
  {
    route: 'subir',
    variant: watching,
    title: 'Sube un video',
    text: 'Un video de alguien moviéndose, y Tridi lo aprende.',
    action: 'Elegir un video',
  },
  {
    route: 'simulaciones',
    variant: scrolling,
    title: 'Ver simulaciones',
    text: 'Mira lo que Tridi ya aprendió.',
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
        <h1 class="brand">Tridi</h1>
        <h2 id="intro-title">Del video de una persona al movimiento de un robot.</h2>
        <p class="lead">Toma un video de alguien moviéndose, saca su movimiento en 3D y se lo enseña a un robot humanoide. Sin trajes ni estudios de captura.</p>
        <p class="flow" aria-label="Cómo funciona"><span>Video</span><i>→</i><span>Movimiento 3D</span><i>→</i><span>Robot</span></p>
        <div class="row">
          <button class="primary next" type="button">Elegir cómo empezar ↓</button>
          <a class="button" href="#/en-vivo">Probar en vivo</a>
        </div>
      </div>
      <div class="intro-figure">
        ${LABELS.map(({ joint, name }) => `<span class="joint-label" aria-hidden="true" data-joint="${joint}">${name} <b></b></span>`).join('')}
        <div class="activities" aria-label="Lo que está aprendiendo">
          <span class="activities-title">Aprendiendo</span>
          ${ACTIVITIES.map(([name], i) => `<button type="button" data-activity="${i}">${name}</button>`).join('')}
        </div>
      </div>
    </section>

    <section class="slide choose" id="elegir" aria-labelledby="choose-title">
      <h2 id="choose-title" class="choose-title">Elige cómo empezar</h2>
      <nav class="choices" aria-label="¿Qué quieres hacer?"></nav>
    </section>`;

  const $ = (selector) => root.querySelector(selector);
  document.documentElement.classList.add('snap'); // slides snap into place while home is shown

  // Slide 1: the walking figure and its joint labels.
  let scatter = 0; // 0 on slide 1, 1 on slide 2 (from the scroll)
  let shownActivity = -1;
  const activityButtons = [...root.querySelectorAll('[data-activity]')];
  for (const button of activityButtons) button.onclick = () => figure.setActivity(Number(button.dataset.activity));
  const figure = createWalkingFigure({ count: SMALL_SCREEN ? 2600 : 5200 });
  const labels = [...root.querySelectorAll('.joint-label')];
  const scene = dots.addScene($('.intro-figure'), {
    ...figure,
    update(t, dt, rect) {
      figure.update(t, dt, rect);
      const playing = figure.activity();
      if (playing !== shownActivity) {
        shownActivity = playing;
        activityButtons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === playing)));
      }
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
    card.querySelector('p').textContent = 'El servidor de videos está apagado ahora.';
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
