// Word accents learned from Qwen: eval/jsut_accent/corrections.mjs's learner, with the accent Qwen speaks in each
// of the gold's accent phrases (accent_qwen.py) in place of the gold's own. The phrases stay the gold's; in each, H / L
// are those of Qwen's nucleus (Tokyo pattern: n = 1 high then low; n > 1 low, high up to n, then low; 0 low then
// high). As there, only the training half (even ids) is learned from, and a word becomes a correction when it is seen
// at least twice with the same type in at least 80% of them and that type is not NAIST-JDIC's. jsut_accent's
// score.mjs scores it against the gold (the `qwen` row) when the file exists.
// usage: node corrections.mjs   -> data/qwen_word_accents.json
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { nodeAnalyzer } from "@yomiscript/ja-accent/node";
import { corrections, entryKey, learn } from "../jsut_accent/corrections.mjs";
import { pathEntries } from "../jsut_accent/rules.mjs";
import { scoredSentences } from "../jsut_accent/sentences.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const QWEN_CORRECTIONS = path.join(HERE, "data/qwen_word_accents.json");

/** Tokyo H / L of the j-th mora of a phrase whose pitch falls after its n-th mora (0: no fall) */
function tokyo(n, j) {
  if (n === 1) return j === 0 ? "H" : "L";
  if (j === 0) return "L";
  return n === 0 || j < n ? "H" : "L";
}
/** the gold's morae with H / L from the nucleus heard in each phrase (null: one mora, kept as the gold has it) */
export function withNuclei(G, nuclei) {
  const phrases = [...new Set(G.map((m) => m.phrase))];
  return phrases.flatMap((p, pi) => {
    const P = G.filter((m) => m.phrase === p),
      n = nuclei[pi];
    if (n === null || n === undefined) return P;
    return P.map((m, j) => ({ ...m, hl: tokyo(n, j) }));
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const base = path.join(process.env.HOME, ".cache/yomiscript/ja-dict");
  const A = await nodeAnalyzer({ dir: path.join(base, fs.readdirSync(base)[0]) });
  const heard = JSON.parse(fs.readFileSync(path.join(HERE, "work/qwen_accent.json"), "utf8"));
  const S = scoredSentences()
    .filter((s) => heard[s.x.name])
    .map((s) => ({ ...s, G: withNuclei(s.G, heard[s.x.name]) }));
  const C = learn(S, A),
    naist = new Map();
  for (const s of S) for (const e of pathEntries(s.ys, A) ?? []) naist.set(entryKey(e), e.acc);
  const out = corrections(C, naist);
  fs.writeFileSync(
    QWEN_CORRECTIONS,
    JSON.stringify({ from: "Qwen3-TTS (eval/qwen_prosody), JSUT training half", sentences: S.length, words: C.size, corrections: out }, null, 1),
  );
  console.log(`${S.length} sentences, ${C.size} words seen; ${Object.keys(out).length} corrections`);
}
