// The Katarite in Node: ys.js with Kokoro's vocab loaded, and the ONNX engine reading the demo's models and voices
// from demo/ys_web/web (see README.md for how they get there). Shared by the Yomites and the eval scripts.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as ort from "onnxruntime-web";
import * as K from "./web/ys.js";

export const WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), "web");
K.setData(JSON.parse(fs.readFileSync(path.join(WEB, "data.json"))));
export { K, ort };
// model variants: fp32 (identical to the original Kokoro) and w16 (fp16 weights, the demo's default)
export const MODELS = { fp32: {}, w16: { enc: "_w16", f0n: "_w16", dec: "_w16" } };

async function loadBytes(p) {
  const b = fs.readFileSync(path.join(WEB, p));
  return p.endsWith(".bin") ? b.buffer.slice(b.byteOffset, b.byteOffset + b.length) : new Uint8Array(b);
}
export async function engine(model = "w16") {
  ort.env.wasm.numThreads = 1;
  const E = new K.Engine(ort, loadBytes);
  await E.init({ suffix: MODELS[model] });
  return E;
}
