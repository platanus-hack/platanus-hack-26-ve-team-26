// The home intro's walking person, made of dots: the "3D movement" Tridi extracts from video.
// Adapted from the team's design reference (Tridi Design System, ui_kits/website/Intro.html) to
// the app's light palette. A procedural walk moves 16 joints; each dot sits on a bone, and a
// blue scan band sweeps up and down the body as if it were being measured.
import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const AX = V(1, 0, 0);
const AZ = V(0, 0, 1);
const INK = new THREE.Color('#2c3a51');
const ACCENT = new THREE.Color('#4c7cf3');
const FLOOR = new THREE.Color('#9fb1cc');
// Strides (a left and a right step) per second: an unhurried walk.
const STRIDE_HZ = 0.85;

/** Joint positions in meters (y up, facing +z) for a walk at time `t`. */
function walkPose(t) {
  const J = {};
  const ph = t * Math.PI * 2 * STRIDE_HZ;
  const bob = 0.022 * Math.cos(2 * ph); // the body rises on each step
  const sway = 0.028 * Math.sin(ph); // and shifts over the standing leg
  J.pelvis = V(sway, 0.95 + bob, 0);
  J.chest = J.pelvis.clone().add(V(-sway * 0.4, 0.32, 0.02));
  J.neck = J.chest.clone().add(V(0, 0.2, 0));
  J.head = J.neck.clone().add(V(0, 0.13, 0.01));
  const leg = (side, thigh, knee) => {
    const hip = J.pelvis.clone().add(V(0.1 * side, -0.04, 0));
    const k = hip.clone().add(V(0, -0.44, 0).applyAxisAngle(AX, -thigh));
    const ankle = k.clone().add(V(0, -0.43, 0).applyAxisAngle(AX, -thigh + knee));
    const toe = ankle.clone().add(V(0, -0.05, 0.15).applyAxisAngle(AX, (-thigh + knee) * 0.3));
    return [hip, k, ankle, toe];
  };
  const thigh = 0.42 * Math.sin(ph);
  [J.hipL, J.kneeL, J.ankleL, J.toeL] = leg(1, thigh, 0.08 + 0.85 * Math.max(0, Math.cos(ph)) ** 2);
  [J.hipR, J.kneeR, J.ankleR, J.toeR] = leg(-1, -thigh, 0.08 + 0.85 * Math.max(0, -Math.cos(ph)) ** 2);
  const arm = (side, swing) => {
    const sh = J.chest.clone().add(V(0.18 * side, 0.16, 0));
    const el = sh.clone().add(V(0, -0.29, 0).applyAxisAngle(AX, -swing).applyAxisAngle(AZ, side * 0.1));
    const wr = el.clone().add(V(0, -0.26, 0).applyAxisAngle(AX, -(swing + 0.35)).applyAxisAngle(AZ, side * 0.08));
    return [sh, el, wr];
  };
  const swing = 0.35 * Math.sin(ph); // arms swing against the legs
  [J.shL, J.elL, J.wrL] = arm(1, -swing);
  [J.shR, J.elR, J.wrR] = arm(-1, swing);
  return J;
}

// Bones as [from, to, radius in m]; a bone from a joint to itself is a ball (the head).
const BONES = [
  ['pelvis', 'chest', 0.13], ['chest', 'neck', 0.1], ['head', 'head', 0.11],
  ['hipL', 'hipR', 0.09], ['shL', 'shR', 0.065],
  ['hipL', 'kneeL', 0.075], ['kneeL', 'ankleL', 0.055], ['ankleL', 'toeL', 0.04],
  ['hipR', 'kneeR', 0.075], ['kneeR', 'ankleR', 0.055], ['ankleR', 'toeR', 0.04],
  ['shL', 'elL', 0.05], ['elL', 'wrL', 0.04], ['shR', 'elR', 0.05], ['elR', 'wrR', 0.04],
];

function dotMaterial({ base, size, opacity }) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uSize: { value: size },
      uOpacity: { value: opacity },
      uScan: { value: -10 }, // height of the scan band, in world meters; far below = off
      uBase: { value: base },
      uAccent: { value: ACCENT },
    },
    vertexShader: /* glsl */ `
      uniform float uSize, uScan;
      varying float vScan;
      varying float vFar;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vScan = 1.0 - smoothstep(0.0, 0.05, abs(world.y - uScan)); // a 5 cm band
        vec4 mv = viewMatrix * world;
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * (4.0 / -mv.z);
        vFar = clamp(-mv.z / 9.0, 0.0, 1.0); // farther dots fade a little: depth without fog
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      uniform vec3 uBase, uAccent;
      varying float vScan;
      varying float vFar;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        gl_FragColor = vec4(mix(uBase, uAccent, vScan), smoothstep(0.5, 0.25, d) * uOpacity * (1.0 - vFar * 0.55));
        #include <colorspace_fragment>
      }
    `,
  });
}

/**
 * @param options.count  dots in the body
 * @returns the scene, camera and update() for DotStage.addScene, plus setScatter() for the
 *   scroll, and project() to place HTML labels on joints.
 */
