// What makes the landing's street read as a simulation and not a game: the physics drawn into the
// scene the way a robotics engineer looks at it. A measuring grid on the floor around the robot,
// with a sensor-like pulse running out from it; where its feet touch the ground; the line between
// them (the support it stands on); and its center of mass, dropped onto the floor. Balance is
// keeping that point between the feet, which is what the Gym trains. Everything is read from
// MuJoCo every frame (view.sim), nothing is animated by hand.
import * as THREE from 'three';

const SIGNAL = 0xff4f1a; // --signal in landing.css
const INK = 0xefede8; // --fg
const GRID_M = 4.5; // the grid fades out this far from the robot
const PULSE_EVERY_S = 3.2;
const PULSE_MPS = 2.2; // the pulse crosses the grid in about 2 s, then waits
// The ankle's roll link sits 3.5 cm over the floor when the sole is flat on it (measured standing);
// 2 cm more and the foot is in the air.
const FOOT_DOWN_M = 0.055;
const FEET = ['left_ankle_roll_link', 'right_ankle_roll_link'];

const gridMaterial = () =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uCenter: { value: new THREE.Vector2() },
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uInk: { value: new THREE.Color(INK) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vFloor;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vFloor = world.xz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec2 uCenter;
      uniform float uTime;
      uniform float uOpacity;
      uniform vec3 uInk;
      varying vec2 vFloor;
      // Antialiased grid lines one pixel wide, whatever the distance.
      float lines(vec2 p) {
        vec2 g = abs(fract(p - 0.5) - 0.5) / fwidth(p);
        return 1.0 - min(min(g.x, g.y), 1.0);
      }
      void main() {
        float d = distance(vFloor, uCenter);
        float fade = 1.0 - smoothstep(${(GRID_M * 0.3).toFixed(2)}, ${GRID_M.toFixed(2)}, d);
        float grid = max(lines(vFloor), 0.35 * lines(vFloor * 4.0)); // every meter, and every 25 cm
        float front = mod(uTime, ${PULSE_EVERY_S.toFixed(2)}) * ${PULSE_MPS.toFixed(2)};
        float ring = exp(-pow((d - front) / 0.05, 2.0));
        float wake = (1.0 - smoothstep(0.0, 1.2, front - d)) * step(d, front); // the grid just swept
        // Ink, not the signal: orange is for what the physics measures (feet, center of mass, pushes).
        float alpha = (grid * (0.2 + 0.35 * wake) + 0.45 * ring) * fade * uOpacity;
        gl_FragColor = vec4(uInk, alpha);
        #include <colorspace_fragment>
      }`,
  });

/**
 * Draws the robot's physics into its scene.
 * @returns {{ update(visible: boolean, options?: { com?: boolean }): void, dispose(): void }}
 */
export function dressTelemetry(view) {
  const { scene } = view.viewer;
  const group = new THREE.Group();
  group.name = 'landing-telemetry';
  scene.add(group);

  const grid = new THREE.Mesh(new THREE.PlaneGeometry(2 * GRID_M, 2 * GRID_M), gridMaterial());
  grid.rotation.x = -Math.PI / 2;
  grid.position.y = 0.004;
  grid.renderOrder = 2;
  group.add(grid);

  // Flat marks on the floor, and the center of mass seen through the robot (depthTest off), as
  // physics debuggers draw it.
  const flat = new THREE.MeshBasicMaterial({ color: SIGNAL, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const xray = new THREE.MeshBasicMaterial({ color: SIGNAL, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
  const lineMaterial = new THREE.LineDashedMaterial({ color: SIGNAL, dashSize: 0.04, gapSize: 0.03, transparent: true, depthTest: false, toneMapped: false });
  const onFloor = (mesh) => {
    mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = 3;
    return mesh;
  };

  const feet = FEET.map(() => {
    const foot = new THREE.Group();
    foot.add(onFloor(new THREE.Mesh(new THREE.RingGeometry(0.075, 0.09, 40), flat)));
    foot.add(onFloor(new THREE.Mesh(new THREE.CircleGeometry(0.04, 24), flat)));
    foot.position.y = 0.006;
    group.add(foot);
    return foot;
  });
  const support = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), lineMaterial);
  support.renderOrder = 3;
  group.add(support);

  const com = new THREE.Group();
  const comFloor = new THREE.Group();
  comFloor.add(onFloor(new THREE.Mesh(new THREE.RingGeometry(0.05, 0.062, 40), flat)));
  for (const angle of [0, Math.PI / 2]) {
    const tick = onFloor(new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.01), flat));
    tick.rotation.z = angle;
    comFloor.add(tick);
  }
  comFloor.position.y = 0.007;
  const comBall = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), xray);
  comBall.renderOrder = 4;
  const drop = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), lineMaterial);
  drop.renderOrder = 3;
  com.add(comBall, drop);
  group.add(com, comFloor);

  const materials = [grid.material, flat, xray, lineMaterial];
  const clock = new THREE.Clock();
  let opacity = 0;
  const p = new THREE.Vector3();
  const down = [false, false];
  const toThree = (target, [x, y, z]) => target.set(x, z, -y); // MuJoCo (x, y, z) is three.js (x, z, -y)

  return {
    /**
     * Every frame. `visible` false fades it all out (the walk of Capture has no physics); `com`
     * false hides the center of mass (the hero's close-up makes it a stray dot at the hips).
     */
    update(visible, { com: showCom = true } = {}) {
      opacity += ((visible ? 1 : 0) - opacity) * 0.08;
      group.visible = opacity > 0.01;
      if (!group.visible) return;
      const { sim } = view;
      grid.material.uniforms.uTime.value = clock.getElapsedTime();
      grid.material.uniforms.uOpacity.value = opacity;
      flat.opacity = 0.85 * opacity;
      xray.opacity = opacity;
      lineMaterial.opacity = 0.9 * opacity;

      toThree(p, sim.bodyPosition('pelvis'));
      grid.position.set(p.x, grid.position.y, p.z);
      grid.material.uniforms.uCenter.value.set(p.x, p.z);

      FEET.forEach((name, i) => {
        toThree(p, sim.bodyPosition(name));
        down[i] = p.y < FOOT_DOWN_M;
        feet[i].visible = down[i];
        feet[i].position.set(p.x, feet[i].position.y, p.z);
      });
      support.visible = down[0] && down[1];
      if (support.visible) {
        support.geometry.attributes.position.setXYZ(0, feet[0].position.x, 0.008, feet[0].position.z);
        support.geometry.attributes.position.setXYZ(1, feet[1].position.x, 0.008, feet[1].position.z);
        support.geometry.attributes.position.needsUpdate = true;
        support.computeLineDistances();
      }

      // The whole model's center of mass: the world body's subtree is everything.
      const c = sim.data.subtree_com;
      toThree(p, [c[0], c[1], c[2]]);
      com.visible = comFloor.visible = showCom;
      com.position.copy(p);
      drop.geometry.attributes.position.setY(1, 0.008 - p.y); // from the center of mass down to the floor
      drop.geometry.attributes.position.needsUpdate = true;
      drop.computeLineDistances();
      comFloor.position.set(p.x, comFloor.position.y, p.z);
    },
    dispose() {
      scene.remove(group);
      group.traverse((o) => o.geometry?.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
