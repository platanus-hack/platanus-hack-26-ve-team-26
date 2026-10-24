// Dex3 hands drawn on the G1 while it copies a person (mimic): Unitree's three-finger hands from
// MuJoCo Menagerie (models/dex3), in place of the G1's fixed rubber hands, with their fingers set
// from the person's (fingers.js). Only drawn: the physics model and the policies keep the 29
// joints without hands, so nothing trained changes. Each hand hangs from its wrist_yaw_link, whose
// pose the viewer reads from MuJoCo every frame, and its fingers turn on their own joints.
import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import hands from '../models/dex3/hands.json';

const MESH_URLS = import.meta.glob('../models/dex3/assets/*.STL', { query: '?url', import: 'default', eager: true });
const urlOf = (mesh) => MESH_URLS[`../models/dex3/assets/${mesh}.STL`];
// The rubber hand is the G1's geom on the wrist_yaw_link set this far along the hand (g1.xml and
// g1_mjx.xml, pos="0.0415 ±0.003 0"); the wrist's own mesh sits at the link's origin.
const RUBBER_HAND_X = 0.0415;

export { hands };

/**
 * @param viewer  the RobotView (its `world` group is MuJoCo's frame, its `geoms` the drawn robot)
 * @param sim     the Simulation whose data the viewer draws
 * @returns {Promise<{ show(on: boolean): void, setFingers(side, angles: Map<string, number>): void, update(): void }>}
 *   update() every frame before drawing (the viewer's onFrame does it)
 */
export async function createDex3Hands(viewer, sim) {
  const loader = new STLLoader();
  const names = new Set(['left', 'right'].flatMap((side) => [hands[side].palm.mesh, ...hands[side].bodies.map((b) => b.mesh)]));
  const geometries = new Map(
    await Promise.all(
      [...names].map(async (mesh) => {
        const geometry = loader.parse(await (await fetch(urlOf(mesh))).arrayBuffer());
        return [mesh, geometry];
      }),
    ),
  );

  const meshOf = (name, material) => {
    const mesh = new THREE.Mesh(geometries.get(name), material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };
  const quat = ([w, x, y, z]) => new THREE.Quaternion(x, y, z, w); // MuJoCo stores w first

  const rigs = {};
  for (const side of ['left', 'right']) {
    const root = new THREE.Group();
    root.visible = false;
    const joints = new Map(); // joint name -> { group, axis }
    const groups = new Map([[null, root]]);
    const material = new THREE.MeshStandardMaterial({ color: 0xb8bcc0, metalness: 0.35, roughness: 0.45, flatShading: true });
    const palm = meshOf(hands[side].palm.mesh, material);
    palm.position.set(...hands[side].palm.pos);
    palm.quaternion.copy(quat(hands[side].palm.quat));
    root.add(palm);
    for (const b of hands[side].bodies) {
      const body = new THREE.Group();
      body.position.set(...b.pos);
      body.quaternion.copy(quat(b.quat));
      const turn = new THREE.Group(); // the joint's rotation, under the body's fixed placement
      body.add(turn);
      turn.add(meshOf(b.mesh, material));
      groups.get(b.parent).add(body);
      groups.set(b.name, turn);
      joints.set(b.joint, { group: turn, axis: new THREE.Vector3(...b.axis) });
    }
    viewer.world.add(root);
    rigs[side] = { root, joints, material, wrist: `${side}_wrist_yaw_link` };
  }

  let shown = false;
  let geomsSeen = null; // the viewer's geoms the rubber hands were looked up in (a new model rebuilds them)
  let rubber = [];

  // The rubber hand geoms in the drawn robot, and the robot's own color for the Dex3 hands.
  function findRubberHands() {
    geomsSeen = viewer.geoms;
    const { model } = sim;
    rubber = [];
    for (const rig of Object.values(rigs)) {
      const wrist = sim.id('BODY', rig.wrist);
      for (const { id, object } of viewer.geoms) {
        if (model.geom_bodyid[id] !== wrist) continue;
        if (Math.abs(model.geom_pos[3 * id] - RUBBER_HAND_X) < 1e-3) rubber.push(object);
        else rig.material.color.copy(object.material.color); // the wrist's own mesh: same finish
      }
    }
  }

  return {
    show(on) {
      shown = on;
      if (geomsSeen !== viewer.geoms) findRubberHands();
      for (const object of rubber) object.visible = !on;
      for (const rig of Object.values(rigs)) rig.root.visible = on;
    },
    /** The finger joints of one side (joint name -> angle, rad); a missing joint stays as it was. */
    setFingers(side, angles) {
      for (const [name, { group, axis }] of rigs[side].joints) {
        if (angles.has(name)) group.quaternion.setFromAxisAngle(axis, angles.get(name));
      }
    },
    /** Puts each hand on its wrist as MuJoCo has it now. */
    update() {
      if (!shown) return;
      if (geomsSeen !== viewer.geoms) this.show(true); // the robot was redrawn (another model)
      const { xpos, xquat } = sim.data;
      for (const rig of Object.values(rigs)) {
        const id = sim.id('BODY', rig.wrist);
        rig.root.position.set(xpos[3 * id], xpos[3 * id + 1], xpos[3 * id + 2]);
        rig.root.quaternion.set(xquat[4 * id + 1], xquat[4 * id + 2], xquat[4 * id + 3], xquat[4 * id]);
      }
    },
  };
}
