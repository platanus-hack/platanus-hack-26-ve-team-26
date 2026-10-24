// What each world of physics/worlds looks like in Simulaciones, so the conditions read at a glance:
// flat ground is the landing's sidewalk at dusk, the stones a rocky field, the slippery floor a
// lobby just mopped, and the wind an open meadow. Only looks: the physics of each world is the
// same as before, and nothing drawn here can be touched by the robot. A place (a kitchen, a
// warehouse, a sidewalk; props.js) brings its own floor, so with one the world shows only through
// the wind's currents, which follow the physics' wind in every world.
import { dressCity } from '../landing/city.js';
import { hideViewerFloor } from './common.js';
import { createCurrents } from './currents.js';
import { dressMeadow } from './meadow.js';
import { dressRocks } from './rocks.js';
import { dressWet } from './wet.js';

/**
 * The landing's street (city.js), turned so it runs the way the clips walk here: the landing films
 * the walk along +x, Simulaciones along -z (MuJoCo +y). Its shops stand on the robot's right.
 */
function dressSidewalk(view) {
  const { scene, renderer } = view.viewer;
  // city.js misses the grid (see hideViewerFloor): hidden first, so undoing in reverse order puts
  // floor and grid back as they were.
  const showGrid = hideViewerFloor(view);
  const undo = dressCity(scene, renderer);
  const city = scene.getObjectByName('landing-city');
  if (city) city.rotation.y = Math.PI / 2;
  // The city at dusk is dark: the landing lights it brighter (home.js); here a little less.
  const exposure = renderer.toneMappingExposure;
  renderer.toneMappingExposure = 1.25;
  return {
    update() {},
    undo() {
      renderer.toneMappingExposure = exposure;
      undo();
      showGrid();
    },
  };
}

const LOOKS = { plano: dressSidewalk, piedras: dressRocks, resbaloso: dressWet, viento: dressMeadow };

/**
 * Dresses the viewer for the robot's current world and place.
 * @returns {{ update(dt: number): void, undo(): void }} update every frame; undo before the next
 */
export function dressWorld(view) {
  const worldId = view.world()?.id ?? 'plano';
  const look = view.scene() ? null : LOOKS[worldId]?.(view);
  const currents = createCurrents(view);
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
