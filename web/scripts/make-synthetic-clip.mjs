// Writes a synthetic PoseClip (a person marching in place, facing the camera) so
// the web can be built before data/ produces real clips.
// Usage: node scripts/make-synthetic-clip.mjs
import { writeFileSync } from 'node:fs'

const FPS = 30 // same rate the contract example uses for real clips
const SECONDS = 2.4 // two full steps: the clip loops without a jump
const STEP_PERIOD = 1.2 // seconds per left+right cycle, a relaxed marching pace

// Body proportions of an average adult, in meters, relative to the hip center.
const HIP_HALF_WIDTH = 0.1
const SHOULDER_HALF_WIDTH = 0.18
const SHOULDER_HEIGHT = 0.5
const THIGH = 0.45
const SHIN = 0.45
const UPPER_ARM = 0.28
const FOREARM = 0.26
const MAX_KNEE_LIFT = (55 * Math.PI) / 180 // thigh angle at the top of a step
const MAX_ARM_SWING = (30 * Math.PI) / 180

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
// A limb hanging down from `from`, rotated `angle` forward (toward +z, the camera).
const limb = (from, length, angle) => add(from, [0, -length * Math.cos(angle), length * Math.sin(angle)])

function pose(t) {
  const phase = (2 * Math.PI * t) / STEP_PERIOD
  const leftLift = Math.max(0, Math.sin(phase)) * MAX_KNEE_LIFT
  const rightLift = Math.max(0, -Math.sin(phase)) * MAX_KNEE_LIFT
  const swing = Math.sin(phase) * MAX_ARM_SWING
  const bounce = 0.02 * Math.abs(Math.sin(phase)) // the body rises a little on each step

  const p = new Array(33)
  // Facing the camera, the subject's left side is at +x.
  const lHip = [HIP_HALF_WIDTH, bounce, 0]
  const rHip = [-HIP_HALF_WIDTH, bounce, 0]
  const lSh = [SHOULDER_HALF_WIDTH, SHOULDER_HEIGHT + bounce, 0]
  const rSh = [-SHOULDER_HALF_WIDTH, SHOULDER_HEIGHT + bounce, 0]

  const leg = (hip, lift, ids) => {
    const knee = limb(hip, THIGH, lift)
    const ankle = limb(knee, SHIN, 0) // shin stays vertical: the foot hangs under the knee
    p[ids.knee] = knee
    p[ids.ankle] = ankle
    p[ids.heel] = add(ankle, [0, -0.05, -0.05])
    p[ids.toe] = add(ankle, [0, -0.07, 0.15])
  }
  const arm = (shoulder, angle, side, ids) => {
    const elbow = limb(shoulder, UPPER_ARM, angle)
    const wrist = limb(elbow, FOREARM, angle + 0.4) // elbows stay slightly bent
    p[ids.elbow] = elbow
    p[ids.wrist] = wrist
    p[ids.pinky] = add(wrist, [side * 0.02, -0.08, 0])
    p[ids.index] = add(wrist, [side * 0.01, -0.09, 0.02])
    p[ids.thumb] = add(wrist, [-side * 0.02, -0.05, 0.03])
  }

  p[23] = lHip
  p[24] = rHip
  p[11] = lSh
  p[12] = rSh
  leg(lHip, leftLift, { knee: 25, ankle: 27, heel: 29, toe: 31 })
  leg(rHip, rightLift, { knee: 26, ankle: 28, heel: 30, toe: 32 })
  // Arms swing opposite to the legs, as in a natural gait.
  arm(lSh, -swing, 1, { elbow: 13, wrist: 15, pinky: 17, index: 19, thumb: 21 })
  arm(rSh, swing, -1, { elbow: 14, wrist: 16, pinky: 18, index: 20, thumb: 22 })

  const head = [0, SHOULDER_HEIGHT + 0.22 + bounce, 0]
  p[0] = add(head, [0, 0, 0.1]) // nose
  p[1] = add(head, [0.02, 0.03, 0.08])
  p[2] = add(head, [0.035, 0.03, 0.08])
  p[3] = add(head, [0.05, 0.03, 0.07])
  p[4] = add(head, [-0.02, 0.03, 0.08])
  p[5] = add(head, [-0.035, 0.03, 0.08])
  p[6] = add(head, [-0.05, 0.03, 0.07])
  p[7] = add(head, [0.08, 0.01, 0])
  p[8] = add(head, [-0.08, 0.01, 0])
  p[9] = add(head, [0.025, -0.04, 0.08])
  p[10] = add(head, [-0.025, -0.04, 0.08])

  const round = (v) => Math.round(v * 1000) / 1000 // millimeters are enough for rendering
  return p.map(([x, y, z]) => [round(x), round(y), round(z), 1])
}

const frames = []
for (let i = 0; i < Math.round(SECONDS * FPS); i++) {
  const t = i / FPS
  frames.push({ t: Math.round(t * 1000) / 1000, joints: pose(t) })
}

const clip = {
  id: 'clip_synthetic_march_01',
  source: 'camera', // the contract allows source_file: null only for camera clips
  source_file: null,
  fps: FPS,
  skeleton: 'mediapipe33',
  units: 'm',
  origin: 'hips',
  subject: { track_id: 0, selected_by: 'auto' },
  frames,
  quality: { valid_ratio: 1 },
}

const out = new URL('../public/preloaded/clip_synthetic_march_01.json', import.meta.url)
writeFileSync(out, JSON.stringify(clip))
console.log(`wrote ${frames.length} frames to ${out.pathname}`)
