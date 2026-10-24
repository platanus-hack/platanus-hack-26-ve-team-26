// The home intro's person, made of dots: the "3D movement" Tridi extracts from video. It cycles
// through activities that stretch a robot's range of motion (dancing, boxing, guitar, sewing):
// each one is a few seconds, and between them the dots loosen and re-form the next pose.
// Adapted from the team's design reference (Tridi Design System, ui_kits/website/Intro.html) to
// the app's light palette. Each dot sits on a bone, and a blue scan band sweeps the body as if it
// were being measured.
import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const AX = V(1, 0, 0);
const AY = V(0, 1, 0);
const AZ = V(0, 0, 1);
const INK = new THREE.Color('#2c3a51');
const ACCENT = new THREE.Color('#4c7cf3');
const FLOOR = new THREE.Color('#9fb1cc');
const TAU = Math.PI * 2;
// Each activity plays this long, then blends into the next over BLEND_S.
const ACTIVITY_S = 5.5;
const BLEND_S = 0.9;

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (v) => v * v * (3 - 2 * v);
const mix = (a, b, k) => a + (b - a) * k;
const mixArm = (a, b, k) => ({ swing: mix(a.swing, b.swing, k), abd: mix(a.abd, b.abd, k), flex: mix(a.flex, b.flex, k), fabd: mix(a.fabd, b.fabd, k) });

/**
 * Joints (meters, y up, facing +z) from body angles in radians. Arms: `swing` raises the upper
 * arm forward, `abd` out to the side, `flex` bends the elbow, `fabd` turns the forearm sideways.
 * Legs: `thigh` forward, `knee` bend, `abd` out. The torso leans forward by `lean` and turns by
 * `twist`; the head tips down by `nod`. The lowest foot is put on the floor, so bent knees crouch
 * and horizontal thighs sit. `guitar` (0 to 1) brings out the guitar from inside the body.
 */
function rig(p) {
  const J = {};
  const torso = (v) => v.applyAxisAngle(AX, p.lean ?? 0).applyAxisAngle(AY, p.twist ?? 0);
  J.pelvis = V(p.x ?? 0, 1, 0);
  J.chest = J.pelvis.clone().add(torso(V(0, 0.32, 0.02)));
  J.neck = J.chest.clone().add(torso(V(0, 0.2, 0)));
  J.head = J.neck.clone().add(torso(V(0, 0.13, 0.01).applyAxisAngle(AX, p.nod ?? 0)));
  const arm = (side, a) => {
    const sh = J.chest.clone().add(torso(V(0.18 * side, 0.16, 0)));
    const el = sh.clone().add(torso(V(0, -0.29, 0).applyAxisAngle(AX, -a.swing).applyAxisAngle(AZ, side * a.abd)));
    const wr = el.clone().add(torso(V(0, -0.26, 0).applyAxisAngle(AX, -(a.swing + a.flex)).applyAxisAngle(AZ, side * (a.abd + a.fabd))));
    return [sh, el, wr];
  };
  [J.shL, J.elL, J.wrL] = arm(1, p.armL);
  [J.shR, J.elR, J.wrR] = arm(-1, p.armR);
  const leg = (side, l) => {
    const hip = J.pelvis.clone().add(V(0.1 * side, -0.04, 0));
    const k = hip.clone().add(V(0, -0.44, 0).applyAxisAngle(AX, -l.thigh).applyAxisAngle(AZ, side * (l.abd ?? 0)));
    const ankle = k.clone().add(V(0, -0.43, 0).applyAxisAngle(AX, -l.thigh + l.knee).applyAxisAngle(AZ, side * (l.abd ?? 0)));
    const toe = ankle.clone().add(V(0, -0.05, 0.15).applyAxisAngle(AX, (-l.thigh + l.knee) * 0.3));
    return [hip, k, ankle, toe];
  };
  [J.hipL, J.kneeL, J.ankleL, J.toeL] = leg(1, p.legL);
  [J.hipR, J.kneeR, J.ankleR, J.toeR] = leg(-1, p.legR);
  // The guitar: a round body in front of the belly and a neck to the left hand. Hidden inside
  // the torso (body and neck at the chest) when another activity plays.
  const g = p.guitar ?? 0;
  const belly = J.pelvis.clone().lerp(J.chest, 0.45);
  J.gBody = belly.clone().lerp(belly.clone().add(torso(V(-0.06, -0.04, 0.24))), g);
  J.gNeck = J.chest.clone().lerp(J.wrL, g);
  // Floor: the lowest point of either foot rests at y = 0, plus any hop.
  const ground = Math.min(J.ankleL.y, J.ankleR.y, J.toeL.y, J.toeR.y) - 0.02;
  const lift = p.lift ?? 0;
  for (const joint of Object.values(J)) joint.y += lift - ground;
  return J;
}

