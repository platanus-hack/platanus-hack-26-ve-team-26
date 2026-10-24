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
// With followTau set, a frame later than this (a hidden tab, a canvas out of the page) eases the
// camera as if only 0.1 s had passed, so it does not leap across the floor in one frame.
const MAX_FOLLOW_DT = 0.1; // s
// A pelvis that moved more than this between two frames was teleported (a sim.reset, a clip starting
// over, a seek), and the camera jumps with it instead of sliding there. At 60 fps a 250 N push moves it
// at most 3.4 cm per frame, and the run of data/clips 10 cm.
const FOLLOW_SNAP = 0.3; // m
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
    // Height the camera aims at; a page directing the camera (createSimView's `viewer`) can change it.
    this.targetHeight = TARGET_HEIGHT;
    // Seconds the camera takes to catch up with the robot sideways (it covers 63% of the way in that
    // time). 0 keeps it locked to the pelvis, which is what the app's screens use; a page filming a
    // walk can raise it so the sway of each step does not shake the picture.
    this.followTau = 0;
    this.lastPelvis = new THREE.Vector3(); // the pelvis at the previous follow(); only x and z are read
    this.lastFollowMs = null;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
  }

  // Redraws the robot after the Simulation loaded another model (its geoms are not the same).
  rebuild() {
    for (const { object } of this.geoms) {
      this.world.remove(object);
      object.geometry.dispose();
      object.material.dispose();
    }
    this.geoms = this.buildGeoms();
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
      case T.mjGEOM_HFIELD.value:
        return heightFieldGeometry(model, model.geom_dataid[g]);
      default:
        return null; // planes are the ground drawn above
    }
  }

  rgbaOf(model, g) {
    const mat = model.geom_matid[g];
    return mat >= 0 ? [...model.mat_rgba.slice(4 * mat, 4 * mat + 4)] : [...model.geom_rgba.slice(4 * g, 4 * g + 4)];
  }

  resize() {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    if (!w || !h) return;
    const size = this.renderer.getSize(new THREE.Vector2());
    if (size.x === w && size.y === h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // setSize clears the canvas, and the next draw is a frame away: draw now, or the browser shows
    // an empty (black) frame, as phones did while the address bar hid during a scroll.
    if (this.geoms) this.render();
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
    this.onFrame?.(); // what the page draws on top of the robot (the Dex3 hands in mimic), after its pose
    this.follow();
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  follow() {
    const [x, y] = this.sim.bodyPosition('pelvis');
    this.followed.set(x, this.targetHeight, -y); // MuJoCo (x, y, z) is three.js (x, z, -y)
    // The jump is the pelvis' own move since the previous frame, not its distance to the camera's
    // target: with followTau set the target lags behind a fast walk on purpose.
    const now = performance.now();
    const first = this.lastFollowMs === null;
    const jumped = first || Math.hypot(this.followed.x - this.lastPelvis.x, this.followed.z - this.lastPelvis.z) > FOLLOW_SNAP;
    const dt = first ? 0 : Math.min(Math.max(0, (now - this.lastFollowMs) / 1000), MAX_FOLLOW_DT);
    this.lastPelvis.copy(this.followed);
    this.lastFollowMs = now;
    // Share of the way to the pelvis covered this frame: all of it when locked or after a jump.
    const k = this.followTau > 0 && !jumped ? 1 - Math.exp(-dt / this.followTau) : 1;
    if (k < 1) {
      // Sideways only; the height is set at once, as when locked.
      const { target } = this.controls;
      this.followed.x = target.x + k * (this.followed.x - target.x);
      this.followed.z = target.z + k * (this.followed.z - target.z);
    }
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

/**
 * A height field (the stones world's terrain) as a surface in the geom's frame. MuJoCo stores
 * the elevations row by row, the first row at -y (checked with mj_ray on the tallest stone);
 * PlaneGeometry lists its rows from +y, hence the flip. A millimeter of lift keeps the flat cells
 * from flickering against the ground drawn under them.
 */
function heightFieldGeometry(model, id) {
  const nrow = model.hfield_nrow[id];
  const ncol = model.hfield_ncol[id];
  const [sx, sy, sz] = model.hfield_size.slice(4 * id, 4 * id + 3);
  const start = model.hfield_adr[id];
  const data = model.hfield_data;
  const geometry = new THREE.PlaneGeometry(2 * sx, 2 * sy, ncol - 1, nrow - 1);
  const position = geometry.getAttribute('position');
  for (let q = 0; q < nrow; q++) {
    const row = nrow - 1 - q;
    for (let c = 0; c < ncol; c++) position.setZ(q * ncol + c, data[start + row * ncol + c] * sz + 0.001);
  }
  geometry.computeVertexNormals();
  return geometry;
}
