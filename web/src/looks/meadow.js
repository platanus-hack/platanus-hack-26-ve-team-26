// "Viento" drawn as an open meadow at golden hour: tall grass that bends and ripples in gusts the
// way the wind blows, a flag beside the path, and wind turbines on the hills that turn with the
// wind's speed. The wind itself shows as currents (currents.js). The physics is the flat floor
// with the wind pushing the torso (physics/worlds/viento.json); the grass is scenery the robot
// walks through, mown short along its path.
import * as THREE from 'three';
import { atmosphere, canvasTexture, disposeGroup, floor, hideViewerFloor, inWalk, random, SMALL_SCREEN } from './common.js';
import { windNow } from './currents.js';

const BLADES = SMALL_SCREEN ? 9000 : 24000;
const GRASS_RADIUS_M = 22;
// How far a blade's tip leans per m/s of wind, as a share of its height, and the most it leans.
const LEAN_PER_MPS = 0.035;
const MAX_LEAN = 0.55;

function drawMeadow(ctx, size, rand) {
  ctx.fillStyle = '#4f5a2c';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 900; i++) {
    const r = 6 + rand() * 60;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    const tone = rand();
    g.addColorStop(0, tone < 0.4 ? 'rgba(112,96,58,0.35)' : tone < 0.8 ? 'rgba(96,118,52,0.35)' : 'rgba(40,52,24,0.4)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.translate(rand() * size, rand() * size);
    ctx.fillStyle = g;
    ctx.fillRect(-r, -r, 2 * r, 2 * r);
    ctx.restore();
  }
  for (let i = 0; i < 26000; i++) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(170,180,90,0.25)' : 'rgba(20,28,10,0.3)';
    ctx.fillRect(rand() * size, rand() * size, 1 + rand() * 2, 3 + rand() * 5);
  }
}

/** One blade: a thin tapered strip one unit tall; its local y is how far up the blade (0 to 1). */
function bladeGeometry() {
  const g = new THREE.PlaneGeometry(0.06, 1, 1, 4);
  g.translate(0, 0.5, 0);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    p.setX(i, p.getX(i) * (1 - y) ** 0.8);
    p.setZ(i, 0.06 * y * y); // a little curve, so it is not a flat card
  }
  g.computeVertexNormals();
  return g;
}

/** Grass that leans and ripples downwind: the bend is in the vertex shader, from uniforms. */
function grassMaterial(uniforms) {
  const material = new THREE.MeshStandardMaterial({ color: 0x8d9a45, roughness: 0.85, side: THREE.DoubleSide });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        uniform vec2 uWindDir;
        uniform float uLean;
        varying float vTip;`)
      .replace('#include <project_vertex>', `
        vec4 mvPosition = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
          vec2 root = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz;
          float bladeHeight = length(instanceMatrix[1].xyz);
        #else
          vec2 root = vec2(0.0);
          float bladeHeight = 1.0;
        #endif
        float h = position.y;
        // Gusts roll across the field downwind: a wave along the wind's direction, plus flutter.
        float gust = 0.55 + 0.45 * sin(uTime * 2.2 - dot(root, uWindDir) * 0.55);
        float flutter = 0.08 * sin(uTime * 9.0 + root.x * 3.1 + root.y * 2.3);
        float lean = (uLean * gust + flutter * uLean) * h * h * bladeHeight;
        mvPosition.xz += uWindDir * lean;
        mvPosition.y -= 0.5 * abs(lean) * h;
        vTip = h;
        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vTip;')
      // Darker at the root, sunlit at the tip.
      .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= mix(0.45, 1.25, vTip);');
  };
  return material;
}

/** A wind turbine: tower, nacelle and a three-blade rotor (returned to spin). Its hub at 46 m at full size. */
function turbine(material) {
  const group = new THREE.Group();
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 2, 46, 16), material);
  tower.position.y = 23;
  const nacelle = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.4, 6), material);
  nacelle.position.set(0, 46.5, -0.8);
  const rotor = new THREE.Group();
  rotor.position.set(0, 46.5, 2.4);
  rotor.add(new THREE.Mesh(new THREE.SphereGeometry(1.2, 16, 12), material));
  for (let k = 0; k < 3; k++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(1.5, 22, 0.35), material);
    blade.geometry.translate(0, 11, 0);
    blade.rotation.z = (k * 2 * Math.PI) / 3;
    rotor.add(blade);
  }
  group.add(tower, nacelle, rotor);
  return { group, rotor };
}

