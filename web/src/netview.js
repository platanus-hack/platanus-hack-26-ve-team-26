// The policy network while it trains, in 3D: GET /train/{id}/net (training/netlive.py) every ~2 s.
// Every sphere is a real neuron of the actor (190 inputs, 256, 128 and 64 hidden, 29 motors), lit by
// what it did on the last 16 control steps of one training robot; the lines are the 500 strongest
// connections of each layer, and the sparks run along the ones carrying the most signal right now.
// Nothing is invented: when the server sends a new picture, the weights and the activity change.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Same cadence as GET /train (TRAIN_POLL_MS in data/live/src/upload.js) and as the pictures
// themselves (NET_EVERY_S in training/netlive.py): asking faster only gets the same file again.
const POLL_MS = 2000;
// The 16 frames of a picture are 0.32 s of robot time; played at 1/8 s each, one loop lasts ~2 s,
// about the time until the next picture arrives.
const FRAME_S = 0.125;
const LAYER_GAP = 3.2; // distance between layers along x, in scene units
const NEURON_GAP = 0.2;
const SPARKS = 320;
// The camera sways around a three-quarter view (azimuth from +z): seen square from the side the
// layers are thin lines, seen end-on they hide each other.
const VIEW_AZIMUTH = -0.75;
const SWAY = 0.4; // rad either side of it
const VIEW_DISTANCE = 12.5; // sparks on the connections that carry the most signal
const SIGNAL = new THREE.Color('#c8ff2e'); // --signal: a neuron firing positive
const NEGATIVE = new THREE.Color('#5fb4ff'); // negative activity, distinct from the lime in both themes
const IDLE = new THREE.Color('#3a4045'); // a neuron near zero, just visible on --scene
const SCENE_BG = new THREE.Color('#2b3034'); // --scene, so the canvas blends with the other 3D views

const LAYER_NAMES = ['Lo que siente', 'Capa 1', 'Capa 2', 'Capa 3', 'Motores'];

