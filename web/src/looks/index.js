// What each world of physics/worlds looks like in Simulaciones, so the conditions read at a glance:
// flat ground is the landing's floor and measuring grid, the stones a rocky field, the slippery
// floor a lobby just mopped, and the wind an open meadow. Only looks: the physics of each world is
// the same as before, and nothing drawn here can be touched by the robot. A place (a kitchen, a
// warehouse, a sidewalk; props.js) brings its own floor, so with one the world shows only through
// the wind's currents, which follow the physics' wind in every world.
import { dressLab } from '../landing/lab.js';
import { createCurrents, windNow } from './currents.js';
import { dressMeadow } from './meadow.js';
import { dressRocks } from './rocks.js';
import { dressWet } from './wet.js';

/** Flat ground: the landing's floor (lab.js), the plainest of the worlds, as the physics is. */
function dressFlat(view) {
  return { update() {}, undo: dressLab(view.viewer.scene) };
}

const LOOKS = { plano: dressFlat, piedras: dressRocks, resbaloso: dressWet, viento: dressMeadow };

/**
 * Dresses the viewer for the robot's current world and place.
 * @param options.wind  () => { dir, mps }: the wind the grass and the currents show. By default the
 *   physics' own (windNow); a replay passes the wind each recorded episode had.
 * @returns {{ update(dt: number): void, undo(): void }} update every frame; undo before the next
 */
export function dressWorld(view, { wind = () => windNow(view) } = {}) {
  const worldId = view.world()?.id ?? 'plano';
  const look = view.scene() ? null : LOOKS[worldId]?.(view, wind);
  const currents = createCurrents(view, wind);
  return {
    update(dt) {
      look?.update(dt);
      currents.update(dt);
    },
    undo() {
      currents.dispose();
      look?.undo();
    },
  };
}
