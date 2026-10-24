// The runtime for the policies' networks: onnx-lite.js, plain JavaScript (a few KB) instead of
// onnxruntime-web, whose WebAssembly was 14 MB for a 270 KB network (scripts/check-onnx.mjs shows
// both give the same motor targets). Kept behind loadOrt() so policy.js and index.js stay as they were.
let ready = null;

export function loadOrt() {
  ready ??= import('./onnx-lite.js');
  return ready;
}
