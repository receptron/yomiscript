// Scores run.mjs's answers (README.md):
//   readings    a sentence read as JSUT's gold reads it (the same kana, ヲ=オ ヂ=ジ ヅ=ズ, as eval/jsut_accent), per
//               condition; and per sentence between two conditions, how many are right in one and not the other
//               (base against base2 is how much two runs differ anyway)
//   boundaries  on the sentences read as the gold in both base and phrase, with the gold's number of morae: the accent
//               phrase boundaries ( | , ‖ ) between morae against the gold's (# and _), precision and recall; beside
//               them the dictionary's (D31 on the base answer, as the tools ship it, and with the phrase rules
//               eval/jsut_accent learned from its training half) and the base answer's own (its ‖ only)
// usage: node score.mjs [llm]   -> results/<llm>.json (aggregates only), results/<llm>.md
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { accentMarks } from "@yomiscript/ja-accent";
import { nodeAnalyzer } from "@yomiscript/ja-accent/node";
import { norm, ysKana } from "../koriyama_g2p/kana.mjs";
import { count, goldMorae, ourMorae, tally as accentTally } from "../jsut_accent/morae.mjs";
import { joinRule, RULES } from "../jsut_accent/rules.mjs";
import { goldKana } from "../jsut_accent/sentences.mjs";
import { batchFile, BATCH, CONDITIONS, sentences } from "./run.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const llm = process.argv[2] ?? "claude";
const base = path.join(process.env.HOME, ".cache/yomiscript/ja-dict"),
  A = await nodeAnalyzer({ dir: path.join(base, fs.readdirSync(base)[0]) }),
  join = joinRule(JSON.parse(fs.readFileSync(RULES, "utf8")).rules);

/** each condition's answer of each sentence (undefined when not answered) */
function answers(S) {
  const out = Object.fromEntries(CONDITIONS.map((c) => [c, new Map()]));
  for (const c of CONDITIONS)
    for (let b = 0; b * BATCH < S.length; b++) {
      const f = batchFile(llm, c, b);
      if (!fs.existsSync(f)) continue;
      const r = JSON.parse(fs.readFileSync(f, "utf8"));
      for (const [n, ys] of Object.entries(r.output ?? {})) if (typeof ys === "string") out[c].set(n, ys);
    }
  return out;
}

/** read as the gold reads it */
function readRight(x, ys) {
  try {
    return norm(ysKana(ys).kana, true) === norm(goldKana(x.gold), true);
  } catch {
    return false;
  }
}

/** right in a and not in b, and the other way */
function differ(S, R, a, b) {
  return {
    [`${a} only`]: S.filter((x) => R[a].get(x.name) && !R[b].get(x.name)).length,
    [`${b} only`]: S.filter((x) => !R[a].get(x.name) && R[b].get(x.name)).length,
  };
}

const tally = () => ({ gaps: 0, gold: 0, ours: 0, both: 0 });
/** the boundaries between morae of a marking against the gold's */
function countBounds(T, G, ys) {
  const O = ourMorae(ys);
  if (O.length !== G.length) return false;
  for (let i = 0; i + 1 < G.length; i++) {
    const g = G[i].phrase !== G[i + 1].phrase,
      o = O[i].phrase !== O[i + 1].phrase;
    T.gaps++;
    T.gold += g;
    T.ours += o;
    T.both += g && o;
  }
  return true;
}
const prf = (T) => {
  const p = T.both / T.ours,
    r = T.both / T.gold;
  return { precision: +(100 * p).toFixed(1), recall: +(100 * r).toFixed(1), f1: +((200 * p * r) / (p + r)).toFixed(1), ...T };
};

function boundaries(S, ans, R) {
  const ways = {
      llm: (x) => ans.phrase.get(x.name),
      d31: (x) => accentMarks(ans.base.get(x.name), A),
      d31Rules: (x) => accentMarks(ans.base.get(x.name), A, { join }),
      pausesOnly: (x) => ans.base.get(x.name),
    },
    T = Object.fromEntries(Object.keys(ways).map((k) => [k, tally()]));
  let n = 0;
  for (const x of S) {
    if (!R.base.get(x.name) || !R.phrase.get(x.name)) continue;
    const G = goldMorae(x.gold),
      tries = Object.keys(ways).map((k) => [k, structuredClone(T[k])]);
    // a sentence counts only when every marking has the gold's number of morae
    if (!tries.every(([k, t]) => countBounds(t, G, ways[k](x)))) continue;
    for (const [k, t] of tries) T[k] = t;
    n++;
  }
  return { sentences: n, ...Object.fromEntries(Object.entries(T).map(([k, t]) => [k, prf(t)])) };
}

/** the accent against the gold on the same sentences: D31 on the base answer (with and without the learned phrase
 * rules) and D31 keeping the LLM's own phrases (D32), as eval/jsut_accent scores it */
function accent(S, ans, R) {
  const ways = {
      d31: (x) => accentMarks(ans.base.get(x.name), A),
      d31Rules: (x) => accentMarks(ans.base.get(x.name), A, { join }),
      d32: (x) => accentMarks(ans.phrase.get(x.name), A),
    },
    T = Object.fromEntries(Object.keys(ways).map((k) => [k, accentTally()]));
  let n = 0;
  for (const x of S) {
    if (!R.base.get(x.name) || !R.phrase.get(x.name)) continue;
    const G = goldMorae(x.gold),
      O = Object.fromEntries(Object.keys(ways).map((k) => [k, ourMorae(ways[k](x))]));
    if (!Object.values(O).every((o) => o.length === G.length)) continue;
    for (const k of Object.keys(ways)) count(T[k], G, O[k]);
    n++;
  }
  const pct = (a, b) => +((100 * a) / b).toFixed(1);
  return {
    sentences: n,
    ...Object.fromEntries(
      Object.entries(T).map(([k, t]) => [
        k,
        {
          covered: pct(t.covered, t.morae),
          hlRight: pct(t.hlRight, t.morae),
          phrasesSpan: pct(t.phrasesSpan, t.phrases),
          phrasesRight: pct(t.phrasesRight, t.phrases),
        },
      ]),
    ),
  };
}

const S = sentences(),
  ans = answers(S),
  R = Object.fromEntries(CONDITIONS.map((c) => [c, new Map(S.map((x) => [x.name, ans[c].has(x.name) && readRight(x, ans[c].get(x.name))]))]));
const readings = Object.fromEntries(CONDITIONS.map((c) => [c, { answered: ans[c].size, readRight: [...R[c].values()].filter(Boolean).length }]));
const result = {
  llm,
  sentences: S.length,
  readings,
  between: { base_base2: differ(S, R, "base", "base2"), base_phrase: differ(S, R, "base", "phrase"), base2_phrase: differ(S, R, "base2", "phrase") },
  boundaries: boundaries(S, ans, R),
  accent: accent(S, ans, R),
};
fs.mkdirSync(path.join(HERE, "results"), { recursive: true });
fs.writeFileSync(path.join(HERE, `results/${llm}.json`), JSON.stringify(result, null, 1) + "\n");
console.log(JSON.stringify(result, null, 1));