const STAND = { thigh: 0.02, knee: 0.05 };
const GUARD = { swing: 1.0, abd: 0.35, flex: 1.9, fabd: -0.35 }; // fists by the chin
const PUNCH = { swing: 1.5, abd: 0.12, flex: 0.05, fabd: 0 }; // arm straight forward

/** The activities, as [name, pose(t)]; t is seconds into the activity. */
export const ACTIVITIES = [
  [
    'Bailar',
    (t) => {
      const beat = t * TAU * 1.1; // about 130 bpm, a step on every other beat
      const bounce = 0.5 + 0.5 * Math.sin(2 * beat);
      return {
        x: 0.06 * Math.sin(beat),
        twist: 0.3 * Math.sin(beat / 2),
        armL: { swing: 0.3 * Math.sin(beat), abd: 1.9 + 0.8 * Math.sin(beat), flex: 0.6, fabd: 0.4 },
        armR: { swing: -0.3 * Math.sin(beat), abd: 1.9 + 0.8 * Math.sin(beat + Math.PI), flex: 0.6, fabd: 0.4 },
        legL: { thigh: 0.2 * bounce, knee: 0.4 * bounce },
        legR: { thigh: 0.2 * bounce, knee: 0.4 * bounce },
        nod: 0.1 * Math.sin(2 * beat),
      };
    },
  ],
  [
    'Boxeo',
    (t) => {
      // A left jab and a right cross every 1.4 s, each 0.35 s out and back.
      const ph = t % 1.4;
      const jab = Math.sin(Math.PI * clamp01(ph / 0.35));
      const cross = Math.sin(Math.PI * clamp01((ph - 0.7) / 0.35));
      const stance = { thigh: 0.25, knee: 0.5 + 0.08 * Math.sin(t * TAU * 2) }; // light bounce on the feet
      return {
        lean: 0.12,
        twist: 0.35 * (cross - jab),
        armL: mixArm(GUARD, PUNCH, jab),
        armR: mixArm(GUARD, PUNCH, cross),
        legL: { ...stance, abd: 0.08 },
        legR: { ...stance, abd: 0.08 },
        nod: 0.15,
      };
    },
  ],
  [
    'Guitarra',
    (t) => {
      const strum = Math.sin(t * TAU * 2.2); // a strum every half second or so
      const tap = Math.max(0, Math.sin(t * TAU * 1.1)); // the right foot keeps time
      return {
        twist: -0.15,
        lean: 0.05,
        armL: { swing: 0.8, abd: 0.5, flex: 0.9, fabd: -1.0 + 0.08 * Math.sin(t * TAU * 0.5) }, // hand on the neck
        armR: { swing: 0.35, abd: 0.25, flex: 1.45 + 0.25 * strum, fabd: -0.9 }, // hand over the strings
        legL: STAND,
        legR: { thigh: 0.05 + 0.12 * tap, knee: 0.1 + 0.2 * tap },
        nod: 0.3 + 0.08 * Math.sin(t * TAU * 1.1),
        guitar: 1,
      };
    },
  ],
  [
    'Coser',
    (t) => {
      // Seated, pulling the thread up and out every 1.8 s, then back down to the fabric.
      const pull = Math.sin(Math.PI * clamp01((t % 1.8) / 1.2)) ** 2;
      return {
        lean: 0.3,
        nod: 0.5,
        armL: { swing: 0.8, abd: 0.1, flex: 0.9, fabd: -0.5 }, // holds the fabric
        armR: { swing: 0.8 + 0.6 * pull, abd: 0.1 + 0.7 * pull, flex: 0.9 - 0.6 * pull, fabd: -0.5 + 0.4 * pull },
        legL: { thigh: 1.45, knee: 1.45 }, // thighs flat, shins down: sitting
        legR: { thigh: 1.45, knee: 1.45 },
      };
    },
  ],
];

