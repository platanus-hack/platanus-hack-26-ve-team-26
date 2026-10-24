// "Piedras" drawn as a rocky field: gravel and dirt underfoot, the physics' low stones (a height
// field of up to 3 cm, physics/worlds/piedras.json) colored as rock, loose rocks and boulders
// around the walk and cliffs closing the horizon, under a dusty afternoon sky. Only the height
// field is physics; every rock around is scenery the robot cannot hit, so none stands where it walks.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { atmosphere, canvasTexture, disposeGroup, fbm, floor, hideViewerFloor, inWalk, random } from './common.js';

const PX_PER_M = 256; // gravel grains of a few millimeters stay visible next to the feet
const PERIOD_M = 4;
const DIRT = '#6f5d4a';

function drawGravel(ctx, size, rand, height) {
  ctx.fillStyle = height ? '#404040' : DIRT;
  ctx.fillRect(0, 0, size, size);
  // Blotches of damper and drier dirt.
  for (let i = 0; i < 260; i++) {
    const r = (0.1 + rand() * 0.5) * PX_PER_M;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    const tone = height ? `rgba(${rand() < 0.5 ? '90,90,90' : '50,50,50'},0.35)` : rand() < 0.5 ? 'rgba(130,108,84,0.25)' : 'rgba(60,48,38,0.25)';
    g.addColorStop(0, tone);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.translate(rand() * size, rand() * size);
    ctx.fillStyle = g;
    ctx.fillRect(-r, -r, 2 * r, 2 * r);
    ctx.restore();
  }
  // Pebbles: a lit top, a shadowed bottom; on the height map, a bump.
  for (let i = 0; i < 5200; i++) {
    const x = rand() * size, y = rand() * size;
    const r = (0.004 + rand() ** 3 * 0.035) * PX_PER_M;
    const rot = rand() * Math.PI;
    const shade = 72 + rand() * 58;
    const warm = rand() * 18;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    if (height) {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, '#d8d8d8');
      g.addColorStop(1, 'rgba(64,64,64,0)');
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = 'rgba(20,14,10,0.45)'; // its shadow, toward the bottom right
      ctx.beginPath();
      ctx.ellipse(r * 0.25, r * 0.3, r, r * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      const g = ctx.createLinearGradient(-r, -r, r, r);
      g.addColorStop(0, `rgb(${shade + 26 + warm},${shade + 20},${shade + 12})`);
      g.addColorStop(1, `rgb(${shade - 26 + warm},${shade - 32},${shade - 38})`);
      ctx.fillStyle = g;
    }
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/** A rock: a sphere pushed in and out by noise, its bottom flattened to sit on the ground. */
function rockGeometry(seed, detail = 3) {
  const geometry = mergeVertices(new THREE.IcosahedronGeometry(1, detail));
  const p = geometry.getAttribute('position');
  const v = new THREE.Vector3();
  const colors = [];
  const color = new THREE.Color();
  const rand = random(seed);
  const stretch = new THREE.Vector3(0.8 + rand() * 0.6, 0.55 + rand() * 0.35, 0.8 + rand() * 0.6);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = fbm(v.x * 1.4 + seed, v.y * 1.4, v.z * 1.4, 4);
    const r = 1 + 0.55 * n + 0.12 * fbm(v.x * 5 + seed, v.y * 5, v.z * 5, 2);
    v.multiplyScalar(r).multiply(stretch);
    if (v.y < -0.15) v.y = -0.15 + (v.y + 0.15) * 0.15; // a flat bottom
    p.setXYZ(i, v.x, v.y, v.z);
    // Strata and lichen: bands by height, darker toward the ground.
    const band = 0.5 + 0.5 * Math.sin(v.y * 9 + n * 6);
    const base = 0.4 + 0.12 * band + 0.12 * fbm(v.x * 3, v.y * 3, v.z * 3 + seed, 2);
    const low = THREE.MathUtils.smoothstep(v.y, -0.15, 0.35);
    const k = base * (0.7 + 0.3 * low);
    // Picked as sRGB (what the eye sees), stored linear (what the shader expects).
    color.setRGB(k * 1.08, k, k * 0.9, THREE.SRGBColorSpace);
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const flat = geometry.toNonIndexed(); // faceted: a broken stone, not a blob
  flat.computeVertexNormals();
  geometry.dispose();
  return flat;
}

/** Instanced rocks of one shape, scattered by `place` (returns null to skip a try). */
function scatter(group, geometry, material, count, place, rand, { shadows = false } = {}) {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  let n = 0;
  for (let tries = 0; n < count && tries < count * 20; tries++) {
    const spot = place();
    if (!spot) continue;
    e.set((rand() - 0.5) * 0.3, spot.ry, (rand() - 0.5) * 0.3);
    q.setFromEuler(e);
    m.compose(new THREE.Vector3(spot.x, spot.y, spot.z), q, new THREE.Vector3(spot.s, spot.s * spot.h, spot.s));
    mesh.setMatrixAt(n++, m);
  }
  mesh.count = n;
  mesh.castShadow = shadows;
  mesh.receiveShadow = true;
  group.add(mesh);
}

export function dressRocks(view) {
  const { renderer } = view.viewer;
  const group = new THREE.Group();
  group.name = 'look-rocks';
  view.viewer.scene.add(group);
  const restoreAir = atmosphere(
    view,
    {
      sky: { elevation: 14, azimuth: 235, turbidity: 5, rayleigh: 1.9, mieCoefficient: 0.006, mieDirectionalG: 0.84 },
      fog: { color: 0xa8957f, near: 18, far: 95 },
      exposure: 0.85,
      envIntensity: 0.35,
      sunColor: 0xffd9b0,
      sunIntensity: 2.2,
      hemi: { sky: 0xc9d4de, ground: 0x4a3a2c, intensity: 0.7 },
    },
    group,
  );
  const showFloor = hideViewerFloor(view);

  const rand = random(7);
  const map = canvasTexture(renderer, PERIOD_M * PX_PER_M, (ctx, size) => drawGravel(ctx, size, random(11), false));
  const bump = canvasTexture(renderer, PERIOD_M * PX_PER_M, (ctx, size) => drawGravel(ctx, size, random(11), true), { color: false });
  group.add(floor(400, PERIOD_M, new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 3, roughness: 1 })));

  // The physics' stones as rock: flat cells cut away (the gravel floor shows there), the bumps
  // colored stone, darker in their cracks.
  const stones = view.viewer.geoms.find(({ object }) => object.geometry?.type === 'PlaneGeometry');
  let restoreStones = () => {};
  if (stones) {
    const { object } = stones;
    const before = object.material;
    const p = object.geometry.getAttribute('position');
    const colors = new Float32Array(p.count * 4);
    const color = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const h = p.getZ(i) - 0.001; // meters above the floor (viewer.js lifts the cells 1 mm)
      const tone = 0.36 + 0.2 * (h / 0.03) + 0.1 * fbm(p.getX(i) * 3, p.getY(i) * 3, 0, 2);
      color.setRGB(tone * 1.06, tone, tone * 0.9, THREE.SRGBColorSpace);
      colors.set([color.r, color.g, color.b, h > 0.002 ? 1 : 0], 4 * i);
    }
    object.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));
    object.material = new THREE.MeshStandardMaterial({ vertexColors: true, alphaTest: 0.5, roughness: 0.85, flatShading: true });
    restoreStones = () => {
      object.material.dispose();
      object.material = before;
      object.geometry.deleteAttribute('color');
    };
  }

  // Rocks around: loose ones near the walk, boulders further, cliffs on the horizon.
  const rockMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, flatShading: true });
  const shapes = [1, 2, 3, 4, 5].map((seed) => rockGeometry(seed));
  const ring = (r0, r1, sizes, clear) => () => {
    const a = rand() * Math.PI * 2;
    const r = r0 + (r1 - r0) * Math.sqrt(rand());
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const s = sizes[0] + (sizes[1] - sizes[0]) * rand() ** 2;
    if (inWalk(x, z, clear + s)) return null;
    return { x, z, y: -0.1 * s, s, h: 0.6 + rand() * 0.6, ry: rand() * Math.PI * 2 };
  };
  shapes.forEach((shape, i) => {
    scatter(group, shape, rockMaterial, 26, ring(2.6, 14, [0.06, 0.45], 0.3), rand, { shadows: true });
    scatter(group, shape, rockMaterial, 9, ring(9, 30, [0.8, 2.6], 1), rand);
    scatter(group, shape, rockMaterial, 5 + (i % 2), ring(38, 80, [7, 18], 0), rand);
  });

  return {
    update() {},
    undo() {
      restoreStones();
      shapes.forEach((g) => g.dispose());
      disposeGroup(group);
      showFloor();
      restoreAir();
    },
  };
}
