// The dictionary accent from the YomiScript's own words and readings (D31, `lookupAnalysis` of @yomiscript/ja-accent)
// against OpenJTalk's analysis of the text (D25, D27, `{ analysis: true }`), over the LLM's readings of
// eval/prosody_ref/mismatch.mjs (Claude's YomiScripts of eval/browser_tts/trials/accent_marks).
// usage: node compare.mjs   -> results/compare.json and a summary
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parse } from "@yomiscript/core";
import { dictPhrases, lookupAnalysis, wordsOf, writeMarks } from "@yomiscript/ja-accent";
import { nodeAnalyzer } from "@yomiscript/ja-accent/node";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUNS = path.join(HERE, "../browser_tts/trials/accent_marks/runs/claude");
const base = path.join(process.env.HOME, ".cache/yomiscript/ja-dict");
const A = await nodeAnalyzer({ dir: path.join(base, fs.readdirSync(base)[0]) });

function lookupMarks(u, text) {
  const { njd, labels, fell, found } = lookupAnalysis(u, A);
  return { P: dictPhrases(text, njd, labels), fell, failed: !found, words: wordsOf(u).filter((w) => w.units.length).length };
}

/** per word (<t:...>) of the utterance: whether an accent phrase that got marks covers it, and its reading as written */
function perWord(ys, P, u) {
  const starts = [];
  let at = 0;
  for (const t of u.texts) {
    starts.push([at, at + t.length]);
    at += t.length;
  }
  const marked = starts.map(() => false);
  for (const p of P) if (writeMarks(ys, [p]).stats.marked) starts.forEach(([a], i) => a >= p.start && a < p.end && (marked[i] = true));
  const out = writeMarks(ys, P).ys,
    seg = out
      .split(/<t:[^>]*>/)
      .slice(0, -1)
      .map((x) => x.split(/[\s/]/).pop());
  return { marked, seg };
}
const WORDS = { same: 0, differ: 0, gained: 0, lost: 0, neither: 0 },
  examples = { gained: [], lost: [], differ: [] };
function compareWords(ys, u, P0, P1) {
  const a = perWord(ys, P0, u),
    b = perWord(ys, P1, u),
    ja = wordsOf(u).map((w) => w.units.length > 0);
  u.texts.forEach((t, i) => {
    if (!ja[i]) return;
    let k = "neither";
    if (a.marked[i] && b.marked[i]) k = a.seg[i] === b.seg[i] ? "same" : "differ";
    else if (a.marked[i]) k = "lost";
    else if (b.marked[i]) k = "gained";
    WORDS[k]++;
    if (examples[k]) examples[k].push(`${t}: ${a.marked[i] ? a.seg[i] : "-"} / ${b.marked[i] ? b.seg[i] : "-"}`);
  });
}

const KEYS = ["phrases", "marked", "reading", "words"],
  total = { analysis: Object.fromEntries(KEYS.map((k) => [k, 0])), lookup: Object.fromEntries(KEYS.map((k) => [k, 0])) },
  diffs = [],
  fellWords = [];
let n = 0,
  failed = 0,
  same = 0,
  lost = 0,
  words = 0,
  fallback = 0;
for (const f of fs.readdirSync(RUNS).filter((x) => x.startsWith("none."))) {
  for (const [id, ys] of Object.entries(JSON.parse(fs.readFileSync(path.join(RUNS, f), "utf8")).output)) {
    let u;
    try {
      u = parse(ys);
    } catch {
      continue; // an invalid YomiScript
    }
    const text = u.texts.join(""),
      { njd, labels } = A.analyze(text),
      P0 = dictPhrases(text, njd, labels),
      look = lookupMarks(u, text);
    if (!P0 || !look.P) {
      if (P0 && !look.P) lost++;
      continue;
    }
    const a = writeMarks(ys, P0),
      b = writeMarks(ys, look.P);
    n++;
    words += look.words;
    fallback += look.fell.length;
    fellWords.push(...look.fell);
    failed += look.failed ? 1 : 0;
    for (const k of KEYS) {
      total.analysis[k] += a.stats[k];
      total.lookup[k] += b.stats[k];
    }
    compareWords(ys, u, P0, look.P);
    if (a.ys === b.ys) same++;
    else
      diffs.push({
        run: f,
        id,
        text,
        analysis: a.ys,
        lookup: b.ys,
        missesAnalysis: a.stats.misses.map((m) => m.text),
        missesLookup: b.stats.misses.map((m) => m.text),
      });
  }
}
fs.mkdirSync(path.join(HERE, "results"), { recursive: true });
fs.writeFileSync(
  path.join(HERE, "results/compare.json"),
  JSON.stringify({ n, failed, same, lost, words, fallback, total, perWord: WORDS, examples, fellWords, diffs }, null, 1),
);
console.log({ yomiscripts: n, identical: same, noPath: failed, labelFailed: lost, japaneseWords: words, wordsReadByOpenJTalk: fallback });
console.log("analysis (ja-accent):", total.analysis);
console.log("lookup (prototype):  ", total.lookup);
console.log("Japanese words, analysis -> lookup (marked or not, and the marks):", WORDS);
const top = (L) => [...L.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map())].sort((x, y) => y[1] - x[1]);
console.log(
  "words read by OpenJTalk's analysis:",
  top(fellWords)
    .map(([x, c]) => (c > 1 ? `${x} (${c})` : x))
    .join("; "),
);
for (const k of ["gained", "lost", "differ"])
  console.log(
    `${k}:`,
    top(examples[k])
      .slice(0, 25)
      .map(([x, c]) => (c > 1 ? `${x} (${c})` : x))
      .join("; "),
  );
