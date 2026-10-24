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

function dotField() {
  const positions = new Float32Array(FIELD_DOTS * 3);
  for (let i = 0; i < FIELD_DOTS; i++) {
    positions.set([(Math.random() - 0.5) * 30, (Math.random() - 0.5) * 18, -Math.random() * 14], i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({ color: '#b9c8de', size: 0.06, sizeAttenuation: true, transparent: true, opacity: 0.8 }),
  );
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
    this.pointer = { x: 0, y: 0 };
    this.onPointer = (event) => {
      this.pointer.x = event.clientX / window.innerWidth - 0.5;
      this.pointer.y = event.clientY / window.innerHeight - 0.5;
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

    const view = { element, variant, scene, camera, robot, hovered: false };
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
      view.robot.morphTarget = (SMALL_SCREEN ? touchTurn === view : view.hovered) ? 1 : 0;
      view.variant.pose(view.robot.bones, t);
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

  dispose() {
    cancelAnimationFrame(this.frameId);
    window.removeEventListener('pointermove', this.onPointer);
    for (const { robot } of this.views) robot.dispose();
    this.field.points.geometry.dispose();
    this.field.points.material.dispose();
    this.renderer.dispose();
  }
}
