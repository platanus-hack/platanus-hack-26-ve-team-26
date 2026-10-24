// A robot made of dots for the home menu. Its pose comes from a small bone tree moved on the
// CPU (16 bones), and the GPU places every dot: on its bone while the robot moves, and on the
// cloud of data points when `morph` goes to 1. Thousands of dots, one draw call.
import * as THREE from 'three';
import { box, capsule, ellipsoid, screen } from './shapes.js';

// Body proportions loosely follow the Unitree G1 (1.32 m): it reads as the same robot as the
// simulation without loading its 19 MB of meshes on the home page.
const LIMBS = { upperArm: 0.22, forearm: 0.2, thigh: 0.32, shin: 0.32 };
const MAX_BONES = 24; // 16 body bones plus room for props; sized into the shader below

// Grays and the brand's single accent (style.css --accent): dots are data, not a character.
export const PALETTE = {
  body: new THREE.Color('#2a2f37'),
  visor: new THREE.Color('#0d1015'),
  accent: new THREE.Color('#2952ff'),
  soft: new THREE.Color('#9aa1ab'),
};

/** Builds the bone tree; every bone's origin is its joint. */
function buildBones() {
  const bone = (name, parent, [x, y, z]) => {
    const b = new THREE.Object3D();
    b.name = name;
    b.position.set(x, y, z);
    parent?.add(b);
    return b;
  };
  const root = bone('root', null, [0, 0, 0]);
  const pelvis = bone('pelvis', root, [0, 0.72, 0]);
  const torso = bone('torso', pelvis, [0, 0.06, 0]);
  const bones = { root, pelvis, torso, head: bone('head', torso, [0, 0.42, 0]) };
  for (const [side, x] of [['L', 1], ['R', -1]]) {
    bones[`arm${side}`] = bone(`arm${side}`, torso, [0.2 * x, 0.36, 0]);
    bones[`forearm${side}`] = bone(`forearm${side}`, bones[`arm${side}`], [0, -LIMBS.upperArm, 0]);
    bones[`hand${side}`] = bone(`hand${side}`, bones[`forearm${side}`], [0, -LIMBS.forearm, 0]);
    bones[`thigh${side}`] = bone(`thigh${side}`, pelvis, [0.09 * x, -0.02, 0]);
    bones[`shin${side}`] = bone(`shin${side}`, bones[`thigh${side}`], [0, -LIMBS.thigh, 0]);
    bones[`foot${side}`] = bone(`foot${side}`, bones[`shin${side}`], [0, -LIMBS.shin, 0]);
  }
  return bones;
}

/**
 * Body parts: [bone, share of the dots, sampler(n), color, glow]. Shares add up to about 1;
 * they follow each part's surface area so the dot density looks even.
 */
function bodyParts() {
  const parts = [
    ['pelvis', 0.05, (n) => box([0, 0, 0], [0.24, 0.12, 0.15], n), PALETTE.body],
    ['torso', 0.2, (n) => box([0, 0.2, 0], [0.3, 0.36, 0.18], n), PALETTE.body],
    // Helmet with a dark visor and two lit eyes, like the G1's head seen from the front.
    ['head', 0.08, (n) => ellipsoid([0, 0.1, 0], [0.1, 0.12, 0.11], n, ([, , z]) => z < 0.35), PALETTE.body],
    ['head', 0.035, (n) => ellipsoid([0, 0.1, 0], [0.1, 0.12, 0.11], n, ([, y, z]) => z >= 0.35 && Math.abs(y) < 0.45), PALETTE.visor],
    ['head', 0.012, (n) => [...ellipsoid([0.04, 0.11, 0.1], [0.018, 0.012, 0.004], n / 2), ...ellipsoid([-0.04, 0.11, 0.1], [0.018, 0.012, 0.004], n / 2)], PALETTE.accent, 1],
  ];
  for (const side of ['L', 'R']) {
    parts.push(
      [`arm${side}`, 0.045, (n) => capsule(LIMBS.upperArm, 0.045, n), PALETTE.body],
      [`forearm${side}`, 0.04, (n) => capsule(LIMBS.forearm, 0.04, n), PALETTE.body],
      [`hand${side}`, 0.015, (n) => box([0, -0.04, 0], [0.05, 0.08, 0.04], n), PALETTE.soft],
      [`thigh${side}`, 0.065, (n) => capsule(LIMBS.thigh, 0.06, n), PALETTE.body],
      [`shin${side}`, 0.06, (n) => capsule(LIMBS.shin, 0.05, n), PALETTE.body],
      [`foot${side}`, 0.025, (n) => box([0, -0.02, 0.04], [0.09, 0.05, 0.2], n), PALETTE.soft],
    );
  }
  return parts;
}

