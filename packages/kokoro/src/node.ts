// The Kokoro Katarite in Node (CLI, MCP): onnxruntime-node and the fp32 models, identical to the original Kokoro.
// Files missing from the directory are downloaded once from Hugging Face when a download URL is given.
import * as ort from "onnxruntime-node";
import { cachedLoader } from "@yomiscript/core/node";
import { Engine, FP32, W16, type Ort } from "./engine.ts";

export interface NodeEngineOptions {
  /** directory with models/<part>[_w16].onnx and voices/<voice>.bin */
  dir: string;
  model?: "fp32" | "w16";
  /** download missing files from here (KOKORO_MODELS_URL); none: every file must already be in dir */
  download?: string;
  onDownload?: (url: string) => void;
}
export async function nodeEngine({ dir, model = "fp32", download, onDownload }: NodeEngineOptions): Promise<Engine> {
  const load = cachedLoader({ dir, baseUrl: download, onDownload });
  return new Engine(ort as unknown as Ort, load).init({ suffix: model === "fp32" ? FP32 : W16, executionProviders: ["cpu"] });
}
