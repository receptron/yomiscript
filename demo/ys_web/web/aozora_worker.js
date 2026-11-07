// The Katarite of aozora.html, in a worker so that the page keeps responding while a sentence is made: it takes a YomiScript and
// answers with its audio, one at a time, in the order asked. Import maps do not reach a worker, so the package comes as jsDelivr's
// bundle (+esm), which resolves the package's own imports. Everything the worker imports is on the page's own origin: under COEP,
// Safari refuses a module script from another origin in a worker, although jsDelivr sends CORS and CORP. The bundles are in lib/
// (worker_lib.sh), onnxruntime in ort/ (web/ort locally, copied by misread_site.sh).
import { modelBytes, modelFetcher } from "./model_cache.js";
import * as K from "./lib/kokoro.mjs";

const ORT = new URL("ort/", self.location.href).href;
// WebKit (Safari, and every browser on iOS) hangs on a long sentence when onnxruntime runs on several threads
const WEBKIT = /AppleWebKit/.test(navigator.userAgent) && !/Chrome\//.test(navigator.userAgent);

async function start() {
  const ort = await import(ORT + "ort.wasm.min.mjs");
  ort.env.wasm.wasmPaths = ORT;
  ort.env.wasm.numThreads = crossOriginIsolated && !WEBKIT ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
  const bytes = modelBytes(await modelFetcher(K.KOKORO_MODELS_URL));
  const E = new K.Engine(ort, async (file) => {
    const b = await bytes(file);
    return file.endsWith(".bin") ? b.buffer : b;
  });
  await E.init({ suffix: K.W16, executionProviders: ["wasm"] });
  await E.synth("ja /a ↘/"); // the first run prepares the sessions
  return E;
}

const engine = start();

self.onmessage = async ({ data: { id, ys } }) => {
  try {
    const E = await engine;
    if (ys == null) {
      self.postMessage({ id });
      return;
    }
    const t0 = performance.now(),
      { audio } = await E.synth(ys);
    self.postMessage({ id, blob: new Blob([K.wav(audio)], { type: "audio/wav" }), seconds: audio.length / K.SR, ms: performance.now() - t0 });
  } catch (e) {
    self.postMessage({ id, error: String(e) });
  }
};
