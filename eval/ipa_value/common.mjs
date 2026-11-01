// What the scripts of eval/ipa_value share: the items, the dictionary (OpenJTalk's, through @yomiscript/ja-accent), and
// where a target word is in a YomiScript and what its accent is.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parse, isJa } from "@yomiscript/core";
import { nodeAnalyzer } from "@yomiscript/ja-accent/node";

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const RESULTS = path.join(HERE, "results");
export const AUDIO = path.join(HERE, "audio");
export const LLMS = ["claude", "codex", "agy"];
export const readJson = (f) => JSON.parse(fs.readFileSync(path.join(HERE, f), "utf8"));
export const writeJson = (f, x) => {
  fs.mkdirSync(path.dirname(path.join(HERE, f)), { recursive: true });
  fs.writeFileSync(path.join(HERE, f), JSON.stringify(x, null, 1));
};
export const ACCENT_ITEMS = () => readJson("items_accent.json").items;
export const MIXED_ITEMS = () => readJson("items_mixed.json").items;
export const llmFile = (task, llm, run) => `results/llm/${task}.${llm}.r${run}.json`;

/** OpenJTalk's front end with NAIST-JDIC, as the tools load it (the dictionary in the tools' cache) */
export async function analyzer() {
  const base = path.join(process.env.HOME, ".cache/yomiscript/ja-dict");
  return nodeAnalyzer({ dir: path.join(base, fs.readdirSync(base)[0]) });
}

/** the Japanese morae of a YomiScript in order: { key, rise, fall, phrase, span, text } (key: the mora as compared) */
export function morae(ys) {
  const u = parse(ys),
    out = [];
  u.sections.forEach((s, si) => {
    if (!isJa(s.lang)) return;
    for (const t of s.toks)
      if (t.kind === "unit") out.push({ key: key(t.ipa), rise: !!t.rise, fall: !!t.fall, phrase: `${si}.${t.ph}`, span: t.span, text: u.texts[t.span] ?? "" });
  });
  return out;
}
// spellings that do not change the mora, and devoicing, made the same
const key = (ipa) =>
  ipa
    .normalize("NFD")
    .replace(/[̥̊]/g, "")
    .replace(/g/g, "ɡ")
    .replace(/u/g, "ɯ")
    .replace(/[mnŋɲ]$/, "ɴ")
    .replace(/^([kɡbpmɾ])j/, "$1ʲ")
    .replace(/^hi$/, "çi") // as @yomiscript/ja-accent compares morae
    .replace(/^ni$/, "ɲi")
    .normalize("NFC");

/** where the target word starts in the morae: the run of its morae (the base reading's), preferring one in a word
 * whose text contains it; -1 when the YomiScript reads it another way */
export function locate(M, target, word) {
  const n = target.length,
    hits = [];
  for (let i = 0; i + n <= M.length; i++) if (target.every((k, j) => M[i + j].key === k)) hits.push(i);
  const inWord = hits.filter((i) => M[i].text.includes(word));
  return inWord[0] ?? hits[0] ?? -1;
}

/** the accent of the n morae from i: the mora after which the pitch falls (1..n), 0 for none (flat) */
export function nucleus(M, i, n) {
  for (let j = 0; j < n; j++) if (M[i + j].fall) return j + 1;
  return 0;
}

/** Tokyo H / L of every mora from the marks: low at a phrase start unless the first mora is the nucleus, high after
 * ꜛ, low after ꜜ; null in a phrase without marks */
export function levels(M) {
  const marked = new Set(M.filter((m) => m.rise || m.fall).map((m) => m.phrase));
  let ph = null,
    lvl = "L",
    first = true;
  return M.map((m) => {
    if (m.phrase !== ph) [ph, lvl, first] = [m.phrase, "L", true];
    if (!marked.has(m.phrase)) return null;
    const here = first && m.fall && !m.rise ? "H" : lvl;
    if (m.rise) lvl = "H";
    if (m.fall) lvl = "L";
    first = false;
    return here;
  });
}

/** the target word's morae as compared (morae() keys), from the base reading: the morae of the word whose text it is */
export function targetKeys(x, base) {
  const M = morae(base.ys),
    span = M.find((m) => m.text.replace(/。$/, "") === x.word).span;
  return M.filter((m) => m.span === span).map((m) => m.key);
}
