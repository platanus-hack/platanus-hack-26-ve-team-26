// Gallery of preloaded simulations (W2): one card per clip; a click shows it on the stage.
import { fetchClip, preloaded } from './preloaded.js';

function describe(clip) {
  const seconds = clip.frames.length / clip.fps;
  return `${seconds.toFixed(1)} s · ${Math.round(clip.fps)} fps · ${Math.round(100 * clip.quality.valid_ratio)} % de frames detectados`;
}

export function mountGallery(stage) {
  const list = document.getElementById('gallery');
  const cards = preloaded.map((item) => {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.className = 'card';
    button.innerHTML = '<strong></strong><span class="meta">…</span><span class="credit"></span>';
    button.querySelector('strong').textContent = item.title;
    button.querySelector('.credit').textContent = item.credit;
    button.onclick = () => select(item, button);
    li.append(button);
    list.append(li);
    fetchClip(item).then(
      (clip) => (button.querySelector('.meta').textContent = describe(clip)),
      () => (button.querySelector('.meta').textContent = 'No se pudo descargar'),
    );
    return button;
  });

  async function select(item, button) {
    for (const card of cards) card.removeAttribute('aria-current');
    button.setAttribute('aria-current', 'true');
    try {
      stage.showClip(await fetchClip(item), item.title);
    } catch (error) {
      button.querySelector('.meta').textContent = 'No se pudo descargar; toca para reintentar';
      console.error(error);
    }
  }

  // The page never opens empty: the first preloaded clip starts playing right away (W2.3).
  if (cards.length) select(preloaded[0], cards[0]);
}