/** The pose at `time`, blending one activity into the next. Returns joints and where it is. */
function activityPose(time) {
  const cycle = ACTIVITIES.length * ACTIVITY_S;
  const local = ((time % cycle) + cycle) % cycle;
  const index = Math.floor(local / ACTIVITY_S);
  const into = local - index * ACTIVITY_S;
  const current = rig(ACTIVITIES[index][1](into));
  const blend = smooth(clamp01((into - (ACTIVITY_S - BLEND_S)) / BLEND_S));
  if (blend === 0) return { joints: current, index, blend };
  const next = rig(ACTIVITIES[(index + 1) % ACTIVITIES.length][1](0));
  for (const [name, joint] of Object.entries(current)) joint.lerp(next[name], blend);
  return { joints: current, index, blend };
}

// Bones as [from, to, radius in m]; a bone from a joint to itself is a ball (the head).
const BONES = [
  ['pelvis', 'chest', 0.13], ['chest', 'neck', 0.1], ['head', 'head', 0.11],
  ['hipL', 'hipR', 0.09], ['shL', 'shR', 0.065],
  ['hipL', 'kneeL', 0.075], ['kneeL', 'ankleL', 0.055], ['ankleL', 'toeL', 0.04],
  ['hipR', 'kneeR', 0.075], ['kneeR', 'ankleR', 0.055], ['ankleR', 'toeR', 0.04],
  ['shL', 'elL', 0.05], ['elL', 'wrL', 0.04], ['shR', 'elR', 0.05], ['elR', 'wrR', 0.04],
  ['gBody', 'gBody', 0.17], ['gBody', 'gNeck', 0.03], // the guitar (inside the body unless playing)
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
  camera.lookAt(0, 0.78, 0); // a little low, so the feet clear the activity bar under the figure
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
  let clock = 0; // seconds into the activity cycle (setActivity jumps it)
  let pose = activityPose(0);
  let joints = pose.joints;
  // The entrance: dots start scattered and gather into the person over this long.
  const ASSEMBLE_S = 1.8;

  function update(t, dt, rect) {
    age += dt;
    clock += dt;
    pose = activityPose(clock);
    joints = pose.joints;
    const entrance = Math.max(0, 1 - age / ASSEMBLE_S);
    // Between activities the dots loosen a little and re-form into the next pose.
    const change = 0.12 * Math.sin(Math.PI * pose.blend);
    const spread = 3.2 * (scatter * scatter + entrance * entrance * entrance) + change;
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
    // Turns slowly so the moves read in 3D (never far from facing us), and lifts away as it scatters.
    group.rotation.y = -0.35 + Math.sin(t * 0.2) * 0.3;
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
    /** Index (into ACTIVITIES) of the activity playing, or blending out. */
    activity: () => pose.index,
    /** Jumps to the start of activity `index`. */
    setActivity(index) {
      clock = index * ACTIVITY_S;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      floorGeometry.dispose();
      floor.material.dispose();
    },
  };
}
