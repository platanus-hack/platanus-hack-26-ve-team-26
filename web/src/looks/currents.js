// The wind made visible: thin streaks of air that flow past the robot, curling a little, in the
// direction and at the speed of the wind the physics is applying (sim.wind and the "Viento"
// slider), in any world. No wind, no streaks.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { random, SMALL_SCREEN } from './common.js';

const COUNT = SMALL_SCREEN ? 140 : 260;
const BOX = { half: 7, low: 0.05, high: 2.8 }; // where streaks live, around the robot (m)
const LIFE_S = [1.2, 2.6];
// On screen the air moves slower than the wind (10 m/s would cross the view in a blink): the
// streaks keep the direction and the proportion between speeds, at this share of the speed.
const SHOWN_SPEED = 0.45;

/** Where the wind blows (three.js x, z, unit length) and how fast (m/s) right now. */
export function windNow(view) {
  const [fx, fy] = view.sim.wind ?? [0, 0];
  const mps = view.conditions?.().wind_mps ?? 0;
  const n = Math.hypot(fx, fy);
  return { dir: n > 1e-6 ? new THREE.Vector2(fx / n, -fy / n) : new THREE.Vector2(0, -1), mps: n > 1e-6 ? mps : 0 };
}

export function createCurrents(view) {
  // A streak: two crossed ribbons along x, so it reads from the side and from above. Unit length.
  const ribbon = (rotate) => {
    const g = new THREE.PlaneGeometry(1, 0.018, 8, 1);
    if (rotate) g.rotateX(Math.PI / 2);
    // A wisp, not a stick: thin at both ends, a gentle S along its length, and fading from a
    // bright head (+x, where it is going) to a faint tail.
    const p = g.getAttribute('position');
    const shade = [];
    for (let i = 0; i < p.count; i++) {
      const t = p.getX(i) + 0.5;
      const k = Math.sin(Math.PI * t) ** 0.7;
      p.setY(i, p.getY(i) * k + 0.03 * Math.sin(Math.PI * t));
      p.setZ(i, p.getZ(i) * k + 0.07 * Math.sin(2 * Math.PI * t));
      const glow = t ** 1.6;
      shade.push(glow, glow, glow);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(shade, 3));
    return g;
  };
  const geometry = mergeGeometries([ribbon(false), ribbon(true)]);
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.4,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, COUNT);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(COUNT * 3), 3);
  mesh.frustumCulled = false;
  mesh.name = 'look-currents';
  view.viewer.scene.add(mesh);

  const rand = random(17);
  const streaks = Array.from({ length: COUNT }, () => ({ pos: new THREE.Vector3(), age: 0, life: 0, phase: 0, height: 0 }));
  const center = new THREE.Vector3();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const x = new THREE.Vector3(1, 0, 0);
  const dir3 = new THREE.Vector3();
  const color = new THREE.Color();
  let strength = 0; // eases in and out, so turning the wind off fades the streaks

  const spawn = (st, dir, spread) => {
    // Mostly upwind of the robot, so they flow past it within their life.
    const along = (rand() * 1.4 - 1) * BOX.half;
    const across = (rand() - 0.5) * 2 * BOX.half * spread;
    st.pos.set(center.x + dir.x * along - dir.y * across, BOX.low + (BOX.high - BOX.low) * rand() ** 1.6, center.z + dir.y * along + dir.x * across);
    st.age = 0;
    st.life = LIFE_S[0] + (LIFE_S[1] - LIFE_S[0]) * rand();
    st.phase = rand() * Math.PI * 2;
    st.height = st.pos.y;
  };
  streaks.forEach((st, i) => {
    spawn(st, new THREE.Vector2(0, -1), 1);
    st.age = (i / COUNT) * st.life; // staggered, so they do not all appear at once
  });

  let time = 0;
  return {
    update(dt) {
      time += dt;
      const { dir, mps } = windNow(view);
      strength += ((mps > 0.5 ? Math.min(1, mps / 12) : 0) - strength) * Math.min(1, dt * 2.5);
      mesh.visible = strength > 0.01;
      if (!mesh.visible) return;
      center.copy(view.viewer.followed);
      const speed = Math.max(mps, 2) * SHOWN_SPEED;
      const length = 0.6 + mps * 0.05; // 1.1 m at 10 m/s
      for (let i = 0; i < COUNT; i++) {
        const st = streaks[i];
        st.age += dt;
        if (st.age > st.life) spawn(st, dir, 1);
        // Curling: the streak's heading swings a little across the wind and up and down.
        const curl = 0.35 * Math.sin(time * 1.7 + st.phase);
        const lift = 0.18 * Math.sin(time * 2.3 + st.phase * 1.3);
        dir3.set(dir.x - dir.y * curl, lift, dir.y + dir.x * curl).normalize();
        st.pos.addScaledVector(dir3, speed * dt);
        q.setFromUnitVectors(x, dir3);
        s.set(length, 1, 1);
        m.compose(st.pos, q, s);
        mesh.setMatrixAt(i, m);
        const fade = Math.sin(Math.PI * Math.min(1, st.age / st.life)) * strength;
        mesh.setColorAt(i, color.setScalar(fade));
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
    },
    dispose() {
      view.viewer.scene.remove(mesh);
      geometry.dispose();
      material.dispose();
      mesh.dispose();
    },
  };
}