/**
 * The shape the dots gather into when `morph` is 1: a loose cloud of data points, the raw
 * motion before it becomes a robot (the splash runs it backwards: cloud, then robot). In its own
 * frame, about 1 m across; a few points carry the accent, like measured samples.
 */
function cloudPoints(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    // Denser toward the center: the cube root would be uniform, the square root clusters a bit.
    const r = Math.sqrt(Math.random());
    const z = Math.random() * 2 - 1;
    const angle = Math.random() * 2 * Math.PI;
    const ring = Math.sqrt(1 - z * z);
    const p = [0.5 * r * ring * Math.cos(angle), 0.55 * r * z, 0.5 * r * ring * Math.sin(angle)];
    const sample = Math.random() < 0.06;
    out.push({ p, color: sample ? PALETTE.accent : PALETTE.body, glow: sample ? 1 : 0 });
  }
  return out;
}

const vertexShader = /* glsl */ `
  #define MAX_BONES ${MAX_BONES}
  uniform mat4 uBones[MAX_BONES];
  uniform float uMorph;
  uniform float uTime;
  uniform float uSize;
  uniform float uScreenMode;
  uniform vec3 uAccent;
  attribute float aBone;
  attribute vec3 aFace;
  attribute float aDelay;
  attribute vec3 aBodyColor;
  attribute vec3 aFaceColor;
  attribute float aKind;   // 0 body, 1 glowing body dot, 2 screen pixel
  attribute float aGlow;   // the dot glows once it is part of the face
  attribute vec2 aUv;
  varying vec3 vColor;

  // The picture on a prop screen: a scrolling feed on the phone, a playing video otherwise.
  vec3 screenColor() {
    float wave = uScreenMode > 0.5
      ? step(0.5, fract(aUv.y * 2.5 - uTime * 0.5)) * 0.6 + 0.4 * sin(aUv.x * 6.0 + uTime)
      : 0.5 + 0.5 * sin(aUv.x * 9.0 - uTime * 2.0) * sin(aUv.y * 5.0 + uTime * 1.3);
    return mix(vec3(0.82, 0.88, 0.97), uAccent, clamp(wave, 0.0, 1.0));
  }

  void main() {
    vec3 body = (uBones[int(aBone)] * vec4(position, 1.0)).xyz;
    // Dots leave in waves: the ones with a small delay arrive first.
    float m = smoothstep(0.0, 1.0, clamp(uMorph * 1.6 - aDelay * 0.6, 0.0, 1.0));
    vec3 p = mix(body, aFace, m);
    // While flying, each dot swirls a little instead of moving in a straight line.
    float flight = sin(m * 3.14159);
    p += flight * 0.15 * vec3(sin(aDelay * 40.0 + uTime), cos(aDelay * 31.0 + uTime * 1.3), sin(aDelay * 17.0));

    vec3 bodyColor = aKind > 1.5 ? screenColor() : aBodyColor;
    vColor = mix(bodyColor, aFaceColor, m);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float size = uSize * (1.0 + 0.6 * aGlow * m + 0.3 * step(0.5, aKind) * (1.0 - m));
    gl_PointSize = size / -mv.z;
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    gl_FragColor = vec4(vColor, smoothstep(0.5, 0.3, d));
    #include <colorspace_fragment>
  }
`;

