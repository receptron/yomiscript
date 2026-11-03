// Word accents from the accent read from Qwen (abs.mjs): eval/jsut_accent/corrections.mjs's learner with the marks
// abs.mjs read on each sentence in place of a gold (H / L and the accent phrases as ourMorae reads a marked
// YomiScript), learned on the training half (even ids) only. A word becomes an entry when it is seen at least twice
// with the same type in at least 80% of them and that type is not NAIST-JDIC's, so a reading that only one sentence
// gives is left out.
// Tested on the test half (odd ids, never learned from): the tools' marks with and without the entries, both
// rendered by the model fitted to Qwen, against Qwen's own pitch (rmse in semitones, each sentence centred).
// usage: node abs_dict.mjs   (after abs.mjs)   -> data/abs_word_accents.json, results/abs_dict.json
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parse, realize } from "@yomiscript/core";
import { ACCENT_SCALE, accentMarks } from "@yomiscript/ja-accent";
import { nodeAnalyzer } from "@yomiscript/ja-accent/node";
import { corrections, correctionSource, entryKey, learn } from "../jsut_accent/corrections.mjs";
import { ourMorae } from "../jsut_accent/morae.mjs";
import { half, pathEntries } from "../jsut_accent/rules.mjs";
import { scoredSentences } from "../jsut_accent/sentences.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ABS_DICT = path.join(HERE, "data/abs_word_accents.json");

/** the root mean square distance of the YomiScript's values (as the fitted model renders its marks) from Qwen's */
function distance(marked, target, model) {
  const ys = realize(marked, { markedOnly: true, jaScale: ACCENT_SCALE, jaModel: model }),
    V = parse(ys)
      .sections[0].toks.filter((t) => t.kind === "unit")
      .map((t) => t.f0 ?? null),
    pairs = V.flatMap((v, i) => (v && target[i] ? [[v, target[i]]] : []));
  if (!pairs.length) return null;
  const mean = (k) => pairs.reduce((s, p) => s + p[k].reduce((a, b) => a + b, 0), 0) / (3 * pairs.length),
    [mv, mt] = [mean(0), mean(1)];
  return Math.sqrt(pairs.reduce((s, [v, t]) => s + v.reduce((a, x, j) => a + (x - mv - (t[j] - mt)) ** 2, 0), 0) / (3 * pairs.length));
}

function test(A, source, model) {
  const data = fs
    .readFileSync(path.join(HERE, "data/jsut_qwen_clone.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l))
    .filter((r) => r.given === "text" && half(r.name) === "test");
  const T = { sentences: 0, changed: 0, closer: 0, farther: 0, d31: 0, dict: 0 };
  for (const r of data) {
    const a = accentMarks(r.ys, A),
      b = accentMarks(r.ys, A, { source });
    const da = distance(a, r.f0, model),
      db = a === b ? da : distance(b, r.f0, model);
    if (da === null || db === null) continue;
    T.sentences++;
    T.d31 += da;
    T.dict += db;
    if (a !== b) {
      T.changed++;
      if (db < da - 0.05) T.closer++;
      if (db > da + 0.05) T.farther++;
    }
  }
  return { ...T, d31: T.d31 / T.sentences, dict: T.dict / T.sentences };
}

const base = path.join(process.env.HOME, ".cache/yomiscript/ja-dict"),
  A = await nodeAnalyzer({ dir: path.join(base, fs.readdirSync(base)[0]) }),
  model = JSON.parse(fs.readFileSync(path.join(HERE, "work/fit.json"), "utf8")),
  read = JSON.parse(fs.readFileSync(path.join(HERE, "work/abs.json"), "utf8"));
const S = scoredSentences()
  .filter((s) => read[s.x.name])
  .map((s) => ({ ...s, G: ourMorae(read[s.x.name].ys) }));
const C = learn(S, A),
  naist = new Map();
for (const s of S) for (const e of pathEntries(s.ys, A) ?? []) naist.set(entryKey(e), e.acc);
const entries = corrections(C, naist);
fs.writeFileSync(
  ABS_DICT,
  JSON.stringify(
    { from: "the accent read from Qwen3-TTS by analysis by synthesis (eval/qwen_prosody/abs.mjs), JSUT training half", words: C.size, corrections: entries },
    null,
    1,
  ),
);
// words that do not conjugate only (as jsut_accent's nounCorrections): a verb's or an adjective's accent depends on
// its form, which one entry per surface does not follow
const nouns = Object.fromEntries(Object.entries(entries).filter(([k]) => !/^(動詞|形容詞)/.test(k.split("\t")[2])));
const result = {
  entries: Object.keys(entries).length,
  words: C.size,
  test: test(A, correctionSource(entries), model),
  nouns: { entries: Object.keys(nouns).length, test: test(A, correctionSource(nouns), model) },
};
fs.writeFileSync(path.join(HERE, "results/abs_dict.json"), JSON.stringify(result, null, 1));
console.log(JSON.stringify(result, null, 1));
