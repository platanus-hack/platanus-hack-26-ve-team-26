// The worlds a robot trains and is shown in (physics/worlds/*.json, one file read by both
// training/ and the web, so what is shown is what was trained). Each parameter is a range
// [min, max]: training draws a value per episode, the web shows the middle. No browser APIs here,
// so scripts/check-worlds.mjs uses it in Node.

/** Display order: the reference world first, then the harder ones. */
export const WORLD_ORDER = ['plano', 'piedras', 'resbaloso', 'viento'];

const mid = ([min, max]) => (min + max) / 2;

// Wind in m/s becomes a force on the torso by the drag formula F = ½·ρ·Cd·A·v²: air at
// 1.2 kg/m³, and Cd·A ≈ 0.5 m² for a person standing (about 0.4 m² of front, Cd about 1.2).
// 10 m/s, a strong wind, pushes with about 30 N.
const AIR_DENSITY = 1.2;
const DRAG_AREA_M2 = 0.5;
export const windForce = (mps) => 0.5 * AIR_DENSITY * DRAG_AREA_M2 * mps * mps;
/** The inverse: the wind speed (m/s) that pushes with `newtons`. */
export const windSpeed = (newtons) => Math.sqrt(newtons / (0.5 * AIR_DENSITY * DRAG_AREA_M2));

/** The world's scene file relative to the G1's folder: 'unitree_g1/scene_mjx.xml' -> 'scene_mjx.xml'. */
export const sceneFile = (world) => world.scene.slice(world.scene.indexOf('/') + 1);

/** The one value per parameter that the web shows: the middle of each range. */
export function middleValues(world) {
  return {
    friction: mid(world.friction),
    mass_scale: mid(world.mass_scale),
    motor_scale: mid(world.motor_scale),
    wind_newtons: windForce(mid(world.wind_mps)),
  };
}
