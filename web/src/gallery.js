// Gallery of preloaded simulations (W2): one card per clip; a click shows it on the stage.
import { fetchClip, preloaded, userClips } from './preloaded.js';

function describe(clip) {
  const seconds = clip.frames.length / clip.fps;
  return `${seconds.toFixed(0)} segundos · se ve el ${Math.round(100 * clip.quality.valid_ratio)} % del tiempo`;
}

/** @param initialClip  id of the clip to show first (from #/simulaciones/<id>), else the first */
export function mountGallery(root, stage, initialClip) {
  const list = root.querySelector('#gallery');
  const items = [...userClips, ...preloaded];
  const cards = items.map((item) => {
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

  // The page never opens empty: a clip starts playing right away (W2.3).
  const first = Math.max(0, items.findIndex((item) => item.clip === initialClip));
  if (cards.length) select(items[first], cards[first]);
}
