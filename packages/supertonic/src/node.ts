// The Supertonic Katarite in Node (CLI, MCP): onnxruntime-node, models from a directory laid out as the Hugging Face
// repository Supertone/supertonic-3 (onnx/…, voice_styles/…; the Python SDK caches it in ~/.cache/supertonic3).
import fs from "node:fs/promises";
import path from "node:path";
import * as ort from "onnxruntime-node";
import { SupertonicEngine, type Ort } from "./engine.ts";
import { SupertonicKatarite, type KatariteOptions } from "./katarite.ts";
import { AMBIGUOUS_URL, ambiguousSet } from "./index.ts";

export interface NodeSupertonicOptions extends KatariteOptions {
  /** the model directory */
  dir: string;
}
export async function nodeSupertonicEngine(dir: string): Promise<SupertonicEngine> {
  const load = async (p: string) => new Uint8Array(await fs.readFile(path.join(dir, p)));
  return new SupertonicEngine(ort as unknown as Ort, load).init({ executionProviders: ["cpu"] });
}
/** the Katarite, with the list of ambiguous written forms from this package's data/ */
export async function nodeSupertonic({ dir, ...opts }: NodeSupertonicOptions): Promise<SupertonicKatarite> {
  const ambiguous = ambiguousSet(JSON.parse(await fs.readFile(AMBIGUOUS_URL, "utf8")) as Record<string, number>);
  return new SupertonicKatarite(await nodeSupertonicEngine(dir), ambiguous, opts);
}
