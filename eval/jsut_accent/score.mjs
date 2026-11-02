// The dictionary accent against JSUT's hand-annotated accent (jsut-label, prepare.py), on the LLM's YomiScripts of
// the JSUT sentences (run.mjs). Only the sentences the LLM reads as the gold does (the same kana, ヲ=オ ヂ=ジ ヅ=ズ, and
// the same number of morae) are scored, so a reading error is not counted as an accent error. Each way of marking
// (D31, the YomiScript's own words; D25 / D27, OpenJTalk's analysis of the text) is compared mora by mora with the
// gold: Tokyo H / L inside the accent phrases it marks (a phrase it leaves unmarked keeps Kokoro's pitch and is
// counted as not covered), the accent phrase boundaries between two covered morae, and whole phrases (the same span
// and the same H / L).
// usage: node score.mjs   -> results/summary.md, results/scores.json (aggregates only), results/details.md (the words)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { accentMarks, lookupAnalysis } from "@yomiscript/ja-accent";
import { nodeAnalyzer } from "@yomiscript/ja-accent/node";
import { ourMorae } from "./morae.mjs";
import { correctionSource, CORRECTIONS } from "./corrections.mjs";
import { half, joinRule, RULES } from "./rules.mjs";
import { items } from "./run.mjs";
import { scoredSentences } from "./sentences.mjs";
import { loadUnidic, unidicSource, UNIDIC } from "./unidic.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const base = path.join(process.env.HOME, ".cache/yomiscript/ja-dict");
const A = await nodeAnalyzer({ dir: path.join(base, fs.readdirSync(base)[0]) });
const tally = () => ({ morae: 0, covered: 0, hlRight: 0, bounds: 0, boundsGold: 0, boundsOurs: 0, boundsBoth: 0, phrases: 0, phrasesSpan: 0, phrasesRight: 0 });
const DIGIT = /[0-9０-９]/;
/** why a gold phrase is not right (D31): its words' texts and the cause */
function cause(P, O, u, fell) {
  const words = [...new Set(P.map((x) => x.o.span).filter((s) => s !== undefined))].map((s) => u.texts[s]),
    first = P[0].o.phrase,
    span = P.every((x) => x.o.marked && x.o.phrase === first) && Map.groupBy(O, (o) => o.phrase).get(first).length === P.length;
  let k = "accent";
  if (words.some((w) => DIGIT.test(w))) k = "numbers";
  else if (words.some((w) => fell.has(w))) k = "no entry";
  else if (!P.every((x) => x.o.marked)) k = "unmarked";
  else if (!span) k = "boundary";
  return { k, words: words.join("") };
}
/** for each gold phrase: whether the way gets it right (one marked phrase of the same span, the same H / L) */
function rightPhrases(G, O) {
  const sizes = Map.groupBy(O, (o) => o.phrase);
  return [
    ...Map.groupBy(
      G.map((g, i) => ({ g, o: O[i] })),
      (x) => x.g.phrase,
    ).values(),
  ].map((P) => {
    const first = P[0].o.phrase;
    return P.every((x) => x.o.marked && x.o.phrase === first && x.g.hl === x.o.hl) && sizes.get(first).length === P.length;
  });
}
/** the morae covered (in a phrase with marks) and those with the gold's H / L */
function countMorae(T, G, O) {
  T.morae += G.length;
  O.forEach((o, i) => {
    if (!o.marked) return;
    T.covered++;
    if (o.hl === G[i].hl) T.hlRight++;
  });
}
/** the phrase boundaries between two covered morae: the gold's, ours, and both */
function countBounds(T, G, O) {
  for (let i = 0; i + 1 < G.length; i++) {
    if (!O[i].marked || !O[i + 1].marked) continue;
    const g = G[i].phrase !== G[i + 1].phrase,
      o = O[i].phrase !== O[i + 1].phrase;
    T.bounds++;
    T.boundsGold += g ? 1 : 0;
    T.boundsOurs += o ? 1 : 0;
    T.boundsBoth += g && o ? 1 : 0;
  }
}
/** whole gold phrases: covered by one marked phrase of ours with the same span, and with the same H / L */
function countPhrases(T, G, O) {
  const sizes = Map.groupBy(O, (o) => o.phrase);
  for (const P of Map.groupBy(
    G.map((g, i) => ({ g, o: O[i] })),
    (x) => x.g.phrase,
  ).values()) {
    T.phrases++;
    const first = P[0].o.phrase;
    if (!P.every((x) => x.o.marked && x.o.phrase === first) || sizes.get(first).length !== P.length) continue;
    T.phrasesSpan++;
    if (P.every((x) => x.g.hl === x.o.hl)) T.phrasesRight++;
  }
}
/** one sentence's counts for one way of marking */
function count(T, G, O) {
  countMorae(T, G, O);
  countBounds(T, G, O);
  countPhrases(T, G, O);
}
const WAYS = { d31: (ys) => accentMarks(ys, A), d25: (ys) => accentMarks(ys, A, { analysis: true }) };
const NAMES = {
  d31: "D31 (the YomiScript's words and readings)",
  d25: "D25 / D27 (OpenJTalk's analysis)",
  unidic: "D31, UniDic's accent types",
  unidicContent: "D31, UniDic's accent types for content words",
  rules: "D31, phrase rules learned from the training half (rules.mjs)",
  corrections: "D31, word accents learned from the training half (corrections.mjs)",
  nounCorrections: "D31, the same for words that do not conjugate",
  both: "D31, the phrase rules and the word accents for words that do not conjugate",
  bothAll: "D31, the phrase rules and the word accents",
};
// UniDic's accent on the D31 path, when UniDic is in ~/.cache/unidic (unidic.mjs)
const U = fs.existsSync(UNIDIC) ? loadUnidic() : null,
  uType = U && unidicSource(U),
  uContent = U && unidicSource(U, { content: true });