const num = (x, digits = 1) => x.toLocaleString('es', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const stepCount = (steps) => (steps < 1e6 ? `${Math.round(steps / 1e3)} k` : `${num(steps / 1e6)} M`);

/** Positions of n neurons on a square-ish grid in the YZ plane at x. */
function gridPositions(n, x) {
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const out = [];
  for (let i = 0; i < n; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    out.push(new THREE.Vector3(x, ((rows - 1) / 2 - r) * NEURON_GAP, (c - (cols - 1) / 2) * NEURON_GAP));
  }
  return out;
}

function sparkline(canvas, values, color) {
  const ctx = canvas.getContext('2d');
  const w = (canvas.width = canvas.clientWidth * devicePixelRatio);
  const h = (canvas.height = canvas.clientHeight * devicePixelRatio);
  ctx.clearRect(0, 0, w, h);
  const vals = values.filter((v) => v != null && Number.isFinite(v));
  if (vals.length < 2) return;
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5 * devicePixelRatio;
  ctx.beginPath();
  let first = true;
  values.forEach((v, i) => {
    if (v == null || !Number.isFinite(v)) return;
    const px = (i / (values.length - 1)) * w;
    const py = h - ((v - lo) / (hi - lo || 1)) * (h - 4) - 2;
    if (first) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
    first = false;
  });
  ctx.stroke();
}

/**
 * Mounts the view in `el`. follow(apiUrl, trainId, live) points it at a training (live: false keeps
 * the last picture and stops asking); dispose() frees the GPU.
 */
export function mountNetView(el) {
  el.innerHTML = `
    <canvas class="net-canvas"></canvas>
    <div class="net-labels"></div>
    <div class="net-hud">
      <p class="net-title">La red de la política, entrenándose <span class="net-step"></span></p>
      <div class="net-curves">
        <figure><figcaption>Recompensa por paso</figcaption><canvas class="net-reward"></canvas></figure>
        <figure><figcaption>Segundos sin caerse</figcaption><canvas class="net-episode"></canvas></figure>
      </div>
      <p class="net-change"></p>
    </div>
    <p class="net-wait">La red aparece cuando el robot empieza a practicar.</p>
    <button class="net-full" type="button" aria-label="Pantalla completa">⤢</button>`;
  const $ = (s) => el.querySelector(s);
  const canvas = $('.net-canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  scene.background = SCENE_BG;
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  // Three-quarters and a little above: inputs on the left, motors on the right.
  camera.position.set(Math.sin(VIEW_AZIMUTH) * VIEW_DISTANCE, 3.2, Math.cos(VIEW_AZIMUTH) * VIEW_DISTANCE);
  const controls = new OrbitControls(camera, canvas);
  // Aimed a little below and left of the network's center: the HUD takes the top-left corner and the
  // near (input) end looks bigger, so this keeps the whole network and its labels in frame.
  controls.target.set(-0.6, -0.6, 0);
  controls.enableDamping = true;
  controls.enablePan = false;
  // A slow sway around the side view instead of a full turn: seen end-on, the layers hide each other.
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.5;
  controls.minDistance = 4;
  controls.maxDistance = 24;
  controls.addEventListener('start', () => (controls.autoRotate = false)); // the viewer took over

  let net = null; // the last picture
  let layout = null; // what was built for its sizes
  let apiUrl = null;
  let trainId = null;
  let live = false;
  let timer = null;
  let disposed = false;
  const clock = new THREE.Clock();

  function build(sizes) {
    if (layout) {
      scene.remove(layout.group);
      layout.group.traverse((o) => {
        o.geometry?.dispose();
        o.material?.dispose();
      });
    }
    const group = new THREE.Group();
    const x0 = (-(sizes.length - 1) * LAYER_GAP) / 2;
    const positions = sizes.map((n, k) => gridPositions(n, x0 + k * LAYER_GAP));
    const offsets = [];
    let total = 0;
    for (const n of sizes) {
      offsets.push(total);
      total += n;
    }
    const neurons = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.055, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
      total,
    );
    neurons.frustumCulled = false;
    for (let i = 0; i < total; i++) neurons.setColorAt(i, IDLE);

    const maxEdges = (sizes.length - 1) * 500;
    const edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(maxEdges * 6), 3));
    edgeGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(maxEdges * 6), 3));
    edgeGeo.setDrawRange(0, 0);
    const edges = new THREE.LineSegments(
      edgeGeo,
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    edges.frustumCulled = false;

    const sparkGeo = new THREE.BufferGeometry();
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARKS * 3), 3));
    sparkGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(SPARKS * 3), 3));
    const sparks = new THREE.Points(
      sparkGeo,
      new THREE.PointsMaterial({ size: 0.11, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    sparks.frustumCulled = false;
    group.add(edges, neurons, sparks);
    scene.add(group);

    const labels = $('.net-labels');
    labels.innerHTML = sizes
      .map((n, k) => `<span>${LAYER_NAMES[k] ?? `Capa ${k}`}<b>${n}</b></span>`)
      .join('');
    // Label anchors: under each layer's grid.
    const anchors = positions.map((ps) => new THREE.Vector3(ps[0].x, Math.min(...ps.map((p) => p.y)) - 0.45, 0));
    layout = { sizes, positions, offsets, neurons, edges, sparks, group, anchors, labelEls: [...labels.children], flat: [], sparkEdges: [] };
  }

  /** Flattens a picture's edges into scene segments once per picture. */
  function ingest(snapshot) {
    const same = layout && layout.sizes.join() === snapshot.sizes.join();
    if (!same) build(snapshot.sizes);
    const { positions } = layout;
    const flat = [];
    snapshot.edges.forEach((layer, k) => {
      const wmax = Math.max(...layer.w.map(Math.abs)) || 1;
      layer.from.forEach((i, e) => {
        flat.push({ k, i, j: layer.to[e], w: layer.w[e], s: Math.abs(layer.w[e]) / wmax, a: positions[k][i], b: positions[k + 1][layer.to[e]] });
      });
    });
    const pos = layout.edges.geometry.attributes.position.array;
    flat.forEach((f, e) => {
      pos.set([f.a.x, f.a.y, f.a.z, f.b.x, f.b.y, f.b.z], e * 6);
    });
    layout.edges.geometry.attributes.position.needsUpdate = true;
    layout.edges.geometry.setDrawRange(0, flat.length * 2);
    layout.flat = flat;
    // Every spark gets a random phase, so they do not move in lockstep.
    layout.sparkPhase = Array.from({ length: SPARKS }, () => Math.random());
    net = snapshot;
    hud(snapshot);
  }

  function hud(s) {
    $('.net-wait').hidden = true;
    $('.net-step').textContent = `· paso ${stepCount(s.step)} de ${stepCount(s.total_steps)}`;
    sparkline($('.net-reward'), s.history.reward, '#c8ff2e');
    sparkline($('.net-episode'), s.history.episode_s, '#f1f3ee');
    const change = s.change
      ? s.change.map((c, k) => `${LAYER_NAMES[k + 1] ?? k + 1} ${num(100 * c, 2)} %`).join(' · ')
      : 'midiendo…';
    $('.net-change').textContent = `Cuánto cambiaron los pesos en los últimos 2 s: ${change} · exploración ${num(s.std, 2)}`;
  }

  const tmpColor = new THREE.Color();
  const tmpMatrix = new THREE.Matrix4();
  function color(value, scale, out) {
    const v = Math.max(-1, Math.min(1, value / scale));
    return out.copy(IDLE).lerp(v >= 0 ? SIGNAL : NEGATIVE, Math.abs(v));
  }

  function animate() {
    if (!layout || !net) return;
    const t = clock.getElapsedTime();
    const frames = net.activations[0].length;
    const f = (t / FRAME_S) % frames;
    const f0 = Math.floor(f);
    const f1 = (f0 + 1) % frames;
    const u = f - f0;
    const acts = net.activations.map((layer) => layer[f0].map((v, i) => v + (layer[f1][i] - v) * u));

    const { neurons, offsets, positions } = layout;
    acts.forEach((layer, k) => {
      // Inputs are normalized (~N(0,1), clipped at 5) and ELU outputs live in (-1, ~3): scale each
      // layer by its own typical size so every layer shows its pattern, not only the loudest one.
      const scale = Math.max(0.5, layer.reduce((m, v) => m + Math.abs(v), 0) / layer.length * 2.5);
      layer.forEach((v, i) => {
        const p = positions[k][i];
        const size = 0.6 + Math.min(1, Math.abs(v) / scale);
        tmpMatrix.makeScale(size, size, size).setPosition(p);
        neurons.setMatrixAt(offsets[k] + i, tmpMatrix);
        neurons.setColorAt(offsets[k] + i, color(v, scale, tmpColor));
      });
    });
    neurons.instanceMatrix.needsUpdate = true;
    neurons.instanceColor.needsUpdate = true;

    // A connection glows with the signal it carries now: its weight times what its source neuron did.
    const flat = layout.flat;
    const cols = layout.edges.geometry.attributes.color.array;
    let flowMax = 1e-6;
    const flow = flat.map((e) => {
      const x = e.w * acts[e.k][e.i];
      flowMax = Math.max(flowMax, Math.abs(x));
      return x;
    });
    flat.forEach((e, n) => {
      const strength = 0.12 + 0.88 * Math.abs(flow[n]) / flowMax;
      const c = (flow[n] >= 0 ? SIGNAL : NEGATIVE);
      const k = strength * (0.35 + 0.65 * e.s);
      cols.set([c.r * k * 0.5, c.g * k * 0.5, c.b * k * 0.5, c.r * k, c.g * k, c.b * k], n * 6);
    });
    layout.edges.geometry.attributes.color.needsUpdate = true;

    // Sparks travel from input to output along the connections with the most flow.
    const order = flow.map((x, n) => [Math.abs(x), n]).sort((a, b) => b[0] - a[0]);
    const sp = layout.sparks.geometry.attributes.position.array;
    const sc = layout.sparks.geometry.attributes.color.array;
    for (let s = 0; s < SPARKS; s++) {
      const pick = order[s % Math.max(order.length, 1)];
      if (!pick) break;
      const e = flat[pick[1]];
      const phase = (t * 0.9 + layout.sparkPhase[s]) % 1;
      sp[s * 3] = e.a.x + (e.b.x - e.a.x) * phase;
      sp[s * 3 + 1] = e.a.y + (e.b.y - e.a.y) * phase;
      sp[s * 3 + 2] = e.a.z + (e.b.z - e.a.z) * phase;
      const c = flow[pick[1]] >= 0 ? SIGNAL : NEGATIVE;
      const k = (pick[0] / flowMax) * Math.sin(Math.PI * phase);
      sc.set([c.r * k, c.g * k, c.b * k], s * 3);
    }
    layout.sparks.geometry.attributes.position.needsUpdate = true;
    layout.sparks.geometry.attributes.color.needsUpdate = true;
  }

  function placeLabels() {
    if (!layout) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const v = new THREE.Vector3();
    layout.anchors.forEach((a, k) => {
      v.copy(a).project(camera);
      const label = layout.labelEls[k];
      label.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, 0)`;
      label.hidden = v.z > 1;
    });
  }

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);

  renderer.setAnimationLoop(() => {
    // Nothing to draw while the box is hidden or off the page: no GPU spent behind other screens.
    if (!el.isConnected || el.offsetParent === null) return;
    const azimuth = controls.getAzimuthalAngle() - VIEW_AZIMUTH;
    if (Math.abs(azimuth) > SWAY && Math.sign(azimuth) === -Math.sign(controls.autoRotateSpeed)) {
      controls.autoRotateSpeed *= -1;
    }
    controls.update();
    animate();
    renderer.render(scene, camera);
    placeLabels();
  });

  async function poll() {
    timer = null;
    if (disposed || !live || !apiUrl || !trainId) return;
    const asked = trainId;
    try {
      const response = await fetch(`${apiUrl.replace(/\/$/, '')}/train/${asked}/net`, { cache: 'no-store' });
      // 404: not practicing yet (retarget first), or a server from before this view existed.
      if (response.ok && asked === trainId && !disposed) {
        const snapshot = await response.json();
        if (!net || snapshot.created_at !== net.created_at) ingest(snapshot);
      }
    } catch {
      // The tunnel can drop for a moment; the next poll tries again and the last picture stays.
    }
    if (!disposed && live && !timer) timer = setTimeout(poll, POLL_MS);
  }

  $('.net-full').onclick = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.();
  };

  return {
    follow(url, id, isLive) {
      const changed = id !== trainId;
      apiUrl = url;
      trainId = id;
      live = Boolean(isLive && id);
      if (changed) {
        net = null;
        $('.net-wait').hidden = false;
      }
      el.hidden = !id;
      if (live && !timer) timer = setTimeout(poll, changed ? 0 : POLL_MS);
    },
    dispose() {
      disposed = true;
      clearTimeout(timer);
      resizeObserver.disconnect();
      renderer.setAnimationLoop(null);
      controls.dispose();
      layout?.group.traverse((o) => {
        o.geometry?.dispose();
        o.material?.dispose();
      });
      renderer.dispose();
    },
  };
}
