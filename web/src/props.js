// Models for the places of physics/scenes (kitchen, warehouse, sidewalk). The physics keeps its
// boxes and cylinders; here each one is drawn as a real object instead (a fridge, a shelf, a street
// light), scaled to fill exactly the shape the robot collides with, so what you see is what it hits.
// Models: Kenney's Furniture, Survival and City Roads kits, CC0 (public/models/kenney/*/License.txt).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { dressFloor, dressStreet } from './landing/street.js';

const BASE = `${import.meta.env.BASE_URL}models/kenney/`;
// The label of a place object (physics/scenes/*.json) -> its model. `tile` repeats the model along
// the object's longest side (a run of kitchen cabinets, a row of shelves) instead of stretching one.
const MODELS = {
  mesada: { file: 'furniture/kitchenCabinet.glb', tile: true },
  cocina: { file: 'furniture/kitchenStove.glb' },
  heladera: { file: 'furniture/kitchenFridgeLarge.glb' },
  mesa: { file: 'furniture/table.glb' },
  silla: { file: 'furniture/chair.glb' },
  tacho: { file: 'furniture/trashcan.glb' },
  estante: { file: 'furniture/bookcaseOpen.glb', tile: true },
  caja: { file: 'furniture/cardboardBoxClosed.glb' },
  barril: { file: 'survival/barrel.glb' },
  banco: { file: 'furniture/bench.glb' },
  poste: { file: 'roads/light-square.glb' },
  maceta: { file: 'furniture/pottedPlant.glb' },
};

const loader = new GLTFLoader();
const cache = new Map();
// Each model once, already turned z-up (Kenney models are y-up; MuJoCo and the viewer's geoms are
// z-up) and centered on its bounding box.
function loadModel(file) {
  if (!cache.has(file)) {
    cache.set(
      file,
      loader.loadAsync(BASE + file).then(({ scene }) => {
        const model = new THREE.Group();
        scene.rotation.x = Math.PI / 2;
        model.add(scene);
        model.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(model);
        scene.position.sub(box.getCenter(new THREE.Vector3()));
        model.userData.size = box.getSize(new THREE.Vector3());
        model.traverse((o) => {
          if (o.isMesh) o.castShadow = o.receiveShadow = true;
        });
        return model;
      }),
    );
  }
  return cache.get(file);
}

const hidden = new THREE.MeshBasicMaterial({ visible: false });

/**
 * Puts models on the place's objects in the view (call after every setScene or setWorld: the
 * viewer rebuilds its geoms then). Objects without a model keep their colored shape.
 * @returns a promise that settles when every model is on
 */
export async function dressPlace(view) {
  const { sim } = view;
  const { mujoco, model } = sim;
  const jobs = [];
  for (const { id, object } of view.viewer.geoms) {
    const name = mujoco.mj_id2name(model, mujoco.mjtObj.mjOBJ_GEOM.value, id) ?? '';
    const match = /^place_\d+_(.+)$/.exec(name);
    const spec = match && MODELS[match[1]];
    if (!spec || object.userData.dressed) continue;
    object.userData.dressed = true;
    // The shape's full size in its own frame (x, y, z up): a box from its half sizes, a cylinder
    // from its radius and half height.
    const [a, b, c] = model.geom_size.slice(3 * id, 3 * id + 3);
    const isCylinder = model.geom_type[id] === mujoco.mjtGeom.mjGEOM_CYLINDER.value;
    const size = isCylinder ? new THREE.Vector3(2 * a, 2 * a, 2 * b) : new THREE.Vector3(2 * a, 2 * b, 2 * c);
    jobs.push(
      loadModel(spec.file).then((template) => {
        const along = size.x >= size.y ? 'x' : 'y';
        const count = spec.tile ? Math.max(1, Math.round(size[along] / Math.min(size.x, size.y))) : 1;
        const piece = size.clone();
        piece[along] /= count;
        for (let k = 0; k < count; k++) {
          const copy = template.clone();
          const s = template.userData.size;
          copy.scale.set(piece.x / s.x, piece.y / s.y, piece.z / s.z);
          copy.position[along] = -size[along] / 2 + piece[along] * (k + 0.5);
          object.add(copy);
        }
        object.material = hidden; // the collision shape stays, unseen, under the model
      }),
    );
  }
  await Promise.allSettled(jobs);
}

// Floors for the places, drawn in code like the landing's street (no image files).
const PX_PER_M = 128;

// Kitchen: light 30 cm tiles with dark grout.
function kitchenFloor() {
  const tile = 0.3;
  const canvas = Object.assign(document.createElement('canvas'), { width: 4 * tile * PX_PER_M, height: 4 * tile * PX_PER_M });
  const ctx = canvas.getContext('2d');
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      ctx.fillStyle = (i + j) % 2 ? '#8d8a84' : '#a39f97';
      ctx.fillRect(i * tile * PX_PER_M, j * tile * PX_PER_M, tile * PX_PER_M, tile * PX_PER_M);
    }
  }
  ctx.fillStyle = '#3c3a36';
  for (let k = 0; k <= 4; k++) {
    ctx.fillRect(k * tile * PX_PER_M - 2, 0, 4, canvas.height);
    ctx.fillRect(0, k * tile * PX_PER_M - 2, canvas.width, 4);
  }
  return { canvas, period: 4 * tile };
}

// Warehouse: troweled concrete with a yellow aisle line every 4 m.
function warehouseFloor() {
  const period = 4;
  const canvas = Object.assign(document.createElement('canvas'), { width: period * PX_PER_M, height: period * PX_PER_M });
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#4a4946';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.1)';
    ctx.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, 2, 2);
  }
  ctx.fillStyle = '#b8932c';
  ctx.fillRect(canvas.width / 2 - 8, 0, 16, canvas.height); // the aisle line, 12 cm wide
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(0, 0, canvas.width, 3); // slab joints every 4 m
  ctx.fillRect(0, 0, 3, canvas.height);
  return { canvas, period };
}

const FLOORS = {
  // The texture's curb lines up with the place's real one (its "cordon" object), so the robot's
  // sidewalk is on this side of it and the road beyond.
  vereda: (scene, renderer, place) => {
    const curb = place?.objects.find((o) => o.label === 'cordon');
    return dressStreet(scene, renderer, curb ? { curbX: curb.pos[0] - curb.size[0] / 2 } : {});
  },
  cocina: (scene, renderer) => {
    const { canvas, period } = kitchenFloor();
    return dressFloor(scene, renderer, canvas, period);
  },
  deposito: (scene, renderer) => {
    const { canvas, period } = warehouseFloor();
    return dressFloor(scene, renderer, canvas, period);
  },
};

let undoFloor = () => {};
/** The floor of the place `id` (a key of FLOORS), or the viewer's own floor for any other. */
export function setFloor(view, id) {
  undoFloor();
  undoFloor = FLOORS[id]?.(view.viewer.scene, view.viewer.renderer, view.scene?.()) ?? (() => {});
}
