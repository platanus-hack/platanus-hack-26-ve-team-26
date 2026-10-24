// The landing's world: a city street at dusk, laid out from the shots of home.js so that every shot
// has the street right behind the robot instead of an empty road. The street runs along x, the way
// the walk of Capture heads (home.js faceForward turns it to +x), so the robot walks along its own
// sidewalk: the road is on its right (-z) and its row of shops on its left (+z).
// Drawn here, with no image files: the floors (sidewalks, curbs and a road one curb below), the
// props (street lights, trees, parked cars, a bus stop, a café, shop signs) and a dusk sky the robot
// reflects. The buildings are Kenney City Kit Commercial (CC0, public/models/kenney/commercial);
// bins and plants come from the Furniture Kit. None of it is physics: the robot cannot hit
// it, so it stays out of where the robot walks and falls.
// Everything is added on dress and taken out on undress, so the app screens keep their look.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const BASE = `${import.meta.env.BASE_URL}models/kenney/`;
const BUILDINGS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((k) => `commercial/building-${k}.glb`);
const TOWERS = ['a', 'b', 'c'].map((k) => `commercial/building-skyscraper-${k}.glb`);
const PLANT = 'furniture/pottedPlant.glb';
const BIN = 'furniture/trashcan.glb';
// Kenney's commercial buildings are about 1 unit wide and 0.43 units a floor: at 8 m a unit a floor
// is 3.4 m and a shop door 2.2 m, so the robot (1.3 m) stands at the right size next to them.
const BUILDING_M = 8;
// The Furniture Kit's potted plant is 0.65 units tall; a shop's plant is 1.2 m.
const FURNITURE_M = 1.8;

// Across the street (z, meters), from the cameras of home.js. The two that come closest to a wall:
// Capture films from 3.3 m on the +z side of the robot (5.3 m on phones), so the shops stand just
// behind that; the Gym, Policy and closing shots film from over the road, down to z = -6.4.
const SHOPS_Z = 6.2; // the robot's row of shops
const CURB_Z = -2.2; // its curb: the walk drifts up to 1 m toward the road (z = -1.0)
const FAR_CURB_Z = -9.4; // 7.2 m of road: a parking lane on each side and one lane, one way, between
const FAR_SHOPS_Z = -12.4; // 3 m of far sidewalk, then the far row
const ROAD_DROP_M = 0.14; // the road lies a curb below; the sidewalks are the physics floor (y = 0)
const CURB_W = 0.22;
const STREET_M = 240; // floor length along x; the end buildings close the street well before
const ROW_X = [-74, 74]; // the two rows of shops, along x
const END_X = 78; // a row of buildings across each end of the street, so no shot looks into nothing
// Where the robot walks (x 0 to 7.5), falls (1.5 m around the origin) and where the cameras fly,
// shots and the moves between them: nothing above the floor stands here, so no prop hides the
// robot or cuts through the lens. Signs and awnings on the walls are high enough to pass over.
const KEEP_CLEAR = [
  { x: [-9, 12], z: [-7, 1.6] }, // the walk, the falls and the cameras over the road
  { x: [-2.5, 12], z: [-7, 5.8] }, // Capture's camera, beside the walk
];
const CROSSWALK_X = -25; // past the bus stop, in the hero's view down the street
const isClear = (x, z, r = 0.5) => !KEEP_CLEAR.some((k) => x + r > k.x[0] && x - r < k.x[1] && z + r > k.z[0] && z - r < k.z[1]);

// Dusk: the sun just above the horizon, behind the far row (-z), so Capture, which films toward it,
// gets the glow over the roofs. Turbidity and Rayleigh give the orange-to-blue gradient.
const SUN = { elevation: 3, azimuth: 200 };
const SKY = { turbidity: 6, rayleigh: 2.2, mieCoefficient: 0.006, mieDirectionalG: 0.85 };
// Dusk haze: the near facades (6 to 20 m from every camera) stay sharp, the street's far end
// (78 m) fades into a silhouette.
const FOG = { color: 0x1b1d24, near: 14, far: 95 };
// Kenney's colormap is a palette of pastel swatches, bright as noon: at dusk the walls take a
// fraction of it, and the windows light up. The glass is the pale blue swatch (column 11 of 16, row
// 1 of 4, the only one every building's window panes use), so an emissive map lit only there turns
// on every window, shop fronts included.
const WALL_SHADE = 0.2;
const GLASS_SWATCH = { x: [11 / 16, 12 / 16], y: [1 / 4, 2 / 4] }; // as a share of the colormap
const WINDOW_LIGHT = { color: 0xffa451, intensity: 0.75 };
const WARM = 0xffc58a; // the street lights' sodium-ish white

const loader = new GLTFLoader();
const cache = new Map();
// Each model once: shadows off (only the robot casts one) and, for the buildings, the window glow.
function load(file) {
  if (!cache.has(file)) {
    cache.set(
      file,
      loader.loadAsync(BASE + file).then(({ scene }) => {
        scene.traverse((o) => {
          if (!o.isMesh) return;
          o.castShadow = false;
          o.receiveShadow = file.startsWith('commercial');
          if (file.startsWith('commercial') && o.material.map) dusk(o.material);
        });
        scene.userData.size = new THREE.Box3().setFromObject(scene).getSize(new THREE.Vector3());
        return scene;
      }),
    );
  }
  return cache.get(file);
}

