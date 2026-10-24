// One WebGL canvas behind the page draws a drifting field of dots and, inside each card's
// rectangle, that card's dot robot. A single context and render loop for the whole menu:
// browsers cap WebGL contexts, and three canvases would triple the GPU work.
import * as THREE from 'three';
import { DotRobot } from './robot.js';

// Phones get fewer dots: the same look at a third of the vertex work.
const SMALL_SCREEN = matchMedia('(max-width: 720px), (pointer: coarse)').matches;
const ROBOT_DOTS = SMALL_SCREEN ? 1500 : 2600;
const FIELD_DOTS = SMALL_SCREEN ? 250 : 600;
// Dot size as a share of the card's height, so dots look the same on any screen.
const DOT_SIZE = 0.03;
// Without hover (phones, tablets), the cards take turns showing their face, this long each.
const TOUCH_TURN_S = 2.5;
// Below this width/height ratio a view zooms out; measured on a 390 px phone card.
const NARROW_ASPECT = 0.95;

// Background dots near the cursor move aside and turn blue, within this radius (in screen
// heights) and up to this push (in world units): the page feels alive without distracting.
const CURSOR_RADIUS = 0.22;
const CURSOR_PUSH = 0.6;

function dotField() {
  const positions = new Float32Array(FIELD_DOTS * 3);
  const seeds = new Float32Array(FIELD_DOTS);
  for (let i = 0; i < FIELD_DOTS; i++) {
    positions.set([(Math.random() - 0.5) * 30, (Math.random() - 0.5) * 18, -Math.random() * 14], i * 3);
    seeds[i] = Math.random();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  const uniforms = {
    uPointer: { value: new THREE.Vector2(10, 10) }, // screen coords, -1..1; far away until it moves
    uAspect: { value: 1 },
    uTime: { value: 0 },
    uPixel: { value: 1 },
    uBase: { value: new THREE.Color('#b9c8de') },
    uAccent: { value: new THREE.Color('#4c7cf3') },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      uniform vec2 uPointer;
      uniform float uAspect;
      uniform float uTime;
      uniform float uPixel;
      attribute float aSeed;
      varying float vNear;
      void main() {
        vec3 p = position;
        p.y += 0.15 * sin(uTime * 0.4 + aSeed * 6.28); // slow float
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vec4 clip = projectionMatrix * mv;
        vec2 screen = clip.xy / clip.w;
        vec2 away = (screen - uPointer) * vec2(uAspect, 1.0);
        float near = 1.0 - smoothstep(0.0, ${CURSOR_RADIUS * 2}, length(away));
        mv.xy += normalize(away + 1e-5) * near * ${CURSOR_PUSH} * (-mv.z / 6.0);
        vNear = near;
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uPixel * (1.0 + 1.5 * near) * 0.06 * 300.0 / -mv.z;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uBase;
      uniform vec3 uAccent;
      varying float vNear;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        gl_FragColor = vec4(mix(uBase, uAccent, vNear), smoothstep(0.5, 0.2, d) * (0.75 + 0.25 * vNear));
        #include <colorspace_fragment>
      }
    `,
  });
  return new THREE.Points(geometry, material);
}

export class DotStage {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setScissorTest(true);
    this.views = [];

    this.field = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(50, 1, 0.1, 50) };
    this.field.points = dotField();
    this.field.scene.add(this.field.points);
    this.field.camera.position.z = 6;
    this.pointer = { x: 0, y: 0, clientX: -1, clientY: -1 };
    const root = document.documentElement.style;
    this.onPointer = (event) => {
      this.pointer.x = event.clientX / window.innerWidth - 0.5;
      this.pointer.y = event.clientY / window.innerHeight - 0.5;
      this.pointer.clientX = event.clientX;
      this.pointer.clientY = event.clientY;
      this.field.points.material.uniforms.uPointer.value.set(2 * this.pointer.x, -2 * this.pointer.y);
      // The soft light behind the page follows the cursor too (style.css, body::before).
      root.setProperty('--mx', `${event.clientX}px`);
      root.setProperty('--my', `${event.clientY}px`);
    };
    window.addEventListener('pointermove', this.onPointer);

    this.clock = new THREE.Clock();
    this.frame = this.frame.bind(this);
    this.frameId = requestAnimationFrame(this.frame);
  }

  /**
   * Draws `variant` (from poses.js) inside `element`. Hover or focus on `trigger` forms the face.
   * Remove it with removeView when the element goes away.
   */
  addView(element, variant, trigger = element) {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 30);
    camera.position.fromArray(variant.camera.position);
    camera.lookAt(new THREE.Vector3().fromArray(variant.camera.target));
    const robot = new DotRobot({ count: ROBOT_DOTS, props: variant.props });
    robot.placeFace(camera, new THREE.Vector3().fromArray(variant.camera.face), 1.05);
    scene.add(robot.points, robot.bones.root);

    const target = new THREE.Vector3().fromArray(variant.camera.target);
    const view = {
      element,
      variant,
      scene,
      camera,
      robot,
      hovered: false,
      morph: null, // a fixed face amount (0 to 1) instead of hover, e.g. for the splash
      target,
      offset: camera.position.clone().sub(target), // camera position around its target, untilted
      tilt: new THREE.Vector2(), // set by the card from the cursor, -1..1 on each axis
      smoothTilt: new THREE.Vector2(),
    };
    const on = () => (view.hovered = true);
    const off = () => (view.hovered = false);
    const events = { pointerenter: on, pointerleave: off, focus: on, blur: off };
    for (const [name, handler] of Object.entries(events)) trigger.addEventListener(name, handler);
    view.detach = () => {
      for (const [name, handler] of Object.entries(events)) trigger.removeEventListener(name, handler);
    };
    this.views.push(view);
    return view;
  }

  removeView(view) {
    view.detach();
    view.robot.dispose();
    this.views = this.views.filter((v) => v !== view);
  }

  resize() {
    const { innerWidth: w, innerHeight: h } = window;
    const size = this.renderer.getSize(new THREE.Vector2());
    if (size.x === w && size.y === h) return;
    this.renderer.setSize(w, h, false);
    this.field.camera.aspect = w / h;
    this.field.camera.updateProjectionMatrix();
    this.field.points.material.uniforms.uAspect.value = w / h;
    this.field.points.material.uniforms.uPixel.value = this.renderer.getPixelRatio();
  }

  frame() {
    this.frameId = requestAnimationFrame(this.frame);
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const t = this.clock.elapsedTime;
    this.resize();
    const { innerWidth: w, innerHeight: h } = window;
    const dpr = this.renderer.getPixelRatio();

    // Background: the dot field drifts and leans a little toward the pointer.
    const { camera, points, scene } = this.field;
    points.rotation.y = t * 0.01;
    points.material.uniforms.uTime.value = t;
    camera.position.x += (this.pointer.x * 0.8 - camera.position.x) * 0.05;
    camera.position.y += (-this.pointer.y * 0.5 - camera.position.y) * 0.05;
    camera.lookAt(0, 0, -4);
    this.renderer.setViewport(0, 0, w, h);
    this.renderer.setScissor(0, 0, w, h);
    this.renderer.clear();
    this.renderer.render(scene, camera);

    const cards = this.views.filter((v) => v.variant.card);
    const touchTurn = cards[Math.floor(t / TOUCH_TURN_S) % Math.max(1, cards.length)];
    this.views.forEach((view) => {
      const rect = view.element.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > h || rect.width === 0) return; // off screen: skip
      view.robot.morphTarget = view.morph ?? ((SMALL_SCREEN ? touchTurn === view : view.hovered) ? 1 : 0);
      view.variant.pose(view.robot.bones, t);
      this.lookAtPointer(view, rect);
      this.orbit(view, dt);
      view.robot.setPointSize(rect.height * DOT_SIZE * dpr);
      view.robot.update(t, dt);
      view.camera.aspect = rect.width / rect.height;
      // In tall, narrow views (phone cards) zoom out so the face, about 1 m wide, still fits.
      view.camera.zoom = Math.min(1, view.camera.aspect / NARROW_ASPECT);
      view.camera.updateProjectionMatrix();
      const bottom = h - rect.bottom;
      this.renderer.setViewport(rect.left, bottom, rect.width, rect.height);
      this.renderer.setScissor(rect.left, bottom, rect.width, rect.height);
      this.renderer.render(view.scene, view.camera);
    });
  }

  /** The robot turns its head toward the cursor, on top of whatever its pose does. */
  lookAtPointer(view, rect) {
    if (this.pointer.clientX < 0 || view.robot.morph > 0.5) return;
    const dx = (this.pointer.clientX - (rect.left + rect.width / 2)) / window.innerWidth;
    const dy = (this.pointer.clientY - (rect.top + rect.height * 0.3)) / window.innerHeight;
    const clamp = (v, max) => Math.max(-max, Math.min(max, v));
    // Up to about 35° sideways and 15° up or down: a glance, not an owl.
    view.robot.bones.head.rotation.y += clamp(dx * 1.5, 0.6);
    view.robot.bones.head.rotation.x += clamp(dy * 0.8, 0.25);
  }

  /** Turns the camera with the card's tilt, so the robot looks like it is inside the card. */
  orbit(view, dt) {
    view.smoothTilt.lerp(view.tilt, 1 - Math.exp(-dt * 8));
    const yaw = view.smoothTilt.x * 0.35; // radians at the card's edge, matching its CSS tilt
    const pitch = view.smoothTilt.y * 0.15;
    view.camera.position
      .copy(view.offset)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
      .add(new THREE.Vector3(0, pitch * view.offset.length(), 0))
      .add(view.target);
    view.camera.lookAt(view.target);
  }

  dispose() {
    cancelAnimationFrame(this.frameId);
    window.removeEventListener('pointermove', this.onPointer);
    for (const { robot } of this.views) robot.dispose();
    this.field.points.geometry.dispose();
    this.field.points.material.dispose();
    this.renderer.dispose();
  }
}
