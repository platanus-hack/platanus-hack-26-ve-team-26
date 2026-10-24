// The landing's world: a dark floor with a measuring grid that fades into the haze, the robot alone
// on it, as in a simulator. It replaced a city street at dusk (Kenney buildings, cars, trees, a sky
// shader and an environment map rendered from it): that street cost more to download and to draw
// every frame than the robot itself, phones dropped frames under it, and none of it was physics, so
// it told nothing about the product. The grid does what the street did for the story: the robot's
// steps and falls read against it, and the walk moves across it.
// Everything is added on dress and taken out on undress, so the app screens keep their look.
import * as THREE from 'three';

// The page's dark (--bg in style.css): the floor, the haze and the background are one color, so
// the grid's lines are all that shows of the floor and it has no horizon line.
const DARK = 0x08090b;
const FLOOR = 0x0f1112; // --scene: a shade above the background, so the robot's shadow reads
// Lines a meter apart (the robot is 1.3 m tall, a step is ~0.6 m) and brighter every 5 m.
const GRID_M = 200;
const MINOR = 0x1d201b;
const MAJOR = 0x343a27; // a dim tint of the signal lime
// The haze: sharp around the robot and where the cameras stand (1.35 to 4 m away), gone by 40 m,
// so the grid's edge is never seen.
const FOG = { near: 8, far: 40 };

export function dressLab(scene) {
  const before = { fog: scene.fog, background: scene.background };
  // The viewer's floor and grid give way to these: same idea, the landing's colors and reach.
  // GridHelper has no isGridHelper flag: it is found by its type.
  const hidden = scene.children.filter((o) => o.type === 'GridHelper' || (o.isMesh && o.geometry?.type === 'PlaneGeometry'));
  const wasVisible = hidden.map((o) => o.visible);
  hidden.forEach((o) => (o.visible = false));

  const lab = new THREE.Group();
  lab.name = 'landing-lab';
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(GRID_M, GRID_M), new THREE.MeshStandardMaterial({ color: FLOOR, roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  const minor = new THREE.GridHelper(GRID_M, GRID_M, MINOR, MINOR);
  const major = new THREE.GridHelper(GRID_M, GRID_M / 5, MAJOR, MAJOR);
  minor.position.y = 0.001; // above the floor, so the lines do not flicker into it
  major.position.y = 0.002;
  lab.add(floor, minor, major);
  scene.add(lab);
  scene.background = new THREE.Color(DARK);
  scene.fog = new THREE.Fog(DARK, FOG.near, FOG.far);

  return () => {
    scene.remove(lab);
    lab.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose();
    });
    hidden.forEach((o, i) => (o.visible = wasVisible[i]));
    Object.assign(scene, before);
  };
}