export function createWalkingFigure({ count = 5200 } = {}) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 1.25, 5.2);
  camera.lookAt(0, 0.9, 0);
  const group = new THREE.Group();

  // Each dot: a bone, where along it (u), an offset around it, and a direction to fly off to.
  const weights = BONES.map(([a, b, r]) => (a === b ? 0.5 : 1) * r);
  const total = weights.reduce((sum, w) => sum + w, 0);
  const bone = new Uint8Array(count);
  const along = new Float32Array(count);
  const offset = new Float32Array(count * 3);
  const away = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    let pick = Math.random() * total;
    let k = 0;
    while (pick > weights[k]) pick -= weights[k++];
    bone[i] = k;
    along[i] = Math.random();
    const v = V(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    const radius = BONES[k][2] * (0.55 + 0.45 * Math.random());
    offset.set([v.x * radius, v.y * radius, v.z * radius], i * 3);
    const d = V(Math.random() - 0.5, Math.random() * 0.8 - 0.2, Math.random() - 0.5).normalize().multiplyScalar(0.6 + Math.random());
    away.set([d.x, d.y, d.z], i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  const position = new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', position);
  const material = dotMaterial({ base: INK, size: 3.1, opacity: 0.95 });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  group.add(points);

  // A disc of floor dots on a 14 cm grid, 3.2 m across.
  const floorPoints = [];
  for (let x = -3.2; x <= 3.2; x += 0.14) for (let z = -3.2; z <= 3.2; z += 0.14) if (x * x + z * z < 3.2 * 3.2) floorPoints.push(x, 0, z);
  const floorGeometry = new THREE.BufferGeometry();
  floorGeometry.setAttribute('position', new THREE.Float32BufferAttribute(floorPoints, 3));
  const floor = new THREE.Points(floorGeometry, dotMaterial({ base: FLOOR, size: 1.6, opacity: 0.6 }));
  scene.add(group, floor);

  let scatter = 0; // 0 = a person, 1 = scattered (set from the scroll)
  let age = 0; // seconds since the figure first showed, for the entrance
  let joints = walkPose(0);
  // The entrance: dots start scattered and gather into the person over this long.
  const ASSEMBLE_S = 1.8;

  function update(t, dt, rect) {
    age += dt;
    joints = walkPose(t);
    const entrance = Math.max(0, 1 - age / ASSEMBLE_S);
    const spread = 3.2 * (scatter * scatter + entrance * entrance * entrance);
    const p = position.array;
    for (let i = 0; i < count; i++) {
      const [ja, jb] = BONES[bone[i]];
      const a = joints[ja];
      const b = joints[jb];
      const u = along[i];
      const o = i * 3;
      p[o] = a.x + (b.x - a.x) * u + offset[o] + away[o] * spread;
      p[o + 1] = a.y + (b.y - a.y) * u + offset[o + 1] + away[o + 1] * spread;
      p[o + 2] = a.z + (b.z - a.z) * u + offset[o + 2] + away[o + 2] * spread;
    }
    position.needsUpdate = true;
    // Turns slowly so the walk reads in 3D, and lifts away as it scatters.
    group.rotation.y = -0.55 + Math.sin(t * 0.25) * 0.5;
    group.position.y = scatter * 0.9;
    floor.rotation.y = group.rotation.y;
    // On phones the figure spans the page behind the words: faint, so the text stays readable.
    const faint = rect.width > window.innerWidth * 0.8 ? 0.3 : 1;
    material.uniforms.uOpacity.value = 0.95 * faint * (1 - scatter);
    floor.material.uniforms.uOpacity.value = 0.6 * faint * (1 - scatter) * (1 - entrance);
    material.uniforms.uScan.value = 0.95 + Math.sin(t * 0.9) * 0.95 + group.position.y;
    // Dot size follows the view's height, so the figure looks the same on any screen.
    material.uniforms.uSize.value = (rect.height / 210) * Math.min(window.devicePixelRatio, 2);
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
    group.updateMatrixWorld();
  }

  /** Screen position (px, relative to `rect`) of a joint, for an HTML label. */
  function project(name, rect) {
    const v = joints[name].clone().applyMatrix4(group.matrixWorld).project(camera);
    return { x: (v.x * 0.5 + 0.5) * rect.width, y: (-v.y * 0.5 + 0.5) * rect.height };
  }

  /** Left knee angle in degrees, for the live readout on its label. */
  function kneeAngle() {
    const up = joints.hipL.clone().sub(joints.kneeL).normalize();
    const down = joints.ankleL.clone().sub(joints.kneeL).normalize();
    return (Math.acos(Math.max(-1, Math.min(1, up.dot(down)))) * 180) / Math.PI;
  }

  return {
    scene,
    camera,
    update,
    project,
    kneeAngle,
    joint: (name) => joints[name],
    setScatter: (value) => (scatter = Math.max(0, Math.min(1, value))),
    /** 0 while the dots gather at the start, 1 once the person has formed. */
    formed: () => Math.min(1, age / ASSEMBLE_S),
    dispose() {
      geometry.dispose();
      material.dispose();
      floorGeometry.dispose();
      floor.material.dispose();
    },
  };
}
