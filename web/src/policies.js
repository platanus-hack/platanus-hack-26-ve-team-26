// The trained policies of training/ (policy.onnx + policy.json each), as the levels of the pitch's
// ladder: the same robot untrained, half trained and trained. Vite bundles the files and gives
// them their URLs; nothing downloads until createSimView's loadPolicy asks for one.
const URLS = import.meta.glob('../../training/policies/*.{onnx,json}', { query: '?url', import: 'default', eager: true });

// Checkpoints of the 20 M-step run, in order. Steps are the training's own count of decisions.
export const LEVELS = [
  { id: 'g1-stand-step-0', label: 'Sin entrenar' },
  { id: 'g1-stand-step-3000000', label: '3 millones de pasos' },
  { id: 'g1-stand-step-10000000', label: '10 millones de pasos' },
  { id: 'g1-stand', label: '20 millones de pasos' },
].filter(({ id }) => URLS[`../../training/policies/${id}.onnx`]);

export const FINAL_LEVEL = 'g1-stand';

export const levelLabel = (id) => LEVELS.find((level) => level.id === id)?.label ?? id;

/** @returns {{ onnx: string, json: string }} URLs for createSimView's loadPolicy */
export function policyUrls(id) {
  return { onnx: URLS[`../../training/policies/${id}.onnx`], json: URLS[`../../training/policies/${id}.json`] };
}
