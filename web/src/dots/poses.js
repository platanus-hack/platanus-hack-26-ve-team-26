// The three robots of the home menu. Each one is a DotRobot plus a function that poses its
// bones at time `t` (seconds). Angles in radians; the robot faces +z, its left is +x.
import { box, screen } from './shapes.js';

const { sin, PI } = Math;

/** Entrena en vivo: the robot dances, as it would copying a person in front of the camera. */
export const dancing = {
  card: true, // a menu card: takes part in the touch-screen face carousel
  props: [],
  pose(b, t) {
    const beat = t * 2 * PI * 1.1; // about 130 bpm on alternate beats: lively without looking frantic
    b.root.rotation.y = 0.5 * sin(t * 0.4); // turns slowly so the dance reads in 3D
    b.pelvis.position.y = 0.7 - 0.035 * (1 + sin(2 * beat)); // a bounce on every beat
    b.pelvis.position.x = 0.05 * sin(beat);
    b.pelvis.rotation.z = 0.08 * sin(beat);
    b.torso.rotation.z = -0.12 * sin(beat);
    b.head.rotation.z = 0.15 * sin(beat + 0.6);
    // Arms take turns going up, like a wave.
    b.armL.rotation.z = 1.6 + 0.9 * sin(beat);
    b.armR.rotation.z = -1.6 + 0.9 * sin(beat);
    b.forearmL.rotation.z = 0.6 + 0.5 * sin(beat + 1);
    b.forearmR.rotation.z = -0.6 + 0.5 * sin(beat + 1);
    // Knees bend with the bounce.
    const bend = 0.25 * (1 + sin(2 * beat));
    for (const side of ['L', 'R']) {
      b[`thigh${side}`].rotation.x = -bend;
      b[`shin${side}`].rotation.x = 2 * bend;
      b[`foot${side}`].rotation.x = -bend;
    }
  },
  // Camera: in front and a little above, the whole body in frame.
  camera: { position: [0, 1.05, 3.2], target: [0, 0.75, 0], face: [0, 0.8, 0.4] },
};

/** Sube un video: the robot sits and watches a video on a big screen. */
export const watching = {
  card: true, // a menu card: takes part in the touch-screen face carousel
  props: [
    // Stool, the screen and its stand, all made of dots.
    { parent: 'root', position: [0, 0.22, -0.05], share: 0.06, sample: (n) => box([0, 0, 0], [0.4, 0.44, 0.36], n) },
    { parent: 'root', position: [0, 0.95, 0.95], rotation: [0, PI, 0], share: 0.22, sample: (n) => screen([0, 0, 0], [0.8, 0.48], n), screen: 'video' },
  ],
  pose(b, t) {
    b.pelvis.position.y = 0.5; // sitting on the stool
    b.torso.rotation.x = 0.06 + 0.03 * sin(t * 0.8); // breathing, slightly leaning forward
    b.head.rotation.x = -0.12; // looking up at the screen
    b.head.rotation.y = 0.08 * sin(t * 0.5);
    for (const [side, x] of [['L', 1], ['R', -1]]) {
      b[`thigh${side}`].rotation.x = -PI / 2; // thighs flat on the stool
      b[`shin${side}`].rotation.x = PI / 2; // shins straight down
      b[`arm${side}`].rotation.x = -0.6; // hands resting on the knees
      b[`arm${side}`].rotation.z = 0.12 * x;
      b[`forearm${side}`].rotation.x = -0.9;
    }
    // Now and then it raises a hand to its chin, thinking about what it saw.
    const think = Math.max(0, sin(t * 0.6)) ** 3;
    b.armR.rotation.x = -0.6 - 0.6 * think;
    b.forearmR.rotation.x = -0.9 - 1.3 * think;
  },
  // Camera behind and to the side, as if from the couch: the seated robot and the video it watches.
  camera: { position: [1.9, 1.35, -1.7], target: [0, 0.75, 0.45], face: [0, 0.85, 0.2] },
};

/** Ver simulaciones: the robot scrolls on its phone, watching a recap of what it did. */
export const scrolling = {
  card: true, // a menu card: takes part in the touch-screen face carousel
  props: [
    // Phone held in the right hand, screen toward the robot's face.
    { parent: 'handR', position: [0, -0.08, 0.04], rotation: [-PI / 2 + 0.25, 0, 0], share: 0.1, sample: (n) => screen([0, 0, 0], [0.11, 0.2], n), screen: 'phone' },
  ],
  pose(b, t) {
    b.root.rotation.y = 0.35 + 0.1 * sin(t * 0.3);
    b.pelvis.position.y = 0.72;
    b.pelvis.rotation.z = 0.04; // weight on one leg, relaxed
    b.head.rotation.x = 0.45; // looking down at the phone
    b.head.rotation.z = 0.06 * sin(t * 0.7);
    // Right arm holds the phone up in front of the chest.
    b.armR.rotation.x = -0.35;
    b.armR.rotation.z = -0.15;
    b.forearmR.rotation.x = -1.7;
    b.forearmR.rotation.z = 0.35;
    // Left hand comes over to swipe, a short flick every second or so.
    const swipe = 0.5 + 0.5 * sin(t * 2 * PI * 0.8);
    b.armL.rotation.x = -0.4;
    b.armL.rotation.z = 0.12;
    b.forearmL.rotation.x = -1.45 - 0.15 * swipe;
    b.forearmL.rotation.z = -0.55;
    b.thighL.rotation.x = -0.05;
    b.shinL.rotation.x = 0.1;
    b.thighR.rotation.z = -0.04;
  },
  camera: { position: [0.6, 1.2, 2.9], target: [0, 0.8, 0], face: [0, 0.85, 0.4] },
};


/** While the real robot loads: standing, breathing, and waving now and then. */
export const waiting = {
  props: [],
  pose(b, t) {
    b.root.rotation.y = 0.25 * Math.sin(t * 0.3);
    b.pelvis.position.y = 0.72;
    b.torso.rotation.x = 0.02 * sin(t * 1.5); // breathing
    b.head.rotation.y = 0.2 * sin(t * 0.4);
    b.armL.rotation.z = 0.12;
    // A wave every few seconds: the arm goes up and the forearm swings.
    const wave = Math.max(0, sin(t * 0.7)) ** 2;
    b.armR.rotation.z = -0.12 - 2.4 * wave;
    b.forearmR.rotation.z = -0.4 * wave * (1 + 0.6 * sin(t * 9));
  },
  camera: { position: [0, 1.0, 3.6], target: [0, 0.72, 0], face: [0, 0.8, 0.4] },
};
