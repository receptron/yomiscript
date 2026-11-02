// A listening set for the phrase rules and word accents learned here: test-half sentences (odd ids) whose marks they
// change, as D31 and as D31 with the rules (rules.mjs) and the word accents (corrections.mjs), rendered and served by eval/accent_lookup/listen (renderSet, serve.mjs --dir, score.mjs --dir).
// The set holds JSUT's texts (CC BY-SA), so listen/ is gitignored.
// usage: node listen.mjs [n]   -> listen/set.json and listen/audio/; then
//        node ../accent_lookup/listen/serve.mjs 8831 --dir listen
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { accentMarks } from "@yomiscript/ja-accent";
import { nodeAnalyzer } from "@yomiscript/ja-accent/node";
import { renderSet } from "../accent_lookup/listen/build.mjs";
import { shuffled } from "../tts_readings/listen/shuffle.mjs";
import { correctionSource, CORRECTIONS } from "./corrections.mjs";
import { half, joinRule, RULES } from "./rules.mjs";
import { scoredSentences } from "./sentences.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)),
  N = Number(process.argv[2] ?? 30),
  SEED = "jsut-accent-1";
const base = path.join(process.env.HOME, ".cache/yomiscript/ja-dict");
const A = await nodeAnalyzer({ dir: path.join(base, fs.readdirSync(base)[0]) });
const join = joinRule(JSON.parse(fs.readFileSync(RULES, "utf8")).rules),
  C = JSON.parse(fs.readFileSync(CORRECTIONS, "utf8")).corrections,
  source = correctionSource(C);
const changed = scoredSentences()
  .filter((s) => half(s.x.name) === "test")
  .map((s) => ({ text: s.x.text, pair: [accentMarks(s.ys, A), accentMarks(s.ys, A, { join, source })], runs: 1 }))
  .filter((p) => p.pair[0] !== p.pair[1]);
console.log(`${changed.length} test sentences changed; ${Math.min(N, changed.length)} in the set`);
await renderSet({ pairs: shuffled(changed, SEED).slice(0, N), methods: ["d31", "learned"], seed: SEED, dir: path.join(HERE, "listen") });
