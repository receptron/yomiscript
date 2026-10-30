// The dictionary accent in Node (CLI, MCP): the WebAssembly from this package, the dictionary from a directory,
// downloaded into it once when a download URL is given.
import fs from "node:fs/promises";
import { cachedLoader } from "@yomiscript/core/node";
import { loadFrontend, type Analyzer } from "./frontend.ts";

export interface NodeAnalyzerOptions {
  /** directory with the dictionary files (<file>.gz) */
  dir: string;
  /** download missing files from here (DICT_URL); none: every file must already be in dir */
  download?: string;
  onDownload?: (url: string) => void;
}
export async function nodeAnalyzer({ dir, download, onDownload }: NodeAnalyzerOptions): Promise<Analyzer> {
  const wasm = await fs.readFile(new URL("../wasm/pkg/frontend_bg.wasm", import.meta.url));
  return loadFrontend(cachedLoader({ dir, baseUrl: download, onDownload }), wasm);
}