export class DotRobot {
  /**
   * @param {object} options
   * @param {number} options.count  dots in the body; the face uses the same dots
   * @param {Array} [options.props]  extra things made of dots: { parent, position, rotation, share, sample(n), screen }
   */
  constructor({ count, props = [] }) {
    this.bones = buildBones();
    this.morph = 0;
    this.morphTarget = 0;

    const parts = bodyParts();
    for (const [i, prop] of props.entries()) {
      const b = new THREE.Object3D();
      b.name = `prop${i}`;
      b.position.set(...prop.position);
      if (prop.rotation) b.rotation.set(...prop.rotation);
      this.bones[prop.parent].add(b);
      this.bones[b.name] = b;
      parts.push([b.name, prop.share, prop.sample, PALETTE.soft, 0, prop.screen]);
    }
    this.boneList = Object.values(this.bones);
    const boneIndex = new Map(this.boneList.map((b, i) => [b.name, i]));

    const totalShare = parts.reduce((sum, part) => sum + part[1], 0);
    const position = [];
    const bone = [];
    const bodyColor = [];
    const kind = [];
    const uv = [];
    const delay = [];
    for (const [name, share, sample, color, glow = 0, isScreen = false] of parts) {
      const n = Math.max(4, Math.round((count * share) / totalShare));
      // Dots near the head reach the face first, so the face builds outward from the center.
      const order = name === 'head' ? 0 : name.startsWith('prop') ? 0.6 : name === 'torso' ? 0.25 : 0.45;
      for (const point of sample(n)) {
        const p = isScreen ? point.p : point;
        position.push(...p);
        uv.push(...(isScreen ? point.uv : [0, 0]));
        bone.push(boneIndex.get(name));
        bodyColor.push(color.r, color.g, color.b);
        kind.push(isScreen ? 2 : glow ? 1 : 0);
        delay.push(order + Math.random() * 0.4);
      }
    }

    this.count = bone.length;
    this.face = cloudPoints(this.count);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
    geometry.setAttribute('aBone', new THREE.Float32BufferAttribute(bone, 1));
    geometry.setAttribute('aBodyColor', new THREE.Float32BufferAttribute(bodyColor, 3));
    geometry.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1));
    geometry.setAttribute('aUv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setAttribute('aDelay', new THREE.Float32BufferAttribute(delay, 1));
    geometry.setAttribute('aFace', new THREE.Float32BufferAttribute(new Float32Array(this.count * 3), 3));
    geometry.setAttribute('aFaceColor', new THREE.Float32BufferAttribute(this.face.flatMap(({ color }) => [color.r, color.g, color.b]), 3));
    geometry.setAttribute('aGlow', new THREE.Float32BufferAttribute(this.face.map(({ glow = 0 }) => glow), 1));

    this.uniforms = {
      uBones: { value: Array.from({ length: MAX_BONES }, () => new THREE.Matrix4()) },
      uMorph: { value: 0 },
      uTime: { value: 0 },
      uSize: { value: 18 },
      uScreenMode: { value: props.some((p) => p.screen === 'phone') ? 1 : 0 },
      uAccent: { value: PALETTE.accent },
    };
    this.points = new THREE.Points(
      geometry,
      // Depth on: a screen behind the robot must not paint over it.
      new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms: this.uniforms, transparent: true }),
    );
    // Dots move in the shader, so three.js cannot know their bounds.
    this.points.frustumCulled = false;
  }

  /** Puts the data cloud in front of `camera`, centered on `center` and `scale` meters across. */
  placeCloud(camera, center, scale = 1) {
    const frame = new THREE.Object3D();
    frame.position.copy(center);
    frame.lookAt(camera.position);
    frame.scale.setScalar(scale);
    frame.updateMatrixWorld();
    const attribute = this.points.geometry.getAttribute('aFace');
    const v = new THREE.Vector3();
    this.face.forEach(({ p }, i) => {
      v.fromArray(p).applyMatrix4(frame.matrixWorld);
      attribute.setXYZ(i, v.x, v.y, v.z);
    });
    attribute.needsUpdate = true;
  }

  /** Point size in pixels at 1 m; call when the canvas pixel ratio or view size changes. */
  setPointSize(size) {
    this.uniforms.uSize.value = size;
  }

  update(time, dt) {
    // Exponential approach: about 0.6 s to form the face, frame-rate independent.
    this.morph += (this.morphTarget - this.morph) * (1 - Math.exp(-dt * 4));
    this.uniforms.uMorph.value = this.morph;
    this.uniforms.uTime.value = time;
    this.bones.root.updateMatrixWorld(true);
    this.boneList.forEach((b, i) => this.uniforms.uBones.value[i].copy(b.matrixWorld));
  }

  dispose() {
    this.points.geometry.dispose();
    this.points.material.dispose();
  }
}
