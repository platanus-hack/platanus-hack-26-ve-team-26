// The worlds a robot trains and is shown in (physics/worlds/*.json, one file read by both
// training/ and the web, so what is shown is what was trained). Each parameter is a range
// [min, max]: training draws a value per episode, the web shows the middle. No browser APIs here,
// so scripts/check-worlds.mjs uses it in Node.

/** Display order: the reference world first, then the harder ones. */
export const WORLD_ORDER = ['plano', 'piedras', 'resbaloso', 'viento'];

const mid = ([min, max]) => (min + max) / 2;

/** The one value per parameter that the web shows: the middle of each range. */
export function middleValues(world) {
  return {
    friction: mid(world.friction),
    mass_scale: mid(world.mass_scale),
    motor_scale: mid(world.motor_scale),
    wind_newtons: mid(world.wind_newtons),
  };
}
