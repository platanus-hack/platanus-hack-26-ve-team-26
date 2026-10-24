// Shared pieces of the world looks (index.js): deterministic noise, drawn textures and the
// atmosphere (sky, fog, reflections, exposure) that each look puts on the viewer and takes back.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Phones get fewer grass blades and a smaller reflection: same look, a lighter frame.
export const SMALL_SCREEN = matchMedia('(max-width: 720px), (pointer: coarse)').matches;

/** Small deterministic random numbers in [0, 1), so every visit draws the same world. */
export function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 3D value noise and its sum over octaves, for rock shapes.
function hash3(x, y, z) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const smooth = (t) => t * t * (3 - 2 * t);
function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const u = smooth(x - xi), v = smooth(y - yi), w = smooth(z - zi);
  const lerp = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), u), lerp(c(0, 1, 0), c(1, 1, 0), u), v),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), u), lerp(c(0, 1, 1), c(1, 1, 1), u), v),
    w,
  );
}
export function fbm(x, y, z, octaves = 4) {
  let sum = 0, amp = 0.5, f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * (noise3(x * f, y * f, z * f) - 0.5);
    amp *= 0.5;
    f *= 2.03;
  }
  return sum;
}

/** A repeating texture drawn on a canvas of `size` pixels. */
export function canvasTexture(renderer, size, draw, { color = true } = {}) {
  const canvas = Object.assign(document.createElement('canvas'), { width: size, height: size });
  draw(canvas.getContext('2d'), size);
  const texture = new THREE.CanvasTexture(canvas);
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}

/**
 * A flat floor `span` meters across, its texture repeating every `periodM` meters, at y = 0
 * (the physics floor). Larger than the viewer's own (60 m) so the fog, not an edge, ends it.
 */
export function floor(span, periodM, material) {
  for (const map of [material.map, material.bumpMap, material.roughnessMap]) map?.repeat.set(span / periodM, span / periodM);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(span, span), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Puts an atmosphere on the viewer: a sky (or a flat background), fog, what the robot reflects,
 * the lights' color and the exposure. Returns the function that puts the viewer back.
 * @param look.sky        Sky uniforms plus { elevation, azimuth } of the sun, in degrees; or null
 * @param look.background color behind everything when there is no sky
 * @param look.room       reflect a lit room (RoomEnvironment) instead of the sky
 */
export function atmosphere(view, look, group) {
  const { scene, renderer, sun } = view.viewer;
  const hemi = scene.children.find((o) => o.isHemisphereLight);
  const before = {
    background: scene.background,
    fog: scene.fog,
    environment: scene.environment,
    environmentIntensity: scene.environmentIntensity,
    exposure: renderer.toneMappingExposure,
    sun: { color: sun.color.clone(), intensity: sun.intensity },
    hemi: hemi && { color: hemi.color.clone(), groundColor: hemi.groundColor.clone(), intensity: hemi.intensity },
  };
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envSource = null;
  if (look.sky) {
    const { elevation, azimuth, ...uniforms } = look.sky;
    const position = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elevation), THREE.MathUtils.degToRad(azimuth));
    const makeSky = () => {
      const sky = new Sky();
      sky.scale.setScalar(4500);
      for (const [k, v] of Object.entries(uniforms)) sky.material.uniforms[k].value = v;
      sky.material.uniforms.sunPosition.value.copy(position);
      return sky;
    };
    group.add(makeSky());
    envSource = new THREE.Scene();
    envSource.add(makeSky());
    scene.background = null;
  } else {
    scene.background = new THREE.Color(look.background);
  }
  if (look.room) envSource = new RoomEnvironment();
  const env = envSource ? pmrem.fromScene(envSource, 0.02) : null;
  scene.environment = env?.texture ?? null;
  scene.environmentIntensity = look.envIntensity ?? 0.45;
  scene.fog = look.fog ? new THREE.Fog(look.fog.color, look.fog.near, look.fog.far) : null;
  renderer.toneMappingExposure = look.exposure ?? 1;
  if (look.sunColor) sun.color.set(look.sunColor);
  if (look.sunIntensity !== undefined) sun.intensity = look.sunIntensity;
  if (hemi && look.hemi) {
    hemi.color.set(look.hemi.sky);
    hemi.groundColor.set(look.hemi.ground);
    hemi.intensity = look.hemi.intensity;
  }
  return () => {
    env?.dispose();
    pmrem.dispose();
    envSource?.traverse?.((o) => {
      o.geometry?.dispose();
      o.material?.dispose?.();
    });
    Object.assign(scene, {
      background: before.background,
      fog: before.fog,
      environment: before.environment,
      environmentIntensity: before.environmentIntensity,
    });
    renderer.toneMappingExposure = before.exposure;
    sun.color.copy(before.sun.color);
    sun.intensity = before.sun.intensity;
    if (hemi && before.hemi) {
      hemi.color.copy(before.hemi.color);
      hemi.groundColor.copy(before.hemi.groundColor);
      hemi.intensity = before.hemi.intensity;
    }
  };
}

/** Hides the viewer's own floor and grid while a look draws its own; returns the undo. */
export function hideViewerFloor(view) {
  const { scene } = view.viewer;
  // GridHelper has no isGridHelper flag: it is found by its type.
  const hidden = scene.children.filter((o) => o.type === 'GridHelper' || (o.isMesh && o.geometry?.type === 'PlaneGeometry'));
  const was = hidden.map((o) => o.visible);
  hidden.forEach((o) => (o.visible = false));
  return () => hidden.forEach((o, i) => (o.visible = was[i]));
}

/** Frees everything under `group` and takes it out of the scene. */
export function disposeGroup(group) {
  group.parent?.remove(group);
  group.traverse((o) => {
    o.geometry?.dispose();
    const materials = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of materials) {
      for (const key of ['map', 'bumpMap', 'roughnessMap', 'alphaMap', 'emissiveMap']) m[key]?.dispose();
      m.dispose();
    }
  });
}

/** Where the walk goes: the clips start at the origin and head along three.js -z (MuJoCo +y). */
export const inWalk = (x, z, margin = 0) => Math.abs(x) < 2.2 + margin && z > -13 - margin && z < 3.5 + margin;
