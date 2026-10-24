// The trained policies of training/ (policy.onnx + policy.json each), as the levels of the pitch's
// ladder: the same robot untrained, half trained and trained. Vite bundles the files and gives
// them their URLs; nothing downloads until createSimView's loadPolicy asks for one.
const URLS = import.meta.glob('../../training/policies/*.{onnx,json}', { query: '?url', import: 'default', eager: true });

// The ladder, in order: the first run's checkpoints (v1, 20 M steps), then the runs that continue
// it. Steps are the training's own count of decisions (training/README.md).
export const LEVELS = [
  { id: 'g1-stand-step-0', label: 'Sin entrenar' },
  { id: 'g1-stand-step-3000000', label: '3 millones de pasos' },
  { id: 'g1-stand-step-10000000', label: '10 millones de pasos' },
  { id: 'g1-stand-step-20000768', label: '20 millones de pasos' },
  // stand-v7b: v2 (40 M, stronger pushes) plus 8 M with the stance terms. It no longer pivots
  // (0,9 deg/s against v2's 55) but holds 3 of 4 of the web's pushes (training.evaluate).
  { id: 'g1-stand-quiet', label: '48 millones de pasos, quieta (3 de 4 empujones)' },
  // stand-v7d: 12 M more from v7b. Just as quiet (1,6 deg/s) and holds 3,6 of 4 pushes, so it is the
  // final one (docs/bitacora/2026-10-24-1300-juan-landing-caminata.md).
  { id: 'g1-stand', label: '60 millones de pasos' },
].filter(({ id }) => URLS[`../../training/policies/${id}.onnx`]);

export const FINAL_LEVEL = 'g1-stand';

// Imitation policies (training/imitate.py): each learned one clip, and does it with physics instead
// of standing still. `clip` is the PoseClip/RobotMotion it learned; the option shows only for it.
export const IMITATIONS = [
  { id: 'g1-walk', clip: 'clip_2026-10-23_caminar-perfil_01', label: 'Imitando el video, con física (en entrenamiento)' },
].filter(({ id }) => URLS[`../../training/policies/${id}.onnx`]);

export const imitationOf = (id) => IMITATIONS.find((imitation) => imitation.id === id) ?? null;

export const levelLabel = (id) => (LEVELS.find((level) => level.id === id) ?? imitationOf(id))?.label ?? id;

/** @returns {{ onnx: string, json: string }} URLs for createSimView's loadPolicy */
export function policyUrls(id) {
  return { onnx: URLS[`../../training/policies/${id}.onnx`], json: URLS[`../../training/policies/${id}.json`] };
}
