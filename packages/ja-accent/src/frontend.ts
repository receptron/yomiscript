// OpenJTalk's Japanese front end (jpreprocess with NAIST-JDIC, built to WebAssembly from wasm/) and its dictionary:
// the files of DICT_FILES, each gzipped (<file>.gz), read with a LoadBytes (downloaded once from DICT_URL by default).
import type { LoadBytes } from "@yomiscript/core";
import init, { Frontend, initSync } from "../wasm/pkg/frontend.js";
import { USER_DICT } from "./userdict.ts";

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
/** one dictionary entry of a sentence: characters [s, e) of the normalized text, its morae as OpenJTalk phonemes
 * (["k","o"], ["N"], ["cl"], ["-"] for a long vowel), its word cost and context ids (-1: an unknown word) */
export interface Cand {
  s: number;
  e: number;
  ph: string[][];
  cost: number;
  l: number;
  r: number;
}
/** every dictionary entry of a sentence given as its words (D31) */
export interface Sentence {
  /** the words normalized one by one and joined */
  norm: string;
  /** the character where each word starts in norm, and the end */
  starts: number[];
  cands: Cand[];
  /** OpenJTalk's own analysis of norm, as indices into cands */
  alone: number[];
}
export interface Analyzer {
  /** the text as OpenJTalk analyses it */
  analyze(text: string): Analysis;
  /** every dictionary entry of the sentence whose words these are */
  candidates(words: string[]): Sentence;
  /** the connection cost from right id r to left id l (0: the start or end of the sentence) */
  conn(r: number, l: number): number;
  /** OpenJTalk's rules on a path of candidates(words).cands */
  label(words: string[], path: number[]): Analysis;
}

async function gunzip(b: Uint8Array | ArrayBuffer): Promise<Uint8Array> {
  const s = new Blob([b as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
/** the front end with its dictionary and the user dictionary (userdict.ts); wasm: the module's bytes (Node), or none
 * to fetch it next to the glue (browser) */
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
  const fe = new Frontend(bytes, Uint32Array.from(parts.map((p) => p.length)), USER_DICT);
  const analysis = (json: string): Analysis => {
    const [njd, labels] = JSON.parse(json) as [string[], string[]];
    return { njd, labels };
  };
  return {
    analyze: (text) => analysis(fe.analyze(text)),
    candidates: (words) => JSON.parse(fe.candidates(JSON.stringify(words))) as Sentence,
    conn: (r, l) => fe.conn(r, l),
    label: (words, path) => analysis(fe.label(JSON.stringify({ words, path }))),
  };
}
