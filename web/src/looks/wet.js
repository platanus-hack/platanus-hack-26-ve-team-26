// "Piso resbaloso" drawn as a lobby floor that was just mopped: glossy stone tiles, the wet strokes
// of the mop mirroring the robot and the ceiling lights, a yellow "piso mojado" sign and the mop
// bucket beside the walk. The physics is still the flat floor with low grip
// (physics/worlds/resbaloso.json); the hall around is scenery the robot cannot hit.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { atmosphere, canvasTexture, disposeGroup, floor, hideViewerFloor, random, SMALL_SCREEN } from './common.js';

const TILE_M = 0.6;
const TILE_PERIOD_M = 4 * TILE_M; // 4 x 4 tiles per texture
const MOP_PERIOD_M = 8; // the mop strokes repeat every 8 m: long enough not to see the pattern
const HALL = { halfWidth: 7, height: 5.2, near: 14, far: -46 }; // the hall's walls, along the walk (-z)

function drawTiles(ctx, size) {
  const rand = random(3);
  const t = size / 4;
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const l = 46 + rand() * 7;
      ctx.fillStyle = `hsl(32, 9%, ${l}%)`;
      ctx.fillRect(i * t, j * t, t, t);
      // Marble veins: a few soft curves per tile.
      ctx.strokeStyle = `rgba(110,104,96,${0.12 + rand() * 0.12})`;
      ctx.lineWidth = 1 + rand() * 2;
      for (let v = 0; v < 3; v++) {
        ctx.beginPath();
        let x = i * t + rand() * t, y = j * t;
        ctx.moveTo(x, y);
        for (let s = 0; s < 6; s++) ctx.lineTo((x += (rand() - 0.5) * t * 0.4), (y += t / 6));
        ctx.stroke();
      }
    }
  }
  ctx.fillStyle = '#3d3a35'; // grout
  for (let k = 0; k <= 4; k++) {
    ctx.fillRect(k * t - 1.5, 0, 3, size);
    ctx.fillRect(0, k * t - 1.5, size, 3);
  }
}

// Where the floor is still wet: the figure-of-eight strokes of a mop, soft at the edges, with dry
// gaps between them, brighter where it went over twice.
function drawMop(ctx, size) {
  const rand = random(5);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'lighter';
  const px = size / MOP_PERIOD_M;
  for (let stroke = 0; stroke < 46; stroke++) {
    let x = rand() * size, y = rand() * size;
    const heading = rand() * Math.PI * 2;
    ctx.lineCap = 'round';
    for (let s = 0; s < 14; s++) {
      const sway = Math.sin(s * 0.9) * 0.6;
      const nx = x + Math.cos(heading + sway) * px * 0.35;
      const ny = y + Math.sin(heading + sway) * px * 0.35;
      ctx.strokeStyle = `rgba(255,255,255,${0.18 + rand() * 0.1})`;
      ctx.lineWidth = px * (0.22 + rand() * 0.12);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(nx, ny);
      ctx.stroke();
      x = nx;
      y = ny;
    }
  }
  ctx.globalCompositeOperation = 'source-over';
}

