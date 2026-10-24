// three.js view of a PoseClip: the human skeleton the robot learns from (W3.2). Same scene
// layout as physics/viewer.js, in the web app's light colors (SCENE_THEME, also passed to it).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// MediaPipe Pose bones between the 33 landmarks. The face has none: its 11 points (nose, eyes,
// ears, mouth) are a few centimeters apart and, drawn as joints and bones, read as a blob at
// full-body scale. pose() draws a head and a neck in their place.
const BONES = [
  [11, 12], [11, 23], [12, 24], [23, 24], // torso
  [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19], // left arm and hand
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20], // right arm and hand
  [23, 25], [25, 27], [27, 29], [27, 31], [29, 31], // left leg and foot
  [24, 26], [26, 28], [28, 30], [28, 32], [30, 32], // right leg and foot
];
const FACE_POINTS = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
const NOSE = 0;
const EARS = [7, 8];
const SHOULDERS = [11, 12];
const HEAD_RADIUS = 0.09; // meters: an adult head is about 18 cm across, ear to ear
const HEAD_FORWARD = 0.25; // the head's center, from between the ears a quarter of the way to the nose
const FOOT_JOINTS = [27, 28, 29, 30, 31, 32];
// MediaPipe's own drawing utilities skip landmarks under this visibility.
const MIN_VISIBILITY = 0.5;
// Arms and hands are never hidden: filmed in profile, the far arm is behind the body (visibility
// 0.05-0.46 for the left elbow of the walk), yet MediaPipe's estimate of it is good: it swings
// against the seen arm, as people do. Under ESTIMATED it is drawn at FADED brightness, marked as
// a guess; between ESTIMATED and SEEN it blends, and visibility changes ~3% per frame, so the fade
// follows the swing instead of blinking. Legs keep MediaPipe's rule: a leg cut by the frame edge
// has no estimate worth drawing.
const ARM_POINTS = new Set([11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]);
const SEEN = 0.7;
const ESTIMATED = 0.3;
const FADED = 0.35;
const BONE_RADIUS = 0.02; // meters: thick enough to read on a phone, thin next to a limb
const JOINT_RADIUS = 0.03;
const HUMAN_COLOR = 0xc8ff2e; // the brand's signal: the human is lime, the robot keeps its own colors
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
// The camera follows the hips, so a walk only shows as the floor sliding under the skeleton and
// as the path it leaves behind. The grid is brighter than SCENE_THEME's (where it is a backdrop
// behind the robot): in the landing's small frame, at those values, it vanished and the person
// seemed to walk in place. The trail is the hips' path on the floor up to the current frame.
const GRID_MAJOR = 0x56534c;
const GRID_MINOR = 0x2f2e2a;
const TRAIL_LIFT_M = 0.004; // just above the floor and the grid, so neither hides it
const TRAIL_OPACITY = 0.7;
const TRAIL_WIDTH_M = 0.04; // a ribbon: a one-pixel line vanished in the landing's frame (~75 px per meter)

/**
 * Stage colors shared by the skeleton and the robot (createSimView's `theme`); background is --scene
 * in style.css. A charcoal room, not black: at 0x0f1112 the En vivo pane read as a dark hole around
 * the robot. Still dark enough for the lime skeleton and the white robot to stand out.
 */
export const SCENE_THEME = { background: 0x2b3034, ground: 0x363c40, gridMajor: 0x5b6368, gridMinor: 0x454c51 }; // --scene in style.css

