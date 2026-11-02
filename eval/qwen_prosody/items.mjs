// The sentences for the Qwen prosody corpus: JSUT BASIC5000 where Codex's YomiScript reads as the hand-checked gold
// does (eval/jsut_accent's scoredSentences: the same kana and the same number of morae), each with its text, its
// YomiScript and its units as the Kokoro Katarite plans them (what measure.py aligns to).
// usage: node items.mjs   -> work/items.json
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as K from "@yomiscript/kokoro";
import { originalText } from "yomiscript";
import { scoredSentences } from "../jsut_accent/sentences.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const S = scoredSentences(),
  out = [];
for (const { x, ys } of S) {
  const P = K.plan(ys);
  if (P.length !== 1) continue; // one Japanese section only
  out.push({ name: x.name, text: originalText(ys), ys, toks: P[0].toks.map(({ kind, mk, on, v, ipa, dev }) => ({ kind, mk, on, v, ipa, dev })) });
}
fs.mkdirSync(path.join(HERE, "work"), { recursive: true });
fs.writeFileSync(path.join(HERE, "work/items.json"), JSON.stringify(out));
console.log(`${out.length} sentences (of ${S.length} scored; not scored: ${JSON.stringify(S.why)})`);