// The reflection, only where the mop left water: the mask sets how much of it shows.
const WetShader = {
  name: 'WetFloor',
  uniforms: {
    color: { value: null },
    tDiffuse: { value: null },
    textureMatrix: { value: null },
    tMask: { value: null },
    maskRepeat: { value: new THREE.Vector2(1, 1) },
    strength: { value: 0.85 },
  },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    uniform vec2 maskRepeat;
    varying vec4 vUv;
    varying vec2 vMaskUv;
    #include <common>
    #include <logdepthbuf_pars_vertex>
    void main() {
      vUv = textureMatrix * vec4(position, 1.0);
      vMaskUv = uv * maskRepeat;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      #include <logdepthbuf_vertex>
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 color;
    uniform sampler2D tDiffuse;
    uniform sampler2D tMask;
    uniform float strength;
    varying vec4 vUv;
    varying vec2 vMaskUv;
    #include <logdepthbuf_pars_fragment>
    void main() {
      #include <logdepthbuf_fragment>
      float wet = smoothstep(0.08, 0.6, texture2D(tMask, vMaskUv).r);
      vec4 base = texture2DProj(tDiffuse, vUv);
      gl_FragColor = vec4(base.rgb * color, wet * strength);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

function signTexture(renderer) {
  return canvasTexture(renderer, 512, (ctx, size) => {
    ctx.fillStyle = '#f2c31b';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#111';
    ctx.textAlign = 'center';
    ctx.font = `800 ${size * 0.11}px 'Inter Tight Variable', system-ui, sans-serif`;
    ctx.fillText('¡CUIDADO!', size / 2, size * 0.2);
    // The pictogram: a person slipping, legs out from under them.
    ctx.lineWidth = size * 0.035;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#111';
    ctx.beginPath();
    ctx.arc(size * 0.42, size * 0.33, size * 0.045, 0, Math.PI * 2);
    ctx.fill();
    const line = (pts) => {
      ctx.beginPath();
      ctx.moveTo(pts[0] * size, pts[1] * size);
      for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i] * size, pts[i + 1] * size);
      ctx.stroke();
    };
    line([0.44, 0.39, 0.52, 0.55]); // the body, falling back
    line([0.46, 0.43, 0.32, 0.42]); // an arm flung out
    line([0.47, 0.44, 0.6, 0.38]);
    line([0.52, 0.55, 0.66, 0.5, 0.74, 0.56]); // legs slipping forward
    line([0.52, 0.55, 0.44, 0.64]);
    ctx.fillRect(size * 0.2, size * 0.67, size * 0.6, size * 0.025); // the floor
    ctx.font = `800 ${size * 0.1}px 'Inter Tight Variable', system-ui, sans-serif`;
    ctx.fillText('PISO', size / 2, size * 0.82);
    ctx.fillText('MOJADO', size / 2, size * 0.94);
  });
}

/** The A-frame "piso mojado" sign, 65 cm tall, standing on the floor. */
function wetSign(renderer) {
  const sign = new THREE.Group();
  const yellow = new THREE.MeshStandardMaterial({ color: 0xf2c31b, roughness: 0.45 });
  const face = new THREE.MeshStandardMaterial({ map: signTexture(renderer), roughness: 0.45 });
  const height = 0.65, width = 0.3, spread = 0.2;
  const tilt = Math.atan2(spread / 2, height);
  for (const side of [-1, 1]) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.012), [yellow, yellow, yellow, yellow, side > 0 ? face : yellow, side > 0 ? yellow : face]);
    panel.position.set(0, height / 2, (side * spread) / 4);
    panel.rotation.x = side * tilt;
    panel.castShadow = panel.receiveShadow = true;
    sign.add(panel);
  }
  return sign;
}

/** A mop bucket with its wringer and the mop leaning in it. */
function mopBucket() {
  const bucket = new THREE.Group();
  const yellow = new THREE.MeshStandardMaterial({ color: 0xe9b511, roughness: 0.5 });
  const grey = new THREE.MeshStandardMaterial({ color: 0x3b3d40, roughness: 0.6, metalness: 0.4 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.34), yellow);
  body.position.y = 0.2;
  const wringer = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.3), grey);
  wringer.position.set(0.12, 0.42, 0);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.28), new THREE.MeshStandardMaterial({ color: 0x6b7c7a, roughness: 0.1, metalness: 0.2 }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(-0.02, 0.32, 0);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.35), grey);
  handle.position.set(0.1, 0.95, 0.05);
  handle.rotation.z = -0.28;
  for (const [x, z] of [[-0.17, -0.13], [0.17, -0.13], [-0.17, 0.13], [0.17, 0.13]]) {
    const wheel = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), grey);
    wheel.position.set(x, 0.035, z);
    bucket.add(wheel);
  }
  bucket.add(body, wringer, water, handle);
  bucket.traverse((o) => (o.castShadow = o.receiveShadow = true));
  return bucket;
}

