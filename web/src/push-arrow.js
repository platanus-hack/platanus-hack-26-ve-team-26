// The push, drawn in the robot's scene: an arrow in the signal color from where the shove comes,
// pointing at the torso, that fades out after it. The landing's hero and Gym (screens/home.js) and
// the app's robot panes (robot-pane.js) draw the same one, so "Empujar" reads the same everywhere.
import * as THREE from 'three';

const SIGNAL = 0xc8ff2e; // --signal in style.css
const ARROW_S = 0.9; // an arrow stays this long after its push (the push itself lasts 0.1 s)

/**
 * Adds the (hidden) arrow to `scene`.
 * @returns {{ point(view, size?): void, update(): void, dispose(): void }} point() right after
 *   view.push(), update() every frame; size 1 suits a camera ~3.7 m from the robot.
 */
export function createPushArrow(scene) {
  const material = new THREE.MeshBasicMaterial({ color: SIGNAL, transparent: true, depthWrite: false, toneMapped: false });
  const arrow = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.5, 10), material);
  shaft.position.y = 0.25;
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.18, 16), material);
  head.position.y = 0.59;
  arrow.add(shaft, head);
  arrow.visible = false;
  scene.add(arrow);
  let pushedAt = -Infinity;
  const tip = new THREE.Vector3();
  const along = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);

  return {
    // The force on the torso says where the shove comes from.
    point(view, size = 1) {
      const { sim } = view;
      const force = sim.data.xfrc_applied;
      const xpos = sim.data.xpos;
      const i = sim.pushBodyId;
      along.set(force[6 * i], 0, -force[6 * i + 1]).normalize(); // MuJoCo (x, y, z) is three.js (x, z, -y)
      tip.set(xpos[3 * i], xpos[3 * i + 2], -xpos[3 * i + 1]).addScaledVector(along, -0.16); // just short of the torso
      arrow.scale.setScalar(size);
      arrow.quaternion.setFromUnitVectors(UP, along);
      arrow.position.copy(tip).addScaledVector(along, -0.68 * size);
      pushedAt = performance.now();
    },
    update() {
      const t = (performance.now() - pushedAt) / 1000;
      arrow.visible = t < ARROW_S;
      material.opacity = 1 - (t / ARROW_S) ** 3;
    },
    dispose() {
      scene.remove(arrow);
      shaft.geometry.dispose();
      head.geometry.dispose();
      material.dispose();
    },
  };
}
