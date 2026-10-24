// RobotMotions of the preloaded clips, already computed (physics/motions, `npm run retarget`
// there): the robot starts moving at once instead of waiting seconds for the retargeting. Any
// other clip (the synthetic one, an uploaded video) is computed in the browser by stage.js.
const URLS = import.meta.glob('../../physics/motions/*.json', { query: '?url', import: 'default', eager: true });
const urlById = new Map(Object.entries(URLS).map(([path, url]) => [path.split('/').pop().replace(/\.json$/, ''), url]));

/** @returns the RobotMotion of a clip, or null if there is none saved for it */
export async function savedMotion(clipId) {
  const url = urlById.get(clipId);
  if (!url) return null;
  const response = await fetch(url);
  return response.ok ? response.json() : null;
}