/** The hall: walls facing in (unseen from outside), a ceiling with light strips, two rows of columns. */
function hall() {
  const group = new THREE.Group();
  const plaster = new THREE.MeshStandardMaterial({ color: 0xa59d90, roughness: 0.9 });
  const length = HALL.near - HALL.far;
  const midZ = (HALL.near + HALL.far) / 2;
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(length, HALL.height), plaster);
    wall.rotation.y = (-side * Math.PI) / 2;
    wall.position.set(side * HALL.halfWidth, HALL.height / 2, midZ);
    group.add(wall);
    // Tall windows on the left wall, glowing with the day outside.
    if (side < 0) {
      for (let z = HALL.near - 6; z > HALL.far + 4; z -= 6) {
        const window = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3.4), new THREE.MeshBasicMaterial({ color: 0xdbe9f5 }));
        window.rotation.y = Math.PI / 2;
        window.position.set(-HALL.halfWidth + 0.02, 2.3, z);
        group.add(window);
      }
    }
  }
  for (const [z, ry] of [[HALL.far, 0], [HALL.near, Math.PI]]) {
    const end = new THREE.Mesh(new THREE.PlaneGeometry(2 * HALL.halfWidth, HALL.height), plaster);
    end.position.set(0, HALL.height / 2, z);
    end.rotation.y = ry;
    group.add(end);
  }
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(2 * HALL.halfWidth, length), new THREE.MeshStandardMaterial({ color: 0xbdb8af, roughness: 1 }));
  ceiling.rotation.x = Math.PI / 2; // faces down: from above the hall it is not drawn
  ceiling.position.set(0, HALL.height, midZ);
  group.add(ceiling);
  const strip = new THREE.MeshBasicMaterial({ color: 0xfff6e6 });
  for (let z = HALL.near - 3; z > HALL.far; z -= 4) {
    for (const x of [-3.2, 0, 3.2]) {
      const light = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 2.2), strip);
      light.position.set(x, HALL.height - 0.03, z);
      group.add(light);
    }
  }
  const column = new THREE.MeshStandardMaterial({ color: 0xcfc8bc, roughness: 0.55 });
  for (let z = HALL.near - 4; z > HALL.far + 2; z -= 5) {
    for (const x of [-4.2, 4.2]) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, HALL.height, 24), column);
      c.position.set(x, HALL.height / 2, z);
      c.castShadow = c.receiveShadow = true;
      group.add(c);
    }
  }
  return group;
}

export function dressWet(view) {
  const { renderer } = view.viewer;
  const group = new THREE.Group();
  group.name = 'look-wet';
  view.viewer.scene.add(group);
  const restoreAir = atmosphere(
    view,
    {
      background: 0x2a2b2e,
      room: true,
      envIntensity: 0.45,
      fog: { color: 0x2a2b2e, near: 22, far: 60 },
      exposure: 0.85,
      sunColor: 0xfff1de,
      sunIntensity: 1.4,
      hemi: { sky: 0xfff1de, ground: 0x4a453e, intensity: 0.7 },
    },
    group,
  );
  const showFloor = hideViewerFloor(view);

  const tiles = canvasTexture(renderer, 1024, drawTiles);
  group.add(floor(120, TILE_PERIOD_M, new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.22, metalness: 0 })));

  const span = 60;
  const mask = canvasTexture(renderer, 1024, drawMop, { color: false });
  const size = SMALL_SCREEN ? 512 : 1024;
  const wet = new Reflector(new THREE.PlaneGeometry(span, span), {
    shader: WetShader,
    textureWidth: size,
    textureHeight: size,
    color: 0xffffff,
    clipBias: 0.003,
  });
  wet.material.uniforms.tMask.value = mask;
  wet.material.uniforms.maskRepeat.value.set(span / MOP_PERIOD_M, span / MOP_PERIOD_M);
  wet.material.transparent = true;
  wet.material.depthWrite = false;
  wet.rotation.x = -Math.PI / 2;
  wet.position.y = 0.0015; // over the tiles, under the feet
  group.add(wet);

  group.add(hall());
  const sign = wetSign(renderer);
  sign.position.set(1.5, 0, -2.6);
  sign.rotation.y = -0.5;
  const bucket = mopBucket();
  bucket.position.set(-1.7, 0, 1.4);
  bucket.rotation.y = 0.6;
  group.add(sign, bucket);

  return {
    update() {},
    undo() {
      wet.getRenderTarget().dispose();
      mask.dispose();
      disposeGroup(group);
      showFloor();
      restoreAir();
    },
  };
}
