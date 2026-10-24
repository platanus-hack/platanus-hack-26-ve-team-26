// Preloaded clips (the landing's walk, and the upload screen's own). The list lives in preloaded.json and names
// clips by id; the clip files stay where their owner keeps them, and Vite bundles them.
import list from './preloaded.json';

const CLIP_URLS = {
  ...import.meta.glob('../../data/clips/*.json', { query: '?url', import: 'default', eager: true }),
  ...import.meta.glob('../clips/*.json', { query: '?url', import: 'default', eager: true }),
};
const urlById = new Map(
  Object.entries(CLIP_URLS).map(([path, url]) => [path.split('/').pop().replace(/\.json$/, ''), url]),
);

/**
 * @typedef {{ clip: string, title: string, credit: string, url: string }} Preloaded
 * @type {Preloaded[]}
 */
export const preloaded = list
  .filter((item) => {
    if (urlById.has(item.clip)) return true;
    console.warn(`preloaded.json: no file for clip ${item.clip}`);
    return false;
  })
  .map((item) => ({ ...item, url: urlById.get(item.clip) }));

/**
 * Clips made on this visit (uploaded videos), shown first in the gallery. Kept in memory only:
 * the server keeps them too, and a reload starts the gallery fresh.
 * @type {(Preloaded & { data: import('./contract.js').PoseClip })[]}
 */
export const userClips = [];

export function addUserClip(clip, title) {
  if (userClips.some((item) => item.clip === clip.id)) return;
  userClips.unshift({ clip: clip.id, title, credit: 'Tu video', url: null, data: clip });
}

const cache = new Map();

/** @returns {Promise<import('./contract.js').PoseClip>} */
export function fetchClip(item) {
  if (item.data) return Promise.resolve(item.data);
  if (!cache.has(item.url)) {
    cache.set(
      item.url,
      fetch(item.url)
        .then((response) => {
          if (!response.ok) throw new Error(`${item.clip}: HTTP ${response.status}`);
          return response.json();
        })
        .catch((error) => {
          cache.delete(item.url); // a failed download is retried on the next click
          throw error;
        }),
    );
  }
  return cache.get(item.url);
}
