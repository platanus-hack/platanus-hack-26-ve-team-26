// Mirror of the draft in docs/contrato.md, as JSDoc so editors can check it without a build step.
// When the contract is accepted, these move to the shared types file (W0.3).

/**
 * [x, y, z, visibility]: meters, y up, z toward the camera, origin at the hips of frame 0.
 * @typedef {[number, number, number, number]} Joint
 */

/**
 * @typedef {object} PoseFrame
 * @property {number} t
 * @property {Joint[]} joints  33 entries in MediaPipe Pose order
 */

/**
 * @typedef {object} PoseClip
 * @property {string} id
 * @property {'camera' | 'upload'} source
 * @property {string | null} source_file
 * @property {number} fps
 * @property {'mediapipe33'} skeleton
 * @property {'m'} units
 * @property {'hips'} origin
 * @property {{ track_id: number, selected_by: 'auto' | 'user' }} subject
 * @property {PoseFrame[]} frames
 * @property {{ valid_ratio: number }} quality
 */

/**
 * @typedef {object} PolicyMeta
 * @property {string} id
 * @property {string} robot
 * @property {string} mjcf  scene the policy was trained on
 * @property {number} obs_dim
 * @property {number} nu
 * @property {string[]} trained_on
 * @property {number} steps
 * @property {string} created_at
 */

export {};
