// OpenJTalk's Japanese front end (jpreprocess with NAIST-JDIC, built to WebAssembly from wasm/) and its dictionary:
// the files of DICT_FILES, each gzipped (<file>.gz), read with a LoadBytes (downloaded once from DICT_URL by default).
import type { LoadBytes } from "@yomiscript/core";
import init, { Frontend, initSync } from "../wasm/pkg/frontend.js";

/** the dictionary is built by the jpreprocess version the WebAssembly uses (README); its files live under this name */
export const DICT_VERSION = "jpreprocess-0.15.0";
/** the dictionary on Hugging Face */
export const DICT_URL = `https://huggingface.co/receptron/yomiscript-ja-dict/resolve/main/${DICT_VERSION}/`;
/** the dictionary files, in the order the front end takes them */
export const DICT_FILES = ["metadata.json", "char_def.bin", "matrix.mtx", "dict.da", "dict.vals", "dict.wordsidx", "dict.words", "unk.bin"];

export interface Analysis {
  /** each word after the front end's rules, as CSV (pyopenjtalk's run_frontend fields) */
  njd: string[];
  /** the full-context label of each phoneme */
  labels: string[];
}
export interface Analyzer {
  analyze(text: string): Analysis;
}

async function gunzip(b: Uint8Array | ArrayBuffer): Promise<Uint8Array> {
  const s = new Blob([b as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
/** the front end with its dictionary; wasm: the module's bytes (Node), or none to fetch it next to the glue (browser) */
export async function loadFrontend(load: LoadBytes, wasm?: BufferSource): Promise<Analyzer> {
  if (wasm) initSync({ module: wasm });
  else await init();
  const parts = await Promise.all(DICT_FILES.map(async (f) => gunzip(await load(`${f}.gz`))));
  const bytes = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let at = 0;
  for (const p of parts) {
    bytes.set(p, at);
    at += p.length;
  }
  const fe = new Frontend(bytes, Uint32Array.from(parts.map((p) => p.length)));
  return {
    analyze: (text) => {
      const [njd, labels] = JSON.parse(fe.analyze(text)) as [string[], string[]];
      return { njd, labels };
    },
  };
}
