// The Katarite of aozora.html, in a worker so that the page keeps responding while a sentence is made: it takes a YomiScript and
// answers with its audio, one at a time, in the order asked. Import maps do not reach a worker, so the package comes as jsDelivr's
// bundle (+esm), which resolves the package's own imports.
import { modelBytes, modelFetcher } from "./model_cache.js";
import * as K from "https://cdn.jsdelivr.net/npm/@yomiscript/kokoro@0.1.3/+esm";

const ORT = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/";

async function start() {
  const ort = await import(ORT + "ort.min.mjs");
  ort.env.wasm.wasmPaths = ORT;
  ort.env.wasm.numThreads = crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
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
