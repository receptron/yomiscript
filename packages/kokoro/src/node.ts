// The Kokoro Katarite in Node (CLI, MCP): onnxruntime-node and the fp32 models, identical to the original Kokoro.
import fs from "node:fs/promises";
import path from "node:path";
import * as ort from "onnxruntime-node";
import { Engine, FP32, W16, type Ort } from "./engine.ts";

export interface NodeEngineOptions {
  /** directory with models/<part>[_w16].onnx and voices/<voice>.bin */
  dir: string;
  model?: "fp32" | "w16";
}
export async function nodeEngine({ dir, model = "fp32" }: NodeEngineOptions): Promise<Engine> {
  const load = async (p: string) => new Uint8Array(await fs.readFile(path.join(dir, p)));
  return new Engine(ort as unknown as Ort, load).init({ suffix: model === "fp32" ? FP32 : W16, executionProviders: ["cpu"] });
}