function dusk(material) {
  if (material.userData.dusk) return;
  material.userData.dusk = true;
  material.color.multiplyScalar(WALL_SHADE);
  const image = material.map.image;
  const canvas = Object.assign(document.createElement('canvas'), { width: image.width, height: image.height });
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fff';
  const { x, y } = GLASS_SWATCH;
  ctx.fillRect(x[0] * canvas.width, y[0] * canvas.height, (x[1] - x[0]) * canvas.width, (y[1] - y[0]) * canvas.height);
  const glow = new THREE.CanvasTexture(canvas);
  glow.flipY = material.map.flipY; // the same UVs as the colormap
  material.emissiveMap = glow;
  material.emissive = new THREE.Color(WINDOW_LIGHT.color);
  material.emissiveIntensity = WINDOW_LIGHT.intensity;
  material.needsUpdate = true;
}

// Deterministic choices, so the street looks the same on every visit.
function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTexture(renderer, width, height, draw, { repeat = true } = {}) {
  const canvas = Object.assign(document.createElement('canvas'), { width, height });
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  if (repeat) texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}

// ---- Floors ----

const SIDEWALK_PX = 128; // 1 cm ≈ 1 px where the robot stands, close to the hero's camera
const SIDEWALK_PERIOD_M = 8;
// Concrete slabs of 1 x 1 m, each a shade apart, with seams, grain and a few old stains. Dark on
// purpose: the landing lights the robot brightly, and a light floor would wash out the words.
function drawSidewalk(ctx, size) {
  const rand = random(7);
  ctx.fillStyle = '#2d2c29';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < SIDEWALK_PERIOD_M; i++) {
    for (let j = 0; j < SIDEWALK_PERIOD_M; j++) {
      const shade = rand() * 0.06 - 0.03;
      ctx.fillStyle = shade > 0 ? `rgba(255,255,255,${shade})` : `rgba(0,0,0,${-shade * 2})`;
      ctx.fillRect(i * SIDEWALK_PX, j * SIDEWALK_PX, SIDEWALK_PX, SIDEWALK_PX);
    }
  }
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.beginPath();
    ctx.ellipse(rand() * size, rand() * size, (0.2 + rand() * 0.6) * SIDEWALK_PX, (0.15 + rand() * 0.4) * SIDEWALK_PX, rand() * Math.PI, 0, 2 * Math.PI);
    ctx.fill();
  }
  for (let i = 0; i < 30000; i++) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)';
    ctx.fillRect(rand() * size, rand() * size, 2, 2);
  }
  ctx.fillStyle = '#181816';
  for (let k = 0; k <= SIDEWALK_PERIOD_M; k++) {
    ctx.fillRect(k * SIDEWALK_PX - 1, 0, 3, size);
    ctx.fillRect(0, k * SIDEWALK_PX - 1, size, 3);
  }
}

const ROAD_PX = 64;
const ROAD_PERIOD_M = 24; // one arrow and four parking bays per period
const PARKING_M = 2.1; // each parking lane, from its curb
const BAY_M = 6;
// The road from above: canvas x is the street's x, canvas y runs from the far curb (top) to the
// robot's curb (bottom). Asphalt, gutters, the tire tracks of the lane, parking bays and an arrow
// for the one-way lane, all a little worn.
function drawRoad(ctx, w, h) {
  const rand = random(11);
  const y = (z) => (z - FAR_CURB_Z) * ROAD_PX; // z → canvas y
  const paint = (alpha) => `rgba(214,208,192,${alpha})`;
  ctx.fillStyle = '#1b1b1a';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.025)';
    ctx.fillRect(rand() * w, rand() * h, (1 + rand() * 4) * ROAD_PX, (0.6 + rand() * 1.5) * ROAD_PX);
  }
  ctx.fillStyle = '#242321'; // gutters
  ctx.fillRect(0, 0, w, 0.35 * ROAD_PX);
  ctx.fillRect(0, h - 0.35 * ROAD_PX, w, 0.35 * ROAD_PX);
  const lane = (CURB_Z + FAR_CURB_Z) / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.2)'; // tire tracks
  for (const side of [-1, 1]) ctx.fillRect(0, y(lane + side * 0.78) - 0.25 * ROAD_PX, w, 0.5 * ROAD_PX);
  for (let i = 0; i < 50000; i++) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.15)';
    ctx.fillRect(rand() * w, rand() * h, 2, 2);
  }
  // Parking lanes: an edge line and the bays' separators.
  for (const [curb, out] of [
    [FAR_CURB_Z, FAR_CURB_Z + PARKING_M],
    [CURB_Z, CURB_Z - PARKING_M],
  ]) {
    ctx.fillStyle = paint(0.5);
    ctx.fillRect(0, y(out) - 3, w, 6);
    for (let x = 0; x < ROAD_PERIOD_M; x += BAY_M) ctx.fillRect(x * ROAD_PX - 3, Math.min(y(curb), y(out)), 6, PARKING_M * ROAD_PX);
  }
  // The one-way arrow, toward +x.
  const ay = y(lane);
  const ax = 10 * ROAD_PX;
  ctx.fillStyle = paint(0.62);
  ctx.fillRect(ax, ay - 0.09 * ROAD_PX, 2.6 * ROAD_PX, 0.18 * ROAD_PX);
  ctx.beginPath();
  ctx.moveTo(ax + 3.6 * ROAD_PX, ay);
  ctx.lineTo(ax + 2.5 * ROAD_PX, ay - 0.32 * ROAD_PX);
  ctx.lineTo(ax + 2.5 * ROAD_PX, ay + 0.32 * ROAD_PX);
  ctx.fill();
  // Wear on the paint.
  for (let i = 0; i < 6000; i++) {
    ctx.fillStyle = 'rgba(27,27,26,0.6)';
    ctx.fillRect(rand() * w, rand() * h, 3, 3);
  }
}

