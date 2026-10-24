// A street floor drawn as a texture (no image files): concrete sidewalk slabs, a curb, asphalt with
// a dashed line, and the far sidewalk, running along three.js z (the texture's v direction). The
// sidewalk place of Simulaciones lies on it (props.js); the landing builds its own street in 3D,
// with a real curb and the city around it (city.js).
import * as THREE from 'three';

const PX_PER_M = 128; // 1 cm ≈ 1 px: seams and speckle stay crisp up close
const PERIOD_M = 16; // the street repeats every 16 m across; the fog hides the repeat
// Across the street, from the robot's sidewalk (x = 0 at its middle), in meters.
const LAYOUT = [
  { from: -2, to: 2, kind: 'sidewalk' },
  { from: 2, to: 2.25, kind: 'curb' },
  { from: 2.25, to: 9.75, kind: 'road' },
  { from: 9.75, to: 10, kind: 'curb' },
  { from: 10, to: 14, kind: 'sidewalk' },
];
const SLAB_M = 1; // sidewalk slabs of 1 x 1 m
const DASH_M = 2; // the road's center line: 2 m painted, 2 m gap
// Dark on purpose: the landing lights the robot brightly (a key light on the camera, exposure
// 1.35), and a light floor would wash out the words laid over it.
const COLORS = {
  sidewalk: '#262523',
  seam: '#141412',
  curb: '#3a3834',
  road: '#151514',
  line: '#6d6752',
};

// Small deterministic noise, so the texture is the same on every visit.
function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function drawStreet() {
  const size = PERIOD_M * PX_PER_M;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const px = (m) => (m - LAYOUT[0].from) * PX_PER_M;
  const rand = random(26);

  for (const { from, to, kind } of LAYOUT) {
    ctx.fillStyle = COLORS[kind];
    ctx.fillRect(px(from), 0, (to - from) * PX_PER_M, size);
    if (kind === 'sidewalk') {
      // Slab seams: lines across and along the sidewalk, every meter.
      ctx.fillStyle = COLORS.seam;
      for (let y = 0; y < size; y += SLAB_M * PX_PER_M) ctx.fillRect(px(from), y, (to - from) * PX_PER_M, 3);
      for (let x = from; x <= to; x += SLAB_M) ctx.fillRect(px(x) - 1, 0, 3, size);
    }
    if (kind === 'curb') {
      ctx.fillStyle = 'rgba(255,255,255,0.08)'; // the curb's top edge catches the light
      ctx.fillRect(px(from), 0, 6, size);
    }
    if (kind === 'road') {
      ctx.fillStyle = COLORS.line;
      const center = px((from + to) / 2);
      for (let y = 0; y < size; y += 2 * DASH_M * PX_PER_M) ctx.fillRect(center - 6, y, 12, DASH_M * PX_PER_M);
    }
  }
  // Speckle: concrete and asphalt grain, a few thousand light and dark dots.
  for (let i = 0; i < 24000; i++) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)';
    ctx.fillRect(rand() * size, rand() * size, 2, 2);
  }
  return canvas;
}

/**
 * Dresses the viewer's floor as a street and hides its grid.
 * @returns a function that puts the floor back as it was
 */
export function dressStreet(scene, renderer, { curbX = null } = {}) {
  // By default x = 0 is the middle of the near sidewalk. With `curbX` (the inner edge of a real
  // curb, e.g. the sidewalk place's), the far curb of the texture lands there instead, with the
  // road beyond it and the sidewalk on this side.
  const metersAtOrigin = curbX === null ? 0 : LAYOUT[3].from - curbX;
  return dressFloor(scene, renderer, drawStreet(), PERIOD_M, (metersAtOrigin - LAYOUT[0].from) / PERIOD_M);
}

/**
 * Puts a drawn texture on the viewer's floor (a square plane) and hides its grid.
 * @param canvas   the texture, one period of `periodM` meters across
 * @param originU  where x = 0 falls in the texture, as a share of its width
 * @returns a function that puts the floor back as it was
 */
export function dressFloor(scene, renderer, canvas, periodM, originU = 0) {
  const grid = scene.children.find((object) => object.isGridHelper);
  const ground = scene.children.find((object) => object.isMesh && object.geometry?.type === 'PlaneGeometry');
  if (!ground) return () => {};
  const PERIOD_M = periodM;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const span = ground.geometry.parameters.width; // the floor is a square this many meters across
  texture.repeat.set(span / PERIOD_M, span / PERIOD_M);
  // The floor's u = 0.5 is x = 0; shift the texture so x = 0 falls at `originU` of it.
  texture.offset.x = (originU - (span / PERIOD_M) * 0.5) % 1;
  const before = ground.material;
  ground.material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.92 });
  const gridWasVisible = grid?.visible;
  if (grid) grid.visible = false;
  return () => {
    ground.material.dispose();
    texture.dispose();
    ground.material = before;
    if (grid) grid.visible = gridWasVisible;
  };
}
