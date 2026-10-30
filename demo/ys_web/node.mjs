// The Kokoro Katarite in Node for the eval scripts: the @yomiscript/kokoro package (built: yarn build) with
// onnxruntime-web, as in the browser (the parity results in eval/kokoro_parity were measured this way), reading the
// demo's models and voices (see README.md for how they get there). The CLI and MCP server use onnxruntime-node instead.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as ort from "onnxruntime-web";
import * as K from "@yomiscript/kokoro";

export const WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), "web");
export { K, ort };
// model variants: fp32 (identical to the original Kokoro) and w16 (fp16 weights, the demo's default)
export const MODELS = { fp32: K.FP32, w16: K.W16 };

async function loadBytes(p) {
  return new Uint8Array(fs.readFileSync(path.join(WEB, p)));
}
export async function engine(model = "w16") {
  ort.env.wasm.numThreads = 1;
  return new K.Engine(ort, loadBytes).init({ suffix: MODELS[model] });
}