function floors(renderer, add) {
  const sidewalk = canvasTexture(renderer, SIDEWALK_PERIOD_M * SIDEWALK_PX, SIDEWALK_PERIOD_M * SIDEWALK_PX, (ctx, size) => drawSidewalk(ctx, size));
  const road = canvasTexture(renderer, ROAD_PERIOD_M * ROAD_PX, (CURB_Z - FAR_CURB_Z) * ROAD_PX, drawRoad);
  // A floor strip along the street, from z0 to z1, at height y.
  const strip = (z0, z1, y, map, period) => {
    const depth = z1 - z0;
    const texture = map.clone();
    texture.repeat.set(STREET_M / period[0], depth / period[1]);
    texture.needsUpdate = true;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(STREET_M, depth), new THREE.MeshStandardMaterial({ map: texture, roughness: 0.92 }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(0, y, (z0 + z1) / 2);
    mesh.receiveShadow = true;
    add(mesh);
  };
  const S = [SIDEWALK_PERIOD_M, SIDEWALK_PERIOD_M];
  strip(CURB_Z + CURB_W, SHOPS_Z + 14, 0, sidewalk, S);
  strip(FAR_SHOPS_Z - 14, FAR_CURB_Z - CURB_W, 0, sidewalk, S);
  strip(FAR_CURB_Z, CURB_Z, -ROAD_DROP_M, road, [ROAD_PERIOD_M, CURB_Z - FAR_CURB_Z]);
  // Curbstones, a few millimeters proud of the sidewalk.
  const curbs = new THREE.MeshStandardMaterial({ color: 0x55524c, roughness: 0.85 });
  for (const [z, side] of [
    [CURB_Z, 1],
    [FAR_CURB_Z, -1],
  ]) {
    const curb = new THREE.Mesh(new THREE.BoxGeometry(STREET_M, ROAD_DROP_M + 0.04, CURB_W), curbs);
    curb.position.set(0, 0.006 - (ROAD_DROP_M + 0.04) / 2, z + (side * CURB_W) / 2);
    curb.receiveShadow = true;
    add(curb);
  }
  sidewalk.dispose();
  road.dispose();
}

// ---- Props, merged by material: a few draw calls for the whole street ----

class Batch {
  constructor() {
    this.parts = new Map(); // material -> geometries in world position
  }
  add(geometry, material, { x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0 } = {}) {
    const g = (geometry.index ? geometry.toNonIndexed() : geometry.clone()).applyMatrix4(
      new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1)),
    );
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!this.parts.has(material)) this.parts.set(material, []);
    this.parts.get(material).push(g);
  }
  meshes() {
    return [...this.parts].map(([material, list]) => {
      const mesh = new THREE.Mesh(mergeGeometries(list), material);
      list.forEach((g) => g.dispose());
      return mesh;
    });
  }
}

const M = {
  metal: new THREE.MeshStandardMaterial({ color: 0x2b2d31, metalness: 0.6, roughness: 0.45 }),
  lamp: new THREE.MeshBasicMaterial({ color: 0xfff0d6 }),
  trunk: new THREE.MeshStandardMaterial({ color: 0x3a2d23, roughness: 0.95 }),
  leavesA: new THREE.MeshStandardMaterial({ color: 0x2f4d2c, roughness: 0.9, flatShading: true }),
  leavesB: new THREE.MeshStandardMaterial({ color: 0x3d5c33, roughness: 0.9, flatShading: true }),
  pit: new THREE.MeshStandardMaterial({ color: 0x141412, roughness: 1 }),
  glass: new THREE.MeshStandardMaterial({ color: 0xa9c0d0, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.2, depthWrite: false }),
  carGlass: new THREE.MeshStandardMaterial({ color: 0x0c1015, roughness: 0.08, metalness: 0.85 }),
  tire: new THREE.MeshStandardMaterial({ color: 0x121212, roughness: 0.9 }),
  rim: new THREE.MeshStandardMaterial({ color: 0x8a8d91, metalness: 0.8, roughness: 0.35 }),
  headlight: new THREE.MeshBasicMaterial({ color: 0xd9d2c0 }),
  taillight: new THREE.MeshBasicMaterial({ color: 0x7a1414 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x6b4a33, roughness: 0.8 }),
  tabletop: new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.5 }),
  hydrant: new THREE.MeshStandardMaterial({ color: 0xb8902a, roughness: 0.6 }),
  signalRed: new THREE.MeshBasicMaterial({ color: 0xff3b2a }),
  signalOff: new THREE.MeshBasicMaterial({ color: 0x2a2a2a }),
};
const paints = new Map(); // car color -> material, so cars of one color share a draw call
const paint = (color) => {
  if (!paints.has(color)) paints.set(color, new THREE.MeshStandardMaterial({ color, metalness: 0.55, roughness: 0.32 }));
  return paints.get(color);
};
// Muted city colors: white and silver mostly, one taxi yellow in ten. Cars take them in turn,
// stepping by 3 (coprime with 10), so no two neighbours share a color.
const CAR_COLORS = [0xd8d5ce, 0x8d939a, 0x1d2735, 0xd8d5ce, 0x6e1d1d, 0x262626, 0x8d939a, 0xc9a227, 0x3c5848, 0x56626b];

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cylinder = (r0, r1, h, n = 10) => new THREE.CylinderGeometry(r0, r1, h, n);

