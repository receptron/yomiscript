// The Supertonic Katarite in Node (CLI, MCP): onnxruntime-node, models from a directory laid out as the Hugging Face
// repository Supertone/supertonic-3 (onnx/…, voice_styles/…; the Python SDK caches it in ~/.cache/supertonic3).
// Files missing from the directory are downloaded once from that repository when a download URL is given.
import fs from "node:fs/promises";
import * as ort from "onnxruntime-node";
import { cachedLoader } from "@yomiscript/core/node";
import { SupertonicEngine, type Ort } from "./engine.ts";
import { SupertonicKatarite, type KatariteOptions } from "./katarite.ts";
import { AMBIGUOUS_URL, ambiguousSet } from "./index.ts";

export interface NodeSupertonicOptions extends KatariteOptions {
  /** the model directory */
  dir: string;
  /** download missing files from here (SUPERTONIC_MODELS_URL); none: every file must already be in dir */
  download?: string;
  onDownload?: (url: string) => void;
}
export async function nodeSupertonicEngine(dir: string, download?: string, onDownload?: (url: string) => void): Promise<SupertonicEngine> {
  return new SupertonicEngine(ort as unknown as Ort, cachedLoader({ dir, baseUrl: download, onDownload })).init({ executionProviders: ["cpu"] });
}
/** the Katarite, with the list of ambiguous written forms from this package's data/ */
export async function nodeSupertonic({ dir, download, onDownload, ...opts }: NodeSupertonicOptions): Promise<SupertonicKatarite> {
  const ambiguous = ambiguousSet(JSON.parse(await fs.readFile(AMBIGUOUS_URL, "utf8")) as Record<string, number>);
  return new SupertonicKatarite(await nodeSupertonicEngine(dir, download, onDownload), ambiguous, opts);
}
