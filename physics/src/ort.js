// onnxruntime-web, loaded only when a policy is asked for (its WebAssembly is 14 MB), with that
// WebAssembly served by our own build instead of a CDN, so the page works with the build alone.
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import mjsUrl from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url';

let ready = null;

export function loadOrt() {
  ready ??= import('onnxruntime-web/wasm').then((ort) => {
    ort.env.wasm.wasmPaths = { mjs: mjsUrl, wasm: wasmUrl };
    // One thread: the network is 265 KB, a decision takes well under a millisecond, and several
    // threads need the page to be cross-origin isolated (special headers), which Vercel does not send.
    ort.env.wasm.numThreads = 1;
    return ort;
  });
  return ready;
}
