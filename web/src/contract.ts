// Mirror of the draft in docs/contrato.md. When the contract is accepted, these
// types move to the shared types file and this one re-exports them (W0.3).

/** [x, y, z, visibility]: meters, y up, z toward the camera, origin at the hips of frame 0. */
export type Joint = [number, number, number, number]

export interface PoseFrame {
  t: number
  /** 33 entries in MediaPipe Pose order. */
  joints: Joint[]
}

export interface PoseClip {
  id: string
  source: 'camera' | 'upload'
  source_file: string | null
  fps: number
  skeleton: 'mediapipe33'
  units: 'm'
  origin: 'hips'
  subject: {
    track_id: number
    selected_by: 'auto' | 'user'
  }
  frames: PoseFrame[]
  quality: { valid_ratio: number }
}

export interface PolicyMeta {
  id: string
  robot: string
  obs_dim: number
  nu: number
  trained_on: string[]
  steps: number
  created_at: string
}
