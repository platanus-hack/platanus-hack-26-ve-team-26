// three.js view of a PoseClip: the human skeleton the robot learns from (W3.2). Same scene
// layout as physics/viewer.js, in the web app's light colors (SCENE_THEME, also passed to it).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// MediaPipe Pose bones between the 33 landmarks. The face keeps only nose-to-ears: eyes and
// mouth are a few centimeters apart and read as noise at full-body scale.
const BONES = [
  [11, 12], [11, 23], [12, 24], [23, 24], // torso
  [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19], // left arm and hand
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20], // right arm and hand
  [23, 25], [25, 27], [27, 29], [27, 31], [29, 31], // left leg and foot
  [24, 26], [26, 28], [28, 30], [28, 32], [30, 32], // right leg and foot
  [0, 7], [0, 8], // head
];
const FOOT_JOINTS = [27, 28, 29, 30, 31, 32];
// MediaPipe's own drawing utilities skip landmarks under this visibility.
const MIN_VISIBILITY = 0.5;
const BONE_RADIUS = 0.02; // meters: thick enough to read on a phone, thin next to a limb
const JOINT_RADIUS = 0.03;
const HUMAN_COLOR = 0x2952ff; // the brand accent: the person is the data, the robot is gray
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

/** The page's light gray (style.css --bg), shared by the skeleton and the robot (createSimView's `theme`). */
export const SCENE_THEME = { background: 0xf1f2f4, ground: 0xe8eaed, gridMajor: 0xcfd3d9, gridMinor: 0xdfe2e6 };

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
    scene.add(new THREE.HemisphereLight(0xffffff, 0xc9d3e2, 2));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(2, 4, 1.5);
    scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshStandardMaterial({ color: SCENE_THEME.ground, roughness: 0.95 }),
    );
    ground.rotation.x = -Math.PI / 2;
    const grid = new THREE.GridHelper(60, 120, SCENE_THEME.gridMajor, SCENE_THEME.gridMinor);
    grid.position.y = 0.001;
    scene.add(ground, grid);

    // The skeleton hangs from this group; its y offset puts the clip's lowest foot on the ground.
    this.body = new THREE.Group();
    scene.add(this.body);
    const material = new THREE.MeshStandardMaterial({ color: HUMAN_COLOR, roughness: 0.5 });
    // A unit cylinder along y, stretched and turned into each bone every frame.
    this.bones = new THREE.InstancedMesh(new THREE.CylinderGeometry(BONE_RADIUS, BONE_RADIUS, 1, 8), material, BONES.length);
    this.joints = new THREE.InstancedMesh(new THREE.SphereGeometry(JOINT_RADIUS, 12, 8), material, 33);
    this.body.add(this.bones, this.joints);

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
  }

  /** Moves the clip forward `seconds` of clip time, looping at the end. */
  advance(seconds) {
    if (!this.clip) return;
    const duration = this.clip.frames.length / this.clip.fps;
    this.time = (this.time + seconds) % duration;
  }

  render() {
    if (this.clip) this.pose(this.frameAt(this.time));
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  frameAt(time) {
    const { frames, fps } = this.clip;
    return frames[Math.min(frames.length - 1, Math.floor(time * fps))];
  }

  pose({ joints }) {
    const { a, b, dir, m, q, s } = this.tmp;
    const visible = (i) => joints[i][3] >= MIN_VISIBILITY;

    joints.forEach((joint, i) => {
      this.joints.setMatrixAt(i, visible(i) ? m.makeTranslation(joint[0], joint[1], joint[2]) : HIDDEN);
    });
    BONES.forEach(([from, to], i) => {
      if (!visible(from) || !visible(to)) {
        this.bones.setMatrixAt(i, HIDDEN);
        return;
      }
      a.fromArray(joints[from]);
      b.fromArray(joints[to]);
      const length = a.distanceTo(b);
      q.setFromUnitVectors(this.up, dir.subVectors(b, a).normalize());
      m.compose(a.add(b).multiplyScalar(0.5), q, s.set(1, length, 1));
      this.bones.setMatrixAt(i, m);
    });
    this.joints.instanceMatrix.needsUpdate = true;
    this.bones.instanceMatrix.needsUpdate = true;

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
