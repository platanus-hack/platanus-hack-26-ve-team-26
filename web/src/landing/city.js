// The landing's world around the street: a dusk sky (three.js Sky, procedural, no files), the
// robot lit and reflecting that same sky (a PMREM environment map made from it), and a city block
// on both sides of the road (Kenney City Kit Commercial, CC0, public/models/kenney/commercial).
// Everything is added on dress and taken out again on undress, so the app screens keep their look.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Sky } from 'three/addons/objects/Sky.js';

const BASE = `${import.meta.env.BASE_URL}models/kenney/commercial/`;
const BUILDINGS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((k) => `building-${k}.glb`);
const TOWERS = ['a', 'b', 'c'].map((k) => `building-skyscraper-${k}.glb`);

// Where the blocks stand, across the street (three.js x, meters; street.js draws the floor): the
// road the robot faces runs from 2.25 to 9.75 m and its far sidewalk to 14 m; behind the robot the
// floor repeats with another road from -13.75 to -6.25 m. The fronts stand past those sidewalks,
// farther than any landing shot puts the camera (6.5 m at most), so no building blocks a shot.
const FRONTS = [
  { x: 21, side: 1 },
  { x: -21, side: -1 },
];
const BUILDING_WIDTH_M = 9; // one model, which is about 1 unit wide, scaled to a 9 m frontage
const GAP_M = 1.5; // between neighbours
const ALONG_M = [-70, 30]; // along the street (three.js z): the walk heads toward -z
const TOWER_EVERY = 4; // every fourth lot is a tower, for a skyline

// Dusk: the sun just above the horizon, behind the far block. Turbidity and Rayleigh give the
// orange-to-blue gradient; the exposure the landing uses (1.35) is accounted for by keeping
// the sun low.
const SUN = { elevation: 3, azimuth: 200 };
const SKY = { turbidity: 6, rayleigh: 2.2, mieCoefficient: 0.006, mieDirectionalG: 0.85 };
// Dusk haze: dark blue-gray, thick enough that the blocks read as a skyline behind the robot
// instead of competing with the words over the shot.
const FOG = { color: 0x1b1d24, near: 6, far: 38 }; // buildings at 21-30 m end up ~50-80 % haze

const loader = new GLTFLoader();
const cache = new Map();
function load(file) {
  if (!cache.has(file)) cache.set(file, loader.loadAsync(BASE + file).then(({ scene }) => scene));
  return cache.get(file);
}

// Deterministic choices, so the block looks the same on every visit.
function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Dresses the viewer's scene as a city street at dusk.
 * @returns a function that takes it all out again
 */
export function dressCity(scene, renderer) {
  const added = [];
  const before = { fog: scene.fog, environment: scene.environment, background: scene.background };

  // Sky and sun.
  const sky = new Sky();
  sky.scale.setScalar(4500);
  const sun = new THREE.Vector3().setFromSphericalCoords(
    1,
    THREE.MathUtils.degToRad(90 - SUN.elevation),
    THREE.MathUtils.degToRad(SUN.azimuth),
  );
  const u = sky.material.uniforms;
  for (const [k, v] of Object.entries(SKY)) u[k].value = v;
  u.sunPosition.value.copy(sun);
  scene.add(sky);
  added.push(sky);

  // The robot reflects the same sky: an environment map rendered from it once.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const skyScene = new THREE.Scene();
  const skyCopy = new Sky();
  skyCopy.scale.setScalar(4500);
  for (const [k, v] of Object.entries(SKY)) skyCopy.material.uniforms[k].value = v;
  skyCopy.material.uniforms.sunPosition.value.copy(sun);
  skyScene.add(skyCopy);
  const envTarget = pmrem.fromScene(skyScene);
  scene.environment = envTarget.texture;
  scene.environmentIntensity = 0.45; // reflections, not a second sun
  scene.fog = new THREE.Fog(FOG.color, FOG.near, FOG.far);

  // The blocks.
  const block = new THREE.Group();
  block.name = 'landing-city';
  scene.add(block);
  added.push(block);
  const rand = random(26);
  let gone = false;
  const lots = [];
  for (const { x, side } of FRONTS) {
    let lot = 0;
    for (let z = ALONG_M[0]; z < ALONG_M[1]; z += BUILDING_WIDTH_M + GAP_M, lot++) {
      const tower = lot % TOWER_EVERY === 2;
      const list = tower ? TOWERS : BUILDINGS;
      lots.push({ file: list[Math.floor(rand() * list.length)], x, side, z, height: tower ? 1.6 + rand() * 0.8 : 0.9 + rand() * 0.5 });
    }
  }
  Promise.all(
    lots.map(async ({ file, x, side, z, height }) => {
      const model = (await load(file)).clone();
      if (gone) return;
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const s = BUILDING_WIDTH_M / Math.max(size.x, size.z);
      model.scale.set(s, s * height, s);
      // Each building faces the street: Kenney fronts look toward +z, so turn them by side.
      model.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      model.position.set(x + side * (size.z * s) / 2, -box.min.y * s * height, z + BUILDING_WIDTH_M / 2);
      block.add(model);
    }),
  ).catch((error) => console.error(error));

  return () => {
    gone = true;
    for (const object of added) scene.remove(object);
    sky.material.dispose();
    sky.geometry.dispose();
    skyCopy.material.dispose();
    skyCopy.geometry.dispose();
    envTarget.dispose();
    pmrem.dispose();
    scene.fog = before.fog;
    scene.environment = before.environment;
    scene.background = before.background;
  };
}