export class SkeletonView {
  constructor(canvas) {
    this.canvas = canvas;
    this.clip = null;
    this.time = 0;

    const renderer = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true }));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;

    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color(SCENE_THEME.background);
    scene.fog = new THREE.Fog(SCENE_THEME.background, 8, 25);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x2a2824, 2));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(2, 4, 1.5);
    scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshStandardMaterial({ color: SCENE_THEME.ground, roughness: 0.95 }),
    );
    ground.rotation.x = -Math.PI / 2;
    const grid = new THREE.GridHelper(60, 120, GRID_MAJOR, GRID_MINOR);
    grid.position.y = 0.001;
    scene.add(ground, grid);
    // The path of the hips on the floor, a ribbon drawn up to the current frame (setClip builds it).
    this.trail = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({ color: HUMAN_COLOR, transparent: true, opacity: TRAIL_OPACITY, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.trail.frustumCulled = false;
    scene.add(this.trail);

    // The skeleton hangs from this group; its y offset puts the clip's lowest foot on the ground.
    this.body = new THREE.Group();
    scene.add(this.body);
    const material = new THREE.MeshStandardMaterial({ color: HUMAN_COLOR, roughness: 0.5 });
    // A unit cylinder along y, stretched and turned into each bone every frame.
    this.bones = new THREE.InstancedMesh(new THREE.CylinderGeometry(BONE_RADIUS, BONE_RADIUS, 1, 8), material, BONES.length);
    this.joints = new THREE.InstancedMesh(new THREE.SphereGeometry(JOINT_RADIUS, 12, 8), material, 33);
    // three.js culls an InstancedMesh by a bounding sphere computed once, around the first
    // matrices (the origin); a clip that walks a few meters away would vanish. Never cull it.
    this.bones.frustumCulled = this.joints.frustumCulled = false;
    this.head = new THREE.Mesh(new THREE.SphereGeometry(HEAD_RADIUS, 24, 16), material);
    this.neck = new THREE.Mesh(new THREE.CylinderGeometry(BONE_RADIUS, BONE_RADIUS, 1, 8), material);
    this.head.frustumCulled = this.neck.frustumCulled = false;
    // Per-instance brightness (pose() dims the estimated arm). Set once here so the material is
    // compiled with instance colors from the first frame.
    this.tint = new THREE.Color(1, 1, 1);
    for (let i = 0; i < BONES.length; i++) this.bones.setColorAt(i, this.tint);
    for (let i = 0; i < 33; i++) this.joints.setColorAt(i, this.tint);
    this.body.add(this.bones, this.joints, this.head, this.neck);

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.05, 100);
    this.camera.position.set(2.6, 1.5, 2.6);
    this.controls = new OrbitControls(this.camera, renderer.domElement);
    this.controls.target.set(0, 0.9, 0);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05;
    this.controls.minDistance = 0.8;
    this.controls.maxDistance = 12;

    this.tmp = {
      a: new THREE.Vector3(),
      b: new THREE.Vector3(),
      dir: new THREE.Vector3(),
      m: new THREE.Matrix4(),
      q: new THREE.Quaternion(),
      s: new THREE.Vector3(),
    };
    this.up = new THREE.Vector3(0, 1, 0);
    this.hips = new THREE.Vector3();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
  }

  /** @param {import('./contract.js').PoseClip} clip */
  setClip(clip) {
    this.clip = clip;
    this.time = 0;
    let floor = Infinity;
    for (const { joints } of clip.frames) {
      for (const j of FOOT_JOINTS) if (joints[j][3] >= MIN_VISIBILITY) floor = Math.min(floor, joints[j][1]);
    }
    this.body.position.y = Number.isFinite(floor) ? -floor : 0;
    // The trail: the center of the hips of every frame, on the floor (the body's y offset does not
    // move x and z, so the trail lies under the skeleton without it), as a ribbon: two vertices per
    // frame across the direction of travel, two triangles per step between frames.
    const n = clip.frames.length;
    const hips = clip.frames.map(({ joints }) => [(joints[23][0] + joints[24][0]) / 2, (joints[23][2] + joints[24][2]) / 2]);
    const vertices = new Float32Array(6 * n);
    let across = [0, 1]; // kept from the last frame that moved, for frames standing still
    hips.forEach(([x, z], i) => {
      const [ax, az] = hips[Math.max(i - 1, 0)];
      const [bx, bz] = hips[Math.min(i + 1, n - 1)];
      const length = Math.hypot(bx - ax, bz - az);
      if (length > 1e-6) across = [-(bz - az) / length, (bx - ax) / length];
      vertices.set([x - (across[0] * TRAIL_WIDTH_M) / 2, TRAIL_LIFT_M, z - (across[1] * TRAIL_WIDTH_M) / 2], 6 * i);
      vertices.set([x + (across[0] * TRAIL_WIDTH_M) / 2, TRAIL_LIFT_M, z + (across[1] * TRAIL_WIDTH_M) / 2], 6 * i + 3);
    });
    const indices = [];
    for (let i = 0; i + 1 < n; i++) indices.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
    this.trail.geometry.dispose();
    this.trail.geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(vertices, 3)).setIndex(indices);
    this.trail.geometry.setDrawRange(0, 0);
  }

  /** Moves the clip forward `seconds` of clip time, looping at the end. */
  advance(seconds) {
    if (!this.clip) return;
    const duration = this.clip.frames.length / this.clip.fps;
    this.time = (this.time + seconds) % duration;
  }

  render() {
    if (this.clip) {
      const i = this.indexAt(this.time);
      this.pose(this.clip.frames[i]);
      this.trail.geometry.setDrawRange(0, 6 * i); // the steps up to this frame, six indices each
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  indexAt(time) {
    const { frames, fps } = this.clip;
    return Math.min(frames.length - 1, Math.floor(time * fps));
  }

  frameAt(time) {
    return this.clip.frames[this.indexAt(time)];
  }

  pose({ joints }) {
    const { a, b, dir, m, q, s } = this.tmp;
    const drawn = (i) => ARM_POINTS.has(i) || joints[i][3] >= MIN_VISIBILITY;
    // 1 where the camera saw the point, down to FADED where MediaPipe estimated it.
    const seen = (i) => (ARM_POINTS.has(i) ? FADED + (1 - FADED) * THREE.MathUtils.smoothstep(joints[i][3], ESTIMATED, SEEN) : 1);

    joints.forEach((joint, i) => {
      this.joints.setMatrixAt(i, drawn(i) && !FACE_POINTS.has(i) ? m.makeTranslation(joint[0], joint[1], joint[2]) : HIDDEN);
      this.joints.setColorAt(i, this.tint.setScalar(seen(i)));
    });
    BONES.forEach(([from, to], i) => {
      if (!drawn(from) || !drawn(to)) {
        this.bones.setMatrixAt(i, HIDDEN);
        return;
      }
      this.bones.setColorAt(i, this.tint.setScalar(Math.min(seen(from), seen(to))));
      a.fromArray(joints[from]);
      b.fromArray(joints[to]);
      const length = a.distanceTo(b);
      q.setFromUnitVectors(this.up, dir.subVectors(b, a).normalize());
      m.compose(a.add(b).multiplyScalar(0.5), q, s.set(1, length, 1));
      this.bones.setMatrixAt(i, m);
    });
    // The head: a sphere between the ears, nudged toward the nose, and a neck down to between the
    // shoulders. Drawn when the camera saw any of the nose or the ears.
    const { head, neck } = this;
    head.visible = neck.visible = [NOSE, ...EARS].some((i) => joints[i][3] >= MIN_VISIBILITY);
    if (head.visible) {
      a.fromArray(joints[EARS[0]]).add(b.fromArray(joints[EARS[1]])).multiplyScalar(0.5);
      a.lerp(b.fromArray(joints[NOSE]), HEAD_FORWARD);
      head.position.copy(a);
      b.fromArray(joints[SHOULDERS[0]]).add(dir.fromArray(joints[SHOULDERS[1]])).multiplyScalar(0.5);
      dir.subVectors(a, b);
      const length = Math.max(0, dir.length() - HEAD_RADIUS);
      neck.quaternion.setFromUnitVectors(this.up, dir.normalize());
      neck.position.copy(b).addScaledVector(dir, length / 2);
      neck.scale.set(1, length, 1);
    }
    this.joints.instanceMatrix.needsUpdate = true;
    this.bones.instanceMatrix.needsUpdate = true;
    this.joints.instanceColor.needsUpdate = true;
    this.bones.instanceColor.needsUpdate = true;

    // Follow the hips along the ground, as physics/ follows the robot: a walk across the
    // frame stays centered without the camera bobbing with each step.
    this.hips.fromArray(joints[23]).add(b.fromArray(joints[24])).multiplyScalar(0.5);
    const dx = this.hips.x - this.controls.target.x;
    const dz = this.hips.z - this.controls.target.z;
    this.controls.target.x += dx;
    this.controls.target.z += dz;
    this.camera.position.x += dx;
    this.camera.position.z += dz;
  }

  resize() {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
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
}