if (U) {
  WAYS.unidic = (ys) => accentMarks(ys, A, { source: uType.source });
  WAYS.unidicContent = (ys) => accentMarks(ys, A, { source: uContent.source });
}
// the phrase rules of rules.mjs and the word accents of corrections.mjs, when they have been learned
const join = fs.existsSync(RULES) && joinRule(JSON.parse(fs.readFileSync(RULES, "utf8")).rules);
if (join) WAYS.rules = (ys) => accentMarks(ys, A, { join });
if (fs.existsSync(CORRECTIONS)) {
  const C = JSON.parse(fs.readFileSync(CORRECTIONS, "utf8")).corrections,
    nouns = Object.fromEntries(Object.entries(C).filter(([k]) => !/^(動詞|形容詞)/.test(k.split("\t")[2])));
  WAYS.corrections = (ys) => accentMarks(ys, A, { source: correctionSource(C) });
  WAYS.nounCorrections = (ys) => accentMarks(ys, A, { source: correctionSource(nouns) });
  if (join) WAYS.both = (ys) => accentMarks(ys, A, { join, source: correctionSource(nouns) });
  if (join) WAYS.bothAll = (ys) => accentMarks(ys, A, { join, source: correctionSource(C) });
}

const S = scoredSentences(),
  T = { all: {}, test: {} },
  fellWords = new Map(),
  causes = {},
  paired = {};
for (const k of Object.keys(WAYS)) for (const h of Object.keys(T)) T[h][k] = tally();

const bump = (M, w) => M.set(w, (M.get(w) ?? 0) + 1);
/** the words (<t:…>) of a gold phrase */
const phraseWords = (P, O, u) => [...new Set(P.map((y) => O[y.i].span).filter((v) => v !== undefined))].map((v) => u.texts[v]).join("");
/** the gold phrases each way gets right where D31 does not (better) and wrong where D31 does (worse), with their words */
function pair(s, right) {
  const goldPhrases = [
    ...Map.groupBy(
      s.G.map((g, i) => ({ g, i })),
      (y) => y.g.phrase,
    ).values(),
  ];
  for (const k of Object.keys(WAYS).filter((k) => k !== "d31")) {
    paired[k] ??= { better: new Map(), worse: new Map() };
    goldPhrases.forEach((P, j) => {
      const a = right.d31.r[j],
        b = right[k].r[j];
      if (a !== b) bump(paired[k][b ? "better" : "worse"], phraseWords(P, right.d31.O, s.u));
    });
  }
}
/** the causes of the gold phrases D31 does not get right */
function diagnose(s, O) {
  const fell = new Set(lookupAnalysis(s.u, A).fell);
  for (const w of fell) bump(fellWords, w);
  const right = rightPhrases(s.G, O);
  [
    ...Map.groupBy(
      s.G.map((g, i) => ({ g, o: O[i] })),
      (y) => y.g.phrase,
    ).values(),
  ].forEach((P, j) => {
    if (right[j]) return;
    const c = cause(P, O, s.u, fell);
    causes[c.k] ??= new Map();
    bump(causes[c.k], c.words);
  });
}
for (const s of S) {
  const right = {};
  for (const [k, f] of Object.entries(WAYS)) {
    const O = ourMorae(f(s.ys));
    count(T.all[k], s.G, O);
    if (half(s.x.name) === "test") count(T.test[k], s.G, O);
    right[k] = { r: rightPhrases(s.G, O), O };
  }
  pair(s, right);
  diagnose(s, right.d31.O);
}