// A street light on the curb at (x, z); `toward` is the side of the road (-1: -z).
function streetLight(b, x, z, toward) {
  b.add(cylinder(0.16, 0.19, 0.5), M.metal, { x, y: 0.25, z });
  b.add(cylinder(0.055, 0.085, 6), M.metal, { x, y: 3, z });
  b.add(box(0.07, 0.07, 1.5), M.metal, { x, y: 5.95, z: z + toward * 0.7 });
  b.add(box(0.34, 0.12, 0.72), M.metal, { x, y: 5.9, z: z + toward * 1.4 });
  b.add(box(0.28, 0.02, 0.6), M.lamp, { x, y: 5.835, z: z + toward * 1.4 });
}

// A street tree in its pit: a trunk and a few low-poly clumps of leaves.
function tree(b, x, z, rand) {
  b.add(box(1.2, 0.01, 1.2), M.pit, { x, y: 0.005, z });
  b.add(cylinder(0.09, 0.14, 3.2, 7), M.trunk, { x, y: 1.6, z });
  const clumps = 4 + Math.floor(rand() * 3);
  for (let i = 0; i < clumps; i++) {
    const r = 0.8 + rand() * 0.7;
    const a = rand() * 2 * Math.PI;
    const d = i === 0 ? 0 : 0.5 + rand() * 0.6;
    b.add(new THREE.IcosahedronGeometry(r, 1), rand() < 0.5 ? M.leavesA : M.leavesB, {
      x: x + Math.cos(a) * d,
      y: 3.7 + rand() * 1.1,
      z: z + Math.sin(a) * d,
      ry: rand() * Math.PI,
    });
  }
}

// A parked car, 4.4 m long, nose toward +x × dir. Low-poly: a body, a dark greenhouse, a roof,
// four wheels and its lights.
const CAR_SIDE = [
  [-2.2, 0.32],
  [2.2, 0.32],
  [2.22, 0.72],
  [1.95, 0.86],
  [0.95, 0.94],
  [-1.7, 0.98],
  [-2.22, 0.92],
];
const CAR_CABIN = [
  [1.0, 0.9],
  [0.32, 1.4],
  [-0.95, 1.4],
  [-1.72, 0.94],
];
const extrude = (points, width) => {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2 });
  g.translate(0, 0, -width / 2);
  return g;
};
const carBody = extrude(CAR_SIDE, 1.68);
const carCabin = extrude(CAR_CABIN, 1.5);
function car(b, x, z, dir, color) {
  const y = -ROAD_DROP_M;
  const ry = dir > 0 ? 0 : Math.PI;
  const at = (lx, ly, lz) => ({ x: x + dir * lx, y: y + ly, z: z + dir * lz, ry });
  b.add(carBody, paint(color), at(0, 0, 0));
  b.add(carCabin, M.carGlass, at(0, 0, 0));
  b.add(box(1.25, 0.05, 1.6), paint(color), at(-0.32, 1.43, 0));
  for (const wx of [-1.38, 1.38]) {
    for (const wz of [-0.8, 0.8]) {
      b.add(cylinder(0.33, 0.33, 0.24, 14), M.tire, { ...at(wx, 0.33, wz), rx: Math.PI / 2 });
      b.add(cylinder(0.2, 0.2, 0.25, 10), M.rim, { ...at(wx, 0.33, wz), rx: Math.PI / 2 });
    }
  }
  for (const wz of [-0.58, 0.58]) {
    b.add(box(0.06, 0.1, 0.32), M.headlight, at(2.24, 0.7, wz));
    b.add(box(0.06, 0.1, 0.3), M.taillight, at(-2.24, 0.82, wz));
  }
}

// A bench of slats on two metal legs, `length` along x, its back toward +z × back.
function bench(b, x, z, back, length = 1.8) {
  for (const lx of [-length / 2 + 0.15, length / 2 - 0.15]) b.add(box(0.06, 0.45, 0.5), M.metal, { x: x + lx, y: 0.225, z });
  for (let k = 0; k < 3; k++) b.add(box(length, 0.04, 0.13), M.wood, { x, y: 0.46, z: z - 0.17 + k * 0.17 });
  for (let k = 0; k < 2; k++) b.add(box(length, 0.12, 0.04), M.wood, { x, y: 0.62 + k * 0.16, z: z + back * 0.26, rx: back * 0.15 });
}

