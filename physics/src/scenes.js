// Places the robot shares the floor with: a kitchen, a warehouse, a sidewalk (physics/scenes/*.json),
// or one data/ detects in a video (docs/contrato.md, "Escenas"). A place is a list of objects; this
// turns it into MuJoCo geometry on top of the current scene, so the robot really bumps into a
// counter and can knock over a box. No browser APIs, so scripts/check-scenes.mjs runs it in Node.
//
// The robot's model collides through explicit contact pairs (its geoms have contype 0), so every
// object gets a pair with each collision geom of the robot, and loose objects one with the floor.
// Objects collide with each other through contype/conaffinity.

/** Display order of the preloaded places. */
export const SCENE_ORDER = ['cocina', 'deposito', 'vereda'];

// Colors by what the object is, so a place reads at a glance; anything else is a neutral gray.
const COLORS = {
  mesada: '0.86 0.84 0.80 1',
  heladera: '0.93 0.94 0.95 1',
  cocina: '0.25 0.26 0.28 1',
  mesa: '0.60 0.45 0.32 1',
  silla: '0.50 0.36 0.25 1',
  tacho: '0.30 0.55 0.40 1',
  estante: '0.35 0.42 0.52 1',
  caja: '0.72 0.56 0.36 1',
  palet: '0.62 0.50 0.34 1',
  barril: '0.20 0.35 0.60 1',
  cordon: '0.62 0.62 0.60 1',
  banco: '0.45 0.33 0.22 1',
  poste: '0.28 0.30 0.33 1',
  maceta: '0.55 0.38 0.30 1',
};
const GRAY = '0.6 0.6 0.62 1';
// A loose object with no mass given weighs this much: a full cardboard box or a light chair.
const DEFAULT_MASS_KG = 5;
// Contacts with places: rubber-ish soles on wood, tile or concrete (the floor's own pairs use 1).
const FRICTION = 1;

const f = (v) => +v.toFixed(4);

/** The names of the robot's collision geoms, read from its MJCF (g1_mjx.xml names them *_collision). */
export function collisionGeoms(robotXml) {
  return [...robotXml.matchAll(/<geom name="([A-Za-z0-9_]+_collision)"/g)].map((m) => m[1]);
}

/**
 * @param baseXml   the scene to add the place to (scene_mjx.xml, or a world's version of it)
 * @param robotXml  the robot file it includes, for the names of its collision geoms
 * @param place     { id, objects: [{ label, kind: "box" | "cylinder", size: [x, y, z] m (a
 *   cylinder's x is its diameter), pos: [x, y] m (the object rests on the floor), yaw rad,
 *   movable?: bool, mass?: kg }] }
 * @returns the MJCF of the base scene with the place in it
 */
export function placeXml(baseXml, robotXml, place) {
  const robot = collisionGeoms(robotXml);
  const ground = ['floor', ...(baseXml.includes('name="stones"') ? ['stones'] : [])];
  const bodies = [];
  const pairs = [];
  place.objects.forEach((o, i) => {
    const name = `place_${i}_${o.label}`.replace(/[^A-Za-z0-9_]/g, '_');
    const [sx, sy, sz] = o.size;
    const shape = o.kind === 'cylinder' ? `type="cylinder" size="${f(sx / 2)} ${f(sz / 2)}"` : `type="box" size="${f(sx / 2)} ${f(sy / 2)} ${f(sz / 2)}"`;
    const yaw = o.yaw ?? 0;
    const at = `pos="${f(o.pos[0])} ${f(o.pos[1])} ${f(sz / 2)}" quat="${f(Math.cos(yaw / 2))} 0 0 ${f(Math.sin(yaw / 2))}"`;
    const geom = `<geom name="${name}" ${shape} rgba="${COLORS[o.label] ?? GRAY}" contype="1" conaffinity="1" condim="3" friction="${FRICTION}"`;
    bodies.push(o.movable
      ? `    <body name="${name}_body" ${at}><freejoint/>${geom} mass="${o.mass ?? DEFAULT_MASS_KG}"/></body>`
      : `    ${geom} ${at}/>`);
    for (const r of robot) pairs.push(`    <pair geom1="${r}" geom2="${name}" condim="3" friction="${FRICTION} ${FRICTION}"/>`);
    if (o.movable) for (const g of ground) pairs.push(`    <pair geom1="${name}" geom2="${g}" condim="3" friction="${FRICTION} ${FRICTION}"/>`);
  });
  if (!baseXml.includes('</worldbody>') || !baseXml.includes('</contact>')) throw new Error('The base scene has no worldbody or contact section to add a place to.');
  return baseXml
    .replace('</worldbody>', `    <!-- Place "${place.id}" (physics/src/scenes.js) -->\n${bodies.join('\n')}\n  </worldbody>`)
    .replace('</contact>', `${pairs.join('\n')}\n  </contact>`);
}