const pct = (a, b) => (b ? ((100 * a) / b).toFixed(1) : "-");
const row = (k, t) => {
  const p = t.boundsBoth / t.boundsOurs,
    r = t.boundsBoth / t.boundsGold;
  return `| ${NAMES[k]} | ${pct(t.covered, t.morae)} | ${pct(t.hlRight, t.covered)} | ${pct(t.boundsBoth, t.boundsOurs)} / ${pct(t.boundsBoth, t.boundsGold)} (F1 ${((200 * p * r) / (p + r)).toFixed(1)}) | ${pct(t.phrasesSpan, t.phrases)} | ${pct(t.phrasesRight, t.phrasesSpan)} | ${pct(t.phrasesRight, t.phrases)} |`;
};
const HEAD = [
  "| marking | morae covered % | H/L right % (covered) | boundaries precision / recall % (covered pairs) | gold phrases with the same span % | of those, H/L right % | gold phrases right % |",
  "|---|---|---|---|---|---|---|",
];
const total = (M) => [...M.values()].reduce((a, b) => a + b, 0),
  top = (M, n) =>
    [...M]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([w, c]) => (c > 1 ? `${w} ${c}` : w))
      .join(", ");
const llms = Map.groupBy([...S.answers.values()], (a) => a.llm),
  answeredBy = [...llms].map(([l, a]) => `${l} ${a.length}`).join(", "),
  testN = S.filter((s) => half(s.x.name) === "test").length;
const lines = [
  "# The dictionary accent against JSUT's hand-annotated accent",
  "",
  `Generated by score.mjs on ${new Date().toISOString().slice(0, 10)}. ${items().length} JSUT BASIC5000 sentences (jsut-label, CC BY-SA 4.0); answers: ${answeredBy}. Scored: ${S.length} sentences read as the gold reads them; not scored: ${Object.entries(
    S.why,
  )
    .map(([k, v]) => `${k} ${v}`)
    .join(", ")}.`,
  "",
  "## All scored sentences",
  "",
  ...HEAD,
  ...Object.keys(WAYS).map((k) => row(k, T.all[k])),
  "",
  `## The test half (odd ids, ${testN} sentences; the phrase rules are learned on the even ids)`,
  "",
  ...HEAD,
  ...Object.keys(WAYS).map((k) => row(k, T.test[k])),
  "",
  "Gold phrases each way gets right where D31 does not (better), and wrong where D31 gets them right (worse), all sentences:",
  "",
  ...Object.entries(paired).map(([k, { better, worse }]) => `- ${NAMES[k]}: better ${total(better)}, worse ${total(worse)}`),
  "",
  ...(U ? [`UniDic (cwj 3.1.0) has the entries of the D31 path, by surface and pronunciation: ${uType.stats.found} of ${uType.stats.entries}.`, ""] : []),
  "Gold phrases D31 does not get right, by cause (the first that applies: a number in it; a word taken as OpenJTalk's analysis reads it; a mora it leaves unmarked; another phrase span; the same span with other H / L):",
  "",
  ...Object.entries(causes).map(([k, M]) => `- ${k}: ${total(M)}`),
  "",
  "The words of each count are in results/details.md (gitignored: JSUT's text).",
  "",
];
// the words behind the counts: JSUT's text (CC BY-SA), kept out of the repository
const details = [
  "# The words behind summary.md (JSUT BASIC5000, jsut-label, CC BY-SA 4.0)",
  "",
  ...Object.entries(paired).map(([k, { better, worse }]) => `- ${k}: better (${top(better, 15)}); worse (${top(worse, 15)})`),
  "",
  ...Object.entries(causes).map(([k, M]) => `- ${k}: ${top(M, 25)}`),
  "",
  `Words taken as OpenJTalk's analysis reads them (D31; most frequent): ${top(fellWords, 30)}`,
  "",
];
fs.mkdirSync(path.join(HERE, "results"), { recursive: true });
fs.writeFileSync(path.join(HERE, "results/summary.md"), lines.join("\n"));
fs.writeFileSync(path.join(HERE, "results/details.md"), details.join("\n"));
const causeTotals = Object.fromEntries(Object.entries(causes).map(([k, M]) => [k, total(M)]));
fs.writeFileSync(
  path.join(HERE, "results/scores.json"),
  JSON.stringify({ sentences: items().length, scored: S.length, notScored: S.why, ways: T, causes: causeTotals }, null, 1),
);
console.log([...lines, ...details].join("\n"));
