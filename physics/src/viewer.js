// three.js view of a Simulation: one three.js object per visible MuJoCo geom, moved every
// frame to the pose MuJoCo computed. Nothing robot-specific: the look comes from the MJCF.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// MuJoCo's own viewer shows geom groups 0 to 2 by default. The G1 keeps its visual meshes
// in group 2 and its collision shapes in group 3, so the robot is drawn as it looks.
const VISIBLE_GROUPS = new Set([0, 1, 2]);
// The camera aims at the pelvis height of the standing G1 (0.79 m) and follows the robot
// sideways only, so a fall reads as a fall instead of the camera diving with it.
const TARGET_HEIGHT = 0.75;
// Scene colors; the web app passes its own palette through createSimView's `theme` option.
export const DEFAULT_THEME = { background: 0x0e141b, ground: 0x18212c, gridMajor: 0x3a4a5c, gridMinor: 0x253140 };

export class RobotView {
  constructor(sim, canvas, theme = {}) {
    theme = { ...DEFAULT_THEME, ...theme };
    this.sim = sim;
    this.canvas = canvas;

    const renderer = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true }));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;

    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color(theme.background);
    scene.fog = new THREE.Fog(theme.background, 8, 25);
    scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x1a2230, 1.6));
    const sun = (this.sun = new THREE.DirectionalLight(0xffffff, 2.2));
    sun.position.set(2, 4, 1.5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: 0.5, far: 10 });
    scene.add(sun, sun.target);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshStandardMaterial({ color: theme.ground, roughness: 0.95 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    const grid = new THREE.GridHelper(60, 120, theme.gridMajor, theme.gridMinor);
    grid.position.y = 0.001;
    scene.add(ground, grid);

    // MuJoCo is z-up and three.js is y-up: everything simulated hangs from this rotated group,
    // so geom poses can be copied as they come.
    this.world = new THREE.Group();
    this.world.rotation.x = -Math.PI / 2;
    scene.add(this.world);
    this.geoms = this.buildGeoms();

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.05, 100);
    this.camera.position.set(2.6, 1.5, -1.6);
    this.controls = new OrbitControls(this.camera, renderer.domElement);
    this.controls.target.set(0, TARGET_HEIGHT, 0);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05;
    this.controls.minDistance = 0.8;
    this.controls.maxDistance = 12;

    this.matrix = new THREE.Matrix4();
    this.followed = new THREE.Vector3();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
  }

  dispose() {
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.scene.traverse((object) => {
      object.geometry?.dispose();
      object.material?.dispose();
    });
    this.renderer.dispose();
  }

  buildGeoms() {
    const { mujoco, model } = this.sim;
    const materials = new Map();
    const meshes = new Map();
    const geoms = [];
    for (let g = 0; g < model.ngeom; g++) {
      if (!VISIBLE_GROUPS.has(model.geom_group[g])) continue;
      const geometry = this.geometryFor(mujoco, model, g, meshes);
      if (!geometry) continue;
      const rgba = this.rgbaOf(model, g);
      const key = rgba.join(',');
      if (!materials.has(key)) {
        materials.set(
          key,
          new THREE.MeshStandardMaterial({
            color: new THREE.Color().setRGB(rgba[0], rgba[1], rgba[2], THREE.SRGBColorSpace),
            transparent: rgba[3] < 1,
            opacity: rgba[3],
            metalness: 0.35,
            roughness: 0.45,
            // MuJoCo merges repeated mesh vertices, so averaged normals would round off the
            // robot's hard edges; flat shading keeps them crisp.
            flatShading: true,
          }),
        );
      }
      const object = new THREE.Mesh(geometry, materials.get(key));
      object.castShadow = true;
      object.receiveShadow = true;
      this.world.add(object);
      geoms.push({ id: g, object });
    }
    return geoms;
  }

  geometryFor(mujoco, model, g, meshes) {
    const T = mujoco.mjtGeom;
    const [a, b, c] = model.geom_size.slice(3 * g, 3 * g + 3);
    switch (model.geom_type[g]) {
      case T.mjGEOM_MESH.value: {
        const id = model.geom_dataid[g];
        if (!meshes.has(id)) meshes.set(id, meshGeometry(model, id));
        return meshes.get(id);
      }
      case T.mjGEOM_SPHERE.value:
        return new THREE.SphereGeometry(a, 24, 16);
      case T.mjGEOM_ELLIPSOID.value:
        return new THREE.SphereGeometry(1, 24, 16).scale(a, b, c);
      // three.js builds capsules and cylinders along y; MuJoCo along the geom's z.
      case T.mjGEOM_CAPSULE.value:
        return new THREE.CapsuleGeometry(a, 2 * b, 8, 16).rotateX(Math.PI / 2);
      case T.mjGEOM_CYLINDER.value:
        return new THREE.CylinderGeometry(a, a, 2 * b, 24).rotateX(Math.PI / 2);
      case T.mjGEOM_BOX.value:
        return new THREE.BoxGeometry(2 * a, 2 * b, 2 * c);
      default:
        return null; // planes are the ground drawn above; height fields are not used yet
    }
  }

  rgbaOf(model, g) {
    const mat = model.geom_matid[g];
    return mat >= 0 ? [...model.mat_rgba.slice(4 * mat, 4 * mat + 4)] : [...model.geom_rgba.slice(4 * g, 4 * g + 4)];
  }

  resize() {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // Copies the latest MuJoCo pose to three.js and draws a frame.
  render() {
    const { geom_xpos: xpos, geom_xmat: xmat } = this.sim.data;
    for (const { id, object } of this.geoms) {
      object.position.set(xpos[3 * id], xpos[3 * id + 1], xpos[3 * id + 2]);
      const m = 9 * id; // row-major 3x3
      this.matrix.set(
        xmat[m], xmat[m + 1], xmat[m + 2], 0,
        xmat[m + 3], xmat[m + 4], xmat[m + 5], 0,
        xmat[m + 6], xmat[m + 7], xmat[m + 8], 0,
        0, 0, 0, 1,
      );
      object.quaternion.setFromRotationMatrix(this.matrix);
    }
    this.follow();
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  follow() {
    const [x, y] = this.sim.bodyPosition('pelvis');
    this.followed.set(x, TARGET_HEIGHT, -y); // MuJoCo (x, y, z) is three.js (x, z, -y)
    const delta = this.followed.clone().sub(this.controls.target);
    this.controls.target.add(delta);
    this.camera.position.add(delta);
    this.sun.position.add(delta);
    this.sun.target.position.copy(this.followed);
  }
}

function meshGeometry(model, id) {
  const v0 = model.mesh_vertadr[id];
  const f0 = model.mesh_faceadr[id];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(model.mesh_vert.slice(3 * v0, 3 * (v0 + model.mesh_vertnum[id])), 3),
  );
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(model.mesh_face.slice(3 * f0, 3 * (f0 + model.mesh_facenum[id]))), 1));
  return geometry;
}