// A café chair of dark metal, facing `ry` (0: toward -z).
function chair(b, x, z, ry) {
  const at = (lx, ly, lz) => ({ x: x + lx * Math.cos(ry) + lz * Math.sin(ry), y: ly, z: z - lx * Math.sin(ry) + lz * Math.cos(ry), ry });
  b.add(box(0.42, 0.035, 0.42), M.metal, at(0, 0.46, 0));
  for (const lx of [-0.18, 0.18]) {
    for (const lz of [-0.18, 0.18]) b.add(cylinder(0.014, 0.014, 0.46, 6), M.metal, at(lx, 0.23, lz));
    b.add(cylinder(0.014, 0.014, 0.42, 6), M.metal, at(lx, 0.67, 0.19));
  }
  b.add(box(0.4, 0.12, 0.02), M.wood, at(0, 0.8, 0.2));
}

// ---- Things with their own texture: signs, the bus stop's ad, the café's awning ----

const FONT = "'Inter Tight Variable', system-ui, sans-serif";
// A shop sign: glowing letters on a dark panel. Unlit (MeshBasicMaterial) and not tone mapped, so
// it reads as a light source at dusk.
function sign(renderer, text, { color = '#ffb36b', width = 4, height = 0.9, panel = '#121212', glyph = null } = {}) {
  const px = 128;
  const texture = canvasTexture(
    renderer,
    width * px,
    height * px,
    (ctx, w, h) => {
      ctx.fillStyle = panel;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, w - 6, h - 6);
      ctx.font = `700 ${Math.round(h * 0.52)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      const tx = glyph ? w / 2 + h * 0.35 : w / 2;
      for (const blur of [h * 0.3, h * 0.12, 0]) {
        ctx.shadowBlur = blur;
        ctx.fillText(text, tx, h * 0.54);
      }
      if (glyph === 'cross') {
        // A pharmacy's green cross, before the word.
        const s = h * 0.5;
        const cx = tx - ctx.measureText(text).width / 2 - h * 0.55;
        ctx.fillRect(cx - s / 6, h / 2 - s / 2, s / 3, s);
        ctx.fillRect(cx - s / 2, h / 2 - s / 6, s, s / 3);
      }
    },
    { repeat: false },
  );
  return new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
}

// The bus stop's ad: a lit poster.
function posterTexture(renderer) {
  return canvasTexture(
    renderer,
    256,
    384,
    (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#2a3b5c');
      g.addColorStop(1, '#e0794a');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,240,220,0.9)';
      ctx.beginPath();
      ctx.arc(w * 0.5, h * 0.42, w * 0.22, 0, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath(); // a mountain line: the Ávila over the city
      ctx.moveTo(0, h * 0.62);
      ctx.lineTo(w * 0.25, h * 0.5);
      ctx.lineTo(w * 0.45, h * 0.58);
      ctx.lineTo(w * 0.7, h * 0.46);
      ctx.lineTo(w, h * 0.6);
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.fill();
      ctx.fillStyle = '#f4efe6';
      ctx.font = `800 40px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('CARACAS', w / 2, h * 0.82);
      ctx.font = `500 18px ${FONT}`;
      ctx.fillText('de noche también', w / 2, h * 0.9);
    },
    { repeat: false },
  );
}

function awningTexture(renderer) {
  return canvasTexture(
    renderer,
    512,
    64,
    (ctx, w, h) => {
      for (let i = 0; i < 16; i++) {
        ctx.fillStyle = i % 2 ? '#e8dfcc' : '#b5432a';
        ctx.fillRect((i * w) / 16, 0, w / 16, h);
      }
    },
    { repeat: false },
  );
}