/** A flag on a 3.2 m pole: the cloth waves in a vertex shader, harder with more wind. */
function flag(uniforms) {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 3.2, 12), new THREE.MeshStandardMaterial({ color: 0xd6d6d0, metalness: 0.6, roughness: 0.35 }));
  pole.position.y = 1.6;
  pole.castShadow = true;
  const cloth = new THREE.PlaneGeometry(1.2, 0.75, 24, 8);
  cloth.translate(0.6, 0, 0);
  const material = new THREE.MeshStandardMaterial({ color: 0xc8ff2e, roughness: 0.7, side: THREE.DoubleSide });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uLean;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float along = position.x / 1.2;
        float amp = (0.06 + 0.35 * uLean) * along;
        transformed.z += amp * sin(uTime * (4.0 + 10.0 * uLean) - along * 7.0);
        // With little wind the cloth hangs down toward the pole.
        transformed.y -= (1.0 - smoothstep(0.0, 0.25, uLean)) * along * 0.55;`);
  };
  const mesh = new THREE.Mesh(cloth, material);
  mesh.position.y = 2.75;
  mesh.castShadow = true;
  group.add(pole, mesh);
  return { group, cloth: mesh };
}

/** @param wind  () => { dir, mps }, what the grass, flag and turbines follow (windNow by default) */
export function dressMeadow(view, wind = () => windNow(view)) {
  const { renderer } = view.viewer;
  const group = new THREE.Group();
  group.name = 'look-meadow';
  view.viewer.scene.add(group);
  const restoreAir = atmosphere(
    view,
    {
      sky: { elevation: 7, azimuth: 250, turbidity: 4.5, rayleigh: 2.4, mieCoefficient: 0.005, mieDirectionalG: 0.86 },
      fog: { color: 0xb8bec0, near: 30, far: 170 },
      exposure: 1.15,
      envIntensity: 0.5,
      sunColor: 0xffd7a8,
      sunIntensity: 2.8,
      hemi: { sky: 0xcfdcea, ground: 0x4a5326, intensity: 1.3 },
    },
    group,
  );
  const showFloor = hideViewerFloor(view);
  const rand = random(23);

  const ground = canvasTexture(renderer, 1024, (ctx, size) => drawMeadow(ctx, size, random(29)));
  group.add(floor(400, 6, new THREE.MeshStandardMaterial({ map: ground, roughness: 1 })));

  const uniforms = { uTime: { value: 0 }, uWindDir: { value: new THREE.Vector2(0, -1) }, uLean: { value: 0 } };
  const grass = new THREE.InstancedMesh(bladeGeometry(), grassMaterial(uniforms), BLADES);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  let n = 0;
  for (let tries = 0; n < BLADES && tries < BLADES * 4; tries++) {
    const r = GRASS_RADIUS_M * Math.sqrt(rand());
    const a = rand() * Math.PI * 2;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    // Mown along the path: short there, so the feet show; tall away from it.
    const path = inWalk(x, z, -1.2) ? 0.25 : inWalk(x, z, -0.4) ? 0.55 : 1;
    const h = (0.18 + 0.5 * rand()) * path;
    q.setFromAxisAngle(up, rand() * Math.PI * 2);
    m.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(1.2 + rand() * 1.2, h, 1));
    grass.setMatrixAt(n++, m);
  }
  grass.count = n;
  grass.receiveShadow = true;
  group.add(grass);

  const white = new THREE.MeshStandardMaterial({ color: 0xeef0f2, roughness: 0.6 });
  const turbines = [];
  // All around and within the camera's 100 m reach; at half size the rotors sit inside the frame.
  for (const [x, z, s] of [[-55, -62, 0.5], [-14, -82, 0.45], [32, -72, 0.55], [72, -28, 0.5], [66, 46, 0.45], [-76, 18, 0.5], [-30, 76, 0.55], [26, 82, 0.45]]) {
    const t = turbine(white);
    t.group.position.set(x, -2, z);
    t.group.scale.setScalar(s);
    t.rotor.rotation.z = rand() * Math.PI;
    group.add(t.group);
    turbines.push(t);
  }
  const flagUniforms = { uTime: uniforms.uTime, uLean: { value: 0 } };
  const banner = flag(flagUniforms);
  banner.group.position.set(2.6, 0, -3.5);
  group.add(banner.group);

  let lean = 0;
  return {
    update(dt) {
      const { dir, mps } = wind();
      uniforms.uTime.value += dt;
      lean += (Math.min(MAX_LEAN, mps * LEAN_PER_MPS) - lean) * Math.min(1, dt * 2);
      uniforms.uLean.value = lean;
      uniforms.uWindDir.value.copy(dir);
      flagUniforms.uLean.value = lean / MAX_LEAN;
      // The flag flies downwind: its cloth (along +x) turned to the wind's direction.
      banner.group.rotation.y = Math.atan2(-dir.y, dir.x);
      // Turbines face into the wind and turn about 0.15 rad/s per m/s (15 rpm at 10 m/s).
      for (const t of turbines) {
        t.group.rotation.y = Math.atan2(-dir.x, -dir.y);
        t.rotor.rotation.z -= (0.05 + 0.15 * mps) * dt;
      }
    },
    undo() {
      disposeGroup(group);
      showFloor();
      restoreAir();
    },
  };
}
