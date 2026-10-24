// Home: the name, one line about it, and three big choices, each with its dot robot. Hovering a
// card (or, on touch screens, a slow turn between them) gathers the dots into the robot's face.
import { dancing, scrolling, watching } from '../dots/poses.js';
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

export function mount(root, { dots }) {
  root.innerHTML = `
    <section class="home">
      <header class="hero">
        <h1>Tridi</h1>
        <p>Enséñale a un robot a moverse como tú.</p>
      </header>
      <nav class="choices" aria-label="¿Qué quieres hacer?"></nav>
      <p class="hint">Acerca el mouse a un robot para saludarlo.</p>
    </section>`;
  const nav = root.querySelector('.choices');
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
    const view = dots.addView(card.querySelector('.choice-scene'), choice.variant, card);
    tiltWithPointer(card, view);
    return view;
  });
  return () => views.forEach((view) => dots.removeView(view));
}