// A soft pool of light on the floor, under a street light or a café.
function poolTexture(renderer) {
  return canvasTexture(
    renderer,
    128,
    128,
    (ctx, w) => {
      const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      g.addColorStop(0, 'rgba(255,196,130,0.5)');
      g.addColorStop(0.5, 'rgba(255,180,110,0.18)');
      g.addColorStop(1, 'rgba(255,170,100,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, w);
    },
    { repeat: false },
  );
}

function crosswalkTexture(renderer) {
  const width = 3.2;
  const depth = CURB_Z - FAR_CURB_Z;
  return canvasTexture(
    renderer,
    width * ROAD_PX,
    depth * ROAD_PX,
    (ctx, w, h) => {
      const rand = random(3);
      ctx.fillStyle = 'rgba(214,208,192,0.7)';
      for (let z = 0.4; z < depth - 0.3; z += 1) ctx.fillRect(0, z * ROAD_PX, w, 0.5 * ROAD_PX);
      ctx.globalCompositeOperation = 'destination-out'; // worn by the tires
      for (let i = 0; i < 2500; i++) ctx.fillRect(rand() * w, rand() * h, 3, 3);
    },
    { repeat: false },
  );
}

/**
 * Dresses the viewer's scene as a city street at dusk, and hides its own floor and grid.
 * @returns a function that takes it all out again
 */
export function dressCity(scene, renderer) {
  const before = { fog: scene.fog, environment: scene.environment, background: scene.background, environmentIntensity: scene.environmentIntensity };
  const city = new THREE.Group();
  city.name = 'landing-city';
  scene.add(city);
  const add = (object) => city.add(object);
  const rand = random(26);
  let gone = false;

  // The viewer's floor and grid give way to the street's.
  const hidden = scene.children.filter((o) => o.isGridHelper || (o.isMesh && o.geometry?.type === 'PlaneGeometry'));
  const wasVisible = hidden.map((o) => o.visible);
  hidden.forEach((o) => (o.visible = false));

  // Sky and sun.
  const sun = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - SUN.elevation), THREE.MathUtils.degToRad(SUN.azimuth));
  const makeSky = () => {
    const sky = new Sky();
    sky.scale.setScalar(4500);
    for (const [k, v] of Object.entries(SKY)) sky.material.uniforms[k].value = v;
    sky.material.uniforms.sunPosition.value.copy(sun);
    return sky;
  };
  const sky = makeSky();
  add(sky);
  // The robot reflects the same sky: an environment map rendered from it once.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const skyScene = new THREE.Scene();
  const skyCopy = makeSky();
  skyScene.add(skyCopy);
  const envTarget = pmrem.fromScene(skyScene);
  scene.environment = envTarget.texture;
  scene.environmentIntensity = 0.45; // reflections, not a second sun
  scene.fog = new THREE.Fog(FOG.color, FOG.near, FOG.far);

  floors(renderer, add);

  // ---- Props ----
  const b = new Batch();
  const pool = new THREE.MeshBasicMaterial({ map: poolTexture(renderer), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const pools = [];
  const lightPool = (x, y, z, r) => pools.push({ x, y, z, r });

  // Street lights every 18 m on both curbs, staggered, and trees between them.
  for (let x = -66; x <= 70; x += 18) {
    for (const [z, toward, offset] of [
      [CURB_Z + 0.45, -1, 0],
      [FAR_CURB_Z - 0.45, 1, 9],
    ]) {
      const lx = x + offset;
      if (isClear(lx, z, 0.6)) {
        streetLight(b, lx, z, toward);
        lightPool(lx, 0.012, z - toward * 0.6, 3.2);
        lightPool(lx, -ROAD_DROP_M + 0.012, z + toward * 1.8, 2.6);
      }
      const tx = lx + 9;
      if (isClear(tx, z - toward * 0.25, 1.4)) tree(b, tx, z - toward * 0.25, rand);
    }
  }
  // Two of them really light the street near the robot; the rest only glow (point lights cost).
  const lamps = [
    [-12, CURB_Z + 0.45 - 1.4],
    [15, FAR_CURB_Z - 0.45 + 1.4],
  ];
  for (const [x, z] of lamps) {
    const light = new THREE.PointLight(WARM, 60, 22, 1.6);
    light.position.set(x, 5.6, z);
    add(light);
  }

  // Parked cars: the far lane all along, the near lane away from the cameras.
  let colorTurn = 0;
  for (let x = -70; x < 70; x += BAY_M) {
    // One way: every car faces +x. The far lane is clear of the cameras by its width (0.9 m).
    for (const [z, dir, r] of [
      [FAR_CURB_Z + 1.05, 1, 0.9],
      [CURB_Z - 1.05, 1, 2.3],
    ]) {
      if (rand() < 0.3 || !isClear(x + BAY_M / 2, z, r) || Math.abs(x + BAY_M / 2 - CROSSWALK_X) < 5) continue;
      colorTurn = (colorTurn + 3) % CAR_COLORS.length;
      car(b, x + BAY_M / 2 + (rand() - 0.5) * 0.6, z + (rand() - 0.5) * 0.15, dir, CAR_COLORS[colorTurn]);
    }
  }

  // A bus stop on the robot's sidewalk, facing the road, just past the hero's left shoulder.
  const stop = { x: -15.5, z: CURB_Z + 1.5 };
  for (const sx of [-1.9, 1.9]) for (const sz of [-0.6, 0.6]) b.add(box(0.07, 2.5, 0.07), M.metal, { x: stop.x + sx, y: 1.25, z: stop.z + sz });
  b.add(box(4.1, 0.08, 1.6), M.metal, { x: stop.x, y: 2.52, z: stop.z });
  b.add(box(3.8, 2.0, 0.03), M.glass, { x: stop.x, y: 1.3, z: stop.z + 0.6 });
  bench(b, stop.x, stop.z + 0.3, 1, 2.4);
  const poster = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.8), new THREE.MeshBasicMaterial({ map: posterTexture(renderer), toneMapped: false }));
  poster.position.set(stop.x - 2.0, 1.25, stop.z);
  poster.rotation.y = -Math.PI / 2; // faces down the street, toward the hero's camera
  add(poster);
  const posterBack = poster.clone();
  posterBack.rotation.y = Math.PI / 2;
  posterBack.position.x -= 0.02;
  add(posterBack);
  b.add(box(0.06, 1.95, 1.3), M.metal, { x: stop.x - 2.01, y: 1.25, z: stop.z });

  // A crosswalk, with its pedestrian lights, ahead of the bus stop.
  const crosswalk = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, CURB_Z - FAR_CURB_Z),
    new THREE.MeshStandardMaterial({ map: crosswalkTexture(renderer), transparent: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  crosswalk.rotation.x = -Math.PI / 2;
  crosswalk.position.set(CROSSWALK_X, -ROAD_DROP_M + 0.004, (CURB_Z + FAR_CURB_Z) / 2);
  crosswalk.receiveShadow = true;
  add(crosswalk);
  for (const [z, face] of [
    [CURB_Z + 0.4, -1],
    [FAR_CURB_Z - 0.4, 1],
  ]) {
    b.add(cylinder(0.05, 0.05, 2.8), M.metal, { x: CROSSWALK_X - 2, y: 1.4, z });
    b.add(box(0.3, 0.6, 0.25), M.metal, { x: CROSSWALK_X - 2, y: 2.6, z });
    b.add(box(0.2, 0.18, 0.02), M.signalRed, { x: CROSSWALK_X - 2, y: 2.75, z: z + face * 0.13 });
    b.add(box(0.2, 0.18, 0.02), M.signalOff, { x: CROSSWALK_X - 2, y: 2.5, z: z + face * 0.13 });
  }

  // A café at the foot of the robot's row: an awning, bistro tables and chairs, and plants. It sits
  // right behind the robot in the hero, the Gym and Policy.
  const cafe = { x: -7.5, z: SHOPS_Z };
  const awning = new THREE.Mesh(new THREE.PlaneGeometry(7, 2.2), new THREE.MeshStandardMaterial({ map: awningTexture(renderer), side: THREE.DoubleSide, roughness: 0.8 }));
  awning.position.set(cafe.x, 3.05, cafe.z - 1.0);
  awning.rotation.x = -Math.PI / 2 - 0.38; // sloping down toward the street
  add(awning);
  b.add(box(7, 0.25, 0.06), M.wood, { x: cafe.x, y: 2.62, z: cafe.z - 2.05 }); // its valance
  const tables = [
    [-9.8, 4.2],
    [-7.3, 3.4],
    [-5.0, 4.4],
    [-8.4, 5.4],
  ];
  for (const [tx, tz] of tables) {
    b.add(cylinder(0.36, 0.36, 0.035, 18), M.tabletop, { x: tx, y: 0.74, z: tz });
    b.add(cylinder(0.03, 0.03, 0.72), M.metal, { x: tx, y: 0.37, z: tz });
    b.add(cylinder(0.22, 0.24, 0.03, 14), M.metal, { x: tx, y: 0.015, z: tz });
    chair(b, tx - 0.55, tz, -Math.PI / 2);
    chair(b, tx + 0.55, tz, Math.PI / 2);
  }
  const cafeLight = new THREE.PointLight(WARM, 25, 9, 1.6);
  cafeLight.position.set(cafe.x, 2.4, cafe.z - 1.2);
  add(cafeLight);
  lightPool(cafe.x, 0.012, cafe.z - 1.6, 4.2);

  // Benches, bins and a hydrant along the sidewalks.
  for (const [x, z, back] of [
    [-24, SHOPS_Z - 0.7, 1],
    [20, SHOPS_Z - 0.7, 1],
    [-34, FAR_SHOPS_Z + 0.7, -1],
    [6, FAR_SHOPS_Z + 0.7, -1],
    [30, FAR_SHOPS_Z + 0.7, -1],
  ]) {
    if (isClear(x, z, 1)) bench(b, x, z, back);
  }
  b.add(cylinder(0.11, 0.13, 0.6, 10), M.hydrant, { x: -10.5, y: 0.3, z: CURB_Z + 0.5 });
  b.add(cylinder(0.14, 0.14, 0.08, 10), M.hydrant, { x: -10.5, y: 0.62, z: CURB_Z + 0.5 });
  b.add(cylinder(0.05, 0.05, 0.36, 8), M.hydrant, { x: -10.5, y: 0.42, z: CURB_Z + 0.5, rz: Math.PI / 2 });
  const bins = [
    [-11.4, CURB_Z + 0.55],
    [14.2, CURB_Z + 0.55],
    [-2, FAR_CURB_Z - 0.6],
    [12, FAR_CURB_Z - 0.6],
  ];
  const plants = [
    [-11.2, SHOPS_Z - 0.4],
    [-3.6, SHOPS_Z - 0.4],
    [-17, SHOPS_Z - 0.4],
    [3, FAR_SHOPS_Z + 0.4],
    [-5, FAR_SHOPS_Z + 0.4],
  ];

  for (const { x, y, z, r } of pools) {
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(2 * r, 2 * r), pool);
    decal.rotation.x = -Math.PI / 2;
    decal.position.set(x, y, z);
    decal.renderOrder = 1;
    add(decal);
  }
  for (const mesh of b.meshes()) add(mesh);

  // Shop signs: on the robot's row (they face -z, seen in the hero, the Gym and Policy) and on the
  // far row (they face +z, behind the robot in Capture).
  const SIGNS = [
    { text: 'CAFÉ', x: cafe.x, z: SHOPS_Z - 0.08, y: 3.75, face: -1, width: 2.6, color: '#ffb36b' },
    { text: 'FARMACIA', x: -21, z: SHOPS_Z - 0.08, y: 3.4, face: -1, width: 4.4, color: '#7dffa8', glyph: 'cross' },
    { text: 'LIBRERÍA', x: 16, z: SHOPS_Z - 0.08, y: 3.4, face: -1, width: 3.8, color: '#ffd9a0' },
    { text: 'PANADERÍA', x: -1.5, z: FAR_SHOPS_Z + 0.08, y: 3.4, face: 1, width: 4.6, color: '#ffc46b' },
    { text: 'ABIERTO 24 H', x: 7.5, z: FAR_SHOPS_Z + 0.08, y: 3.2, face: 1, width: 4.4, color: '#ff6a5a' },
    { text: 'FERRETERÍA', x: -14, z: FAR_SHOPS_Z + 0.08, y: 3.4, face: 1, width: 4.8, color: '#9fd0ff' },
    { text: 'AREPERA', x: 22, z: FAR_SHOPS_Z + 0.08, y: 3.4, face: 1, width: 3.8, color: '#ffb36b' },
  ];
  for (const { text, x, y, z, face, width, color, glyph } of SIGNS) {
    const mesh = sign(renderer, text, { width, color, glyph });
    mesh.position.set(x, y, z);
    mesh.rotation.y = face > 0 ? 0 : Math.PI;
    add(mesh);
  }

  // ---- Buildings, and the Kenney furniture ----
  // Each row is a run of shops wall to wall along x, a few set back a little, with towers behind
  // for a skyline and a row across each end of the street.
  const files = [...BUILDINGS, ...TOWERS, PLANT, BIN];
  Promise.all(files.map(load))
    .then(() => {
      if (gone) return;
      const place = async (file, { x, z, ry, scale = BUILDING_M }) => {
        const model = (await load(file)).clone();
        model.scale.setScalar(scale);
        model.rotation.y = ry;
        model.position.set(x, 0, z);
        model.userData.shared = true; // geometry and materials belong to the cache
        add(model);
      };
      const sizeOf = async (file) => (await load(file)).userData.size.clone().multiplyScalar(BUILDING_M);
      const row = async (front, facing) => {
        for (let x = ROW_X[0]; x < ROW_X[1]; ) {
          // A taller one now and then (f and g have four floors), never two towers in a row.
          const file = BUILDINGS[Math.floor(rand() * BUILDINGS.length)];
          const size = await sizeOf(file);
          // Set back a little now and then, but not where the shop signs hang (x -30 to 30).
          const setback = rand() < 0.25 && Math.abs(x) > 30 ? 0.4 + rand() * 0.8 : 0;
          await place(file, { x: x + size.x / 2, z: front + facing * (size.z / 2 + setback), ry: facing > 0 ? 0 : Math.PI });
          x += size.x + 0.15;
        }
      };
      return Promise.all([
        row(SHOPS_Z, 1),
        row(FAR_SHOPS_Z, -1),
        // Across the ends: their fronts face back down the street (Kenney fronts look toward -z).
        ...[-1, 1].flatMap((end) =>
          [FAR_SHOPS_Z - 4, (FAR_SHOPS_Z + SHOPS_Z) / 2, SHOPS_Z + 4].map(async (z, i) => {
            const file = BUILDINGS[(i * 3 + (end > 0 ? 1 : 4)) % BUILDINGS.length];
            const size = await sizeOf(file);
            await place(file, { x: end * (END_X + size.z / 2), z, ry: (end * Math.PI) / 2 });
          }),
        ),
        // Towers behind both rows.
        ...Array.from({ length: 16 }, async (_, i) => {
          const side = i % 2 ? 1 : -1;
          const x = -70 + (i >> 1) * 19 + rand() * 8;
          const z = side > 0 ? SHOPS_Z + 16 + rand() * 18 : FAR_SHOPS_Z - 16 - rand() * 18;
          await place(TOWERS[Math.floor(rand() * TOWERS.length)], { x, z, ry: side > 0 ? 0 : Math.PI, scale: BUILDING_M * (0.9 + rand() * 0.3) });
        }),
        ...plants.map(([x, z]) => place(PLANT, { x, z, ry: rand() * Math.PI, scale: FURNITURE_M })),
        ...bins.map(([x, z]) => place(BIN, { x, z, ry: rand() * Math.PI, scale: 2.1 })),
      ]);
    })
    .catch((error) => console.error(error));

  return () => {
    gone = true;
    scene.remove(city);
    city.traverse((o) => {
      if (o.userData.shared) return;
      o.geometry?.dispose();
      if (o.material && !Object.values(M).includes(o.material) && ![...paints.values()].includes(o.material)) {
        o.material.map?.dispose();
        o.material.dispose();
      }
    });
    pool.map?.dispose();
    pool.dispose();
    skyCopy.material.dispose();
    skyCopy.geometry.dispose();
    envTarget.dispose();
    pmrem.dispose();
    hidden.forEach((o, i) => (o.visible = wasVisible[i]));
    Object.assign(scene, before);
  };
}
