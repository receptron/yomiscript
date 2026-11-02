// Phrase rules learned from JSUT's hand-annotated accent phrases (a JoinRule of @yomiscript/ja-accent), on half of
// the sentences (the even ids) so the other half tests them. For each pair of neighbouring entries of the D31 path,
// keyed by their parts of speech (and the surface of a function word), how often the gold joins them into one accent
// phrase, and how often OpenJTalk's own rules agree with the gold; a pair seen at least SEEN times becomes a rule
// (join, or split) when that agrees with the gold more often than OpenJTalk's rules do, by at least MARGIN.
// usage: node rules.mjs   -> results/rules.json (parts of speech, surfaces of function words, counts)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parse } from "@yomiscript/core";
import { accentMarks, bestPath, wordsOf } from "@yomiscript/ja-accent";
import { goldMorae, ourMorae } from "./morae.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const RULES = path.join(HERE, "results/rules.json");
const SEEN = 20,
  MARGIN = 0.1;

/** the half a sentence is in: training (even id) or test (odd id) */
export const half = (name) => (Number(name.split("_")[1]) % 2 === 0 ? "train" : "test");

const FUNCTION = /^(助詞|助動詞|動詞,非自立|名詞,非自立|名詞,接尾|形容詞,非自立)/,
  SURU = new Set(["し", "する", "さ", "せ", "すれ", "しろ", "せよ"]);
/** an entry as a rule sees it: its part of speech (two fields), with its surface for a function word and for する */
export function key(e) {
  const pos = e.pos.split("+")[0].split(",").slice(0, 2).join(",");
  return FUNCTION.test(pos) || (pos === "動詞,自立" && SURU.has(e.surface)) ? `${pos}:${e.surface}` : pos;
}
/** a JoinRule from learned rules: join or split the pairs they name */
export function joinRule(rules) {
  return (prev, cur) => rules[`${key(prev)} > ${key(cur)}`];
}

/** the entries of the D31 path of a YomiScript with the mora each starts at, or null (a word read by OpenJTalk's
 * analysis, whose morae may not be the YomiScript's) */
export function pathEntries(ys, a) {
  const u = parse(ys),
    W = wordsOf(u),
    S = a.candidates(W.map((w) => w.text)),
    best = bestPath(S, W, a);
  if (!best || best.fell.length) return null;
  const chars = [...S.norm];
  let m = 0;
  return best.path.map((i) => {
    const c = S.cands[i],
      e = { ...c, surface: chars.slice(c.s, c.e).join(""), mora: m };
    m += c.ph.length;
    return e;
  });
}

/** counts one sentence's pairs into C: how often the gold joins the two entries (join), and how often OpenJTalk's
 * rules decide as the gold does (agree), at the boundaries where both sides are marked */
function countPairs(C, { x, ys }, a) {
  const E = pathEntries(ys, a),
    G = goldMorae(x.gold),
    O = ourMorae(accentMarks(ys, a));
  if (!E || E.reduce((n, e) => n + e.ph.length, 0) !== G.length || O.length !== G.length) return;
  for (let k = 1; k < E.length; k++) {
    const b = E[k].mora;
    if (!E[k].ph.length || b === 0 || b >= G.length || !O[b - 1].marked || !O[b].marked) continue;
    const pair = `${key(E[k - 1])} > ${key(E[k])}`,
      c = C.get(pair) ?? { join: 0, agree: 0, n: 0 },
      g = G[b - 1].phrase === G[b].phrase;
    c.n++;
    if (g) c.join++;
    if (g === (O[b - 1].phrase === O[b].phrase)) c.agree++;
    C.set(pair, c);
  }
}
/** the rules: the pairs where joining (or splitting) agrees with the gold more often than OpenJTalk's rules do */
function decide(C) {
  const rules = {};
  for (const [pair, c] of C) {
    if (c.n < SEEN) continue;
    const join = c.join / c.n,
      agree = c.agree / c.n;
    if (join >= agree + MARGIN) rules[pair] = true;
    else if (1 - join >= agree + MARGIN) rules[pair] = false;
  }
  return rules;
}
/** the rules learned from the sentences (the training half), and the counts behind them */
export function learn(sentences, a) {
  const C = new Map();
  for (const s of sentences) countPairs(C, s, a);
  return { rules: decide(C), counts: Object.fromEntries([...C].filter(([, c]) => c.n >= SEEN).sort((p, q) => q[1].n - p[1].n)) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { nodeAnalyzer } = await import("@yomiscript/ja-accent/node");
  const { scoredSentences } = await import("./sentences.mjs");
  const base = path.join(process.env.HOME, ".cache/yomiscript/ja-dict");
  const A = await nodeAnalyzer({ dir: path.join(base, fs.readdirSync(base)[0]) });
  const train = scoredSentences().filter((s) => half(s.x.name) === "train");
  const L = learn(train, A);
  fs.writeFileSync(RULES, JSON.stringify({ seen: SEEN, margin: MARGIN, trainSentences: train.length, ...L }, null, 1));
  console.log(`${train.length} training sentences; ${Object.keys(L.rules).length} rules (${Object.values(L.rules).filter(Boolean).length} join)`);
}
