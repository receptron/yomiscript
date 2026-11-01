// The conditions of the matched-prompt ablation (README.md): the frozen prompts of eval/representation, run again, and
// two YomiScript prompts that differ from the frozen one only in the long-vowel examples of its Japanese rules.
// The template is eval/browser_tts/prompt.md itself (the frozen YomiScript prompt), edited here in one place.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { buildPrompt, HERE as BROWSER_TTS } from "../browser_tts/sets.mjs";
import { BATCH, batches, ordered, SUBSET } from "../koriyama_g2p/items.mjs";
import { norm } from "../koriyama_g2p/kana.mjs";
import { prompt } from "../representation/formats.mjs";

export const HERE = path.dirname(fileURLToPath(import.meta.url));
const YS_TEMPLATE = fs.readFileSync(path.join(BROWSER_TTS, "prompt.md"), "utf8");
/** the frozen YomiScript prompt's long-vowel examples; the frozen kana prompt has (先生 セーセー, 東京 トーキョー, 時計 トケー, 言う ユー) */
export const FROZEN_EXAMPLES = "(先生 `seːseː`, 東京 `toːkʲoː`)";
function edited(examples) {
  if (!YS_TEMPLATE.includes(FROZEN_EXAMPLES)) throw new Error("eval/browser_tts/prompt.md changed: its long-vowel examples are not found");
  return YS_TEMPLATE.replace(FROZEN_EXAMPLES, examples);
}
/** the two edits: (a) 言う jɯː (the kana prompt's ユー, in the prompt's IPA), (b) 先生 with its moraic nasal (ɴ before s, spec §4) */
export const MATCHED_EXAMPLES = "(先生 `seɴseː`, 東京 `toːkʲoː`, 言う `jɯː`)";
/** the kana prompt's four examples in IPA, its slip included (先生 セーセー): the same guidance in the other container */
export const MIRROR_EXAMPLES = "(先生 `seːseː`, 東京 `toːkʲoː`, 時計 `tokeː`, 言う `jɯː`)";
const MATCHED = edited(MATCHED_EXAMPLES),
  MIRROR = edited(MIRROR_EXAMPLES);

/** condition -> { format scored as, run, prompt(items), the raw folder of a run already made (eval/koriyama_g2p) } */
export const CONDITIONS = {
  "yomiscript.frozen.r1": { format: "yomiscript", label: "YomiScript frozen, run 1", g2p: "yomiscript" },
  "yomiscript.frozen.r2": { format: "yomiscript", label: "YomiScript frozen, run 2", prompt: (items) => prompt("yomiscript", items) },
  "yomiscript.matched": { format: "yomiscript", label: "YomiScript matched (a+b)", prompt: (items) => buildPrompt(MATCHED, items) },
  "yomiscript.mirror": { format: "yomiscript", label: "YomiScript mirror of kana", prompt: (items) => buildPrompt(MIRROR, items) },
  "kana.frozen.r1": { format: "kana", label: "kana frozen, run 1", g2p: "kana" },
  "kana.frozen.r2": { format: "kana", label: "kana frozen, run 2", prompt: (items) => prompt("kana", items) },
};
/** the LLMs run (Antigravity has no quota) */
export const LLMS = ["claude", "codex"];

/** does the sentence hold what edits (a) and (b) are about: いう / 言う read ユウ in the gold, or 先生 */
export const reached = (x) => (/[い言云]う/.test(x.text) && norm(x.gold, true).includes("ユウ")) || x.text.includes("先生");
function targeted() {
  const items = ordered().slice(SUBSET).filter(reached),
    B = [];
  for (let i = 0; i < items.length; i += BATCH) B.push(items.slice(i, i + BATCH));
  return B;
}
/** the sentence sets, as batches: the subset of eval/koriyama_g2p (its first 300), and the targeted set (every other
 * sentence of the 3,000 that edits (a) and (b) can reach, in the same order), and all 3,000 (eval/koriyama_g2p's batches) */
export const SETS = { subset: () => batches(SUBSET), targeted, all: () => batches(ordered().length) };
