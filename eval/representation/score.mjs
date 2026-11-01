// Score the four formats the same way: every answer becomes the phoneme string Kokoro's Katarite would be given
// (YomiScript as it is; SSML: its ph values in order, as one utterance; kana: through kana.py, the converter the gold
// readings went through; sparse kana: pyopenjtalk's reading of the sentence with the annotated runs read as annotated)
// and is compared with the hard set's gold as eval/browser_tts does (reading.mjs `loose`).
// Target words (eval/tts_readings/targets.tsv): the answer's phonemes are closer to the gold with the word read right
// than to the gold with the word misread (edit distance; a tie counts as wrong).
// The scoring is exported for eval/representation_isolated, which scores its answers the same way.
// usage: node score.mjs   (PYTHON: a python with pyopenjtalk, default ../prosody_ref/.venv/bin/python)
//   -> results/summary.md, results/items.json
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { SETS, HERE as BROWSER_TTS } from "../browser_tts/sets.mjs";
import { lev, loose, ps } from "../browser_tts/reading.mjs";
import { check, FORMATS, HERE, LLMS } from "./formats.mjs";

const OUT = path.join(HERE, "results");
export const ITEMS = SETS.hard;
const PYTHON = process.env.PYTHON ?? path.join(HERE, "../prosody_ref/.venv/bin/python");
const REFS = JSON.parse(fs.readFileSync(path.join(BROWSER_TTS, "refs.json"), "utf8")).hard;
export const GOLD = REFS.map((r) => r.gold.map((g) => loose(ps(g))));
const lp = (ys) => {
  const p = ys ? ps(ys) : null;
  return p === null ? null : loose(p);
};

function targets() {
  const T = {};
  for (const l of fs.readFileSync(path.join(HERE, "../tts_readings/targets.tsv"), "utf8").split("\n")) {
    if (!l || l.startsWith("#")) continue;
    const [name, word, right, wrong] = l.split("\t");
    const read = (s) => s.split("|").map((r) => (r === "-" ? "" : r));
    T[name] ??= [];
    T[name].push({ word, right: read(right), wrong: read(wrong) });
  }
  return T;
}
export const TARGETS = targets();
// the gold (first reading) with the word read each way, as katakana
function candidates(item, t) {
  const base = item.gold[0];
  if (!base.includes(t.right[0])) throw new Error(`${item.name}: ${t.right[0]} is not in ${base}`);
  const swap = (r) => base.replace(t.right[0], r);
  return { right: t.right.map(swap), wrong: t.wrong.map(swap) };
}

function records() {
  const R = [];
  for (const d of fs
    .readdirSync(OUT)
    .filter((d) => /^r\d+$/.test(d))
    .sort())
    for (const f of fs.readdirSync(path.join(OUT, d)).filter((f) => f.endsWith(".json"))) R.push(JSON.parse(fs.readFileSync(path.join(OUT, d, f), "utf8")));
  return R;
}

function convert(list, args) {
  const p = spawnSync(PYTHON, [path.join(HERE, "kana.py"), ...args], { input: JSON.stringify(list), encoding: "utf8", maxBuffer: 1 << 26 });
  if (p.status !== 0) throw new Error(`kana.py failed: ${p.stderr}`);
  const ys = JSON.parse(p.stdout);
  return list.map((k, i) => [k, ys[i]]);
}
// -> YomiScript in two Python calls: all katakana (kana answers, target candidates) and all sparse texts (pyopenjtalk)
export function kanaTable(recs) {
  const K = new Set(),
    T = new Set();
  for (const r of recs.filter((r) => r.format === "kana" || r.format === "sparse"))
    for (const x of ITEMS) {
      const c = check(r.format, r.output?.[x.name], x.text);
      if (c.kana) K.add(c.kana);
      if (c.sparse) T.add(c.sparse);
    }
  for (const x of ITEMS) T.add(check("sparse", x.text, x.text).sparse); // pyopenjtalk alone, for comparison
  for (const x of ITEMS)
    for (const t of TARGETS[x.name] ?? [])
      Object.values(candidates(x, t))
        .flat()
        .forEach((k) => K.add(k));
  return {
    K: new Map(convert([...K], [])),
    T: new Map(
      convert(
        [...T].map((t) => JSON.parse(t)),
        ["--sparse"],
      ).map(([t, y]) => [JSON.stringify(t), y]),
    ),
  };
}

function wordRight(got, item, t, KY) {
  if (got === null) return false;
  const c = candidates(item, t);
  const d = (ks) => Math.min(...ks.map((k) => lev(got, lp(KY.K.get(k)) ?? "")));
  return d(c.right) < d(c.wrong);
}

function reading(c, KY) {
  if (c.kana !== undefined) return KY.K.get(c.kana);
  return c.sparse !== undefined ? KY.T.get(c.sparse) : c.ys;
}
// sparse: does an annotated run overlap the target word (its first place in the text)? none when the text was changed
function annotated(spans, text, word) {
  const i = text.indexOf(word),
    a = [...text.slice(0, i)].length,
    b = a + [...word].length;
  return !!spans && i >= 0 && spans.some(([s, e]) => s < b && a < e);
}

// one answer (a format, an LLM, a run): per item, what it reads as and whether that is right
export function evaluate(rec, KY) {
  return ITEMS.map((x, i) => {
    const c = check(rec.format, rec.output?.[x.name], x.text);
    const got = lp(reading(c, KY));
    if (got === null && !c.problems.length) c.problems.push("not read");
    const T = TARGETS[x.name] ?? [];
    const words = T.map((t) => wordRight(got, x, t, KY));
    const unannotated = rec.format === "sparse" ? T.filter((t) => !annotated(c.spans, x.text, t.word)).length : NaN;
    return { name: x.name, got, right: got !== null && GOLD[i].includes(got), words, unannotated, ...c };
  });
}

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
export function stats(rec, E) {
  const present = E.filter((e) => !e.problems.includes("missing"));
  const words = E.flatMap((e) => e.words);
  return {
    sentence: (100 * E.filter((e) => e.right).length) / E.length,
    word: (100 * words.filter(Boolean).length) / words.length,
    malformed: E.filter((e) => e.problems.length).length,
    missing: E.length - present.length,
    chars: mean(present.map((e) => e.chars)),
    ipaChars: mean(present.map((e) => e.ipaChars)),
    tokens: rec.outputTokens ? rec.outputTokens / E.length : NaN,
    seconds: rec.seconds,
    textBack: rec.format === "kana" ? NaN : E.filter((e) => e.textBack).length,
    unannotated: rec.format === "sparse" ? E.reduce((n, e) => n + e.unannotated, 0) : NaN,
  };
}

const COLS = [
  ["sentence", "sentence right %", 1],
  ["word", "target words right %", 1],
  ["malformed", "malformed items", 1],
  ["missing", "missing items", 1],
  ["chars", "chars / item", 0],
  ["ipaChars", "reading chars / item", 0],
  ["tokens", "output tokens / item", 0],
  ["seconds", "seconds / call", 0],
  ["textBack", "text given back", 0],
  ["unannotated", "target words not annotated", 1],
];
function cell(vals, digits) {
  const v = vals.filter((x) => typeof x === "number" && !Number.isNaN(x));
  if (!v.length) return "–";
  const m = mean(v).toFixed(digits),
    lo = Math.min(...v).toFixed(digits),
    hi = Math.max(...v).toFixed(digits);
  return v.length > 1 && lo !== hi ? `${m} (${lo}–${hi})` : m;
}
function table(groups) {
  const head = `| format | LLM | runs | ${COLS.map((c) => c[1]).join(" | ")} |\n|---|---|---|${COLS.map(() => "---|").join("")}`;
  const rows = groups.map(
    ([format, llm, S]) =>
      `| ${format} | ${llm} | ${S.length} | ${COLS.map(([k, , d]) =>
        cell(
          S.map((s) => s[k]),
          d,
        ),
      ).join(" | ")} |`,
  );
  return `${head}\n${rows.join("\n")}`;
}

function groups(results) {
  const G = [];
  for (const format of FORMATS)
    for (const llm of LLMS) {
      const S = results.filter((r) => r.rec.format === format && r.rec.llm === llm).map((r) => r.stats);
      const model = results.find((r) => r.rec.format === format && r.rec.llm === llm)?.rec.model;
      if (S.length) G.push([format, `${llm} (${model ?? "?"})`, S]);
    }
  const pooled = FORMATS.map((f) => [f, "all", results.filter((r) => r.rec.format === f).map((r) => r.stats)]);
  return { G, pooled: pooled.filter((p) => p[2].length) };
}

export function wrongLines(R) {
  return ITEMS.flatMap((x, i) => {
    const w = R.filter((r) => !r.E[i].right);
    if (!w.length) return [];
    return [`- \`${x.name}\` ${x.text} (${w.length}/${R.length} runs)\n  - gold: \`${GOLD[i][0]}\`\n  - got:  \`${w[0].E[i].got}\``];
  });
}
export function problemCounts(R) {
  const P = {};
  for (const p of R.flatMap((r) => r.E.flatMap((e) => e.problems))) {
    const k = p.replace(/:.*/, "");
    P[k] = (P[k] ?? 0) + 1;
  }
  return (
    Object.entries(P)
      .map(([k, n]) => `${k} (${n})`)
      .join(", ") || "–"
  );
}
// per format and LLM: the items read wrong, with how many runs, and the problems found
function details(results) {
  const lines = [],
    problems = [];
  for (const format of FORMATS)
    for (const llm of LLMS) {
      const R = results.filter((r) => r.rec.format === format && r.rec.llm === llm);
      if (!R.length) continue;
      lines.push(`\n### ${format} / ${llm}\n`, ...wrongLines(R));
      problems.push(`| ${format} | ${llm} | ${problemCounts(R)} |`);
    }
  return { lines, problems };
}

function summary(results, base) {
  const { G, pooled } = groups(results),
    D = details(results);
  const textChars = mean(ITEMS.map((x) => [...x.text].length)).toFixed(1);
  return `# Representation: YomiScript, kana, SSML and sparse kana from the same LLMs

Generated by \`score.mjs\` on ${new Date().toISOString().slice(0, 10)}: the hard set (${ITEMS.length} Japanese sentences, ${textChars} characters on average), one call per format, LLM and run. A cell is the mean over the runs, with the lowest and highest run in brackets.

- **sentence right**: the reading, as the phonemes Kokoro would be given, is one of the gold readings (word spaces, punctuation, long-vowel spelling and allophones ignored, as in eval/browser_tts).
- **target words right**: of the ${Object.values(TARGETS).flat().length} words in eval/tts_readings/targets.tsv, the answer is closer to the gold with the word read right than with it misread.
- **malformed items**: missing, or not in the format (YomiScript the parser rejects; kana with other characters; SSML that is not one \`<speak>\` of \`<phoneme alphabet='ipa'>\` elements, has a spoken word outside them, or a \`ph\` the parser rejects). A malformed item is still scored on what can be read from it.
- **chars / item**: the answer as written. **reading chars / item**: only the pronunciation (YomiScript without \`<t:…>\`; the SSML \`ph\` values; the kana itself).
- **output tokens / item**: as the CLI reports them (Codex reports none); they include any reasoning the model does, not only the answer.
- **text given back**: items whose original text (\`<t:…>\` values; SSML element and plain text; sparse kana without its readings) joins back to the input.
- **sparse**: the input with \`word[reading]\` after some words; pyopenjtalk reads the text as a whole and each annotated run is read as its annotation instead (kana.py --sparse). A target word is right if its annotation gives a right reading or, unannotated, pyopenjtalk's reading of the sentence does (both decided on that combined reading). **target words not annotated**: per run, of the target words. The row "pyopenjtalk alone" is the plain text with no annotation.

## Per format and LLM

${table(G)}
${table([["(plain text)", "pyopenjtalk alone, no LLM", [base.stats]]])
  .split("\n")
  .slice(2)
  .join("\n")}

## Per format, all LLMs

${table(pooled)}

## Problems found (items, all runs)

| format | LLM | problems |
|---|---|---|
${D.problems.join("\n")}

## Sentences read wrong (the first wrong run's reading)
${D.lines.join("\n")}
`;
}

function main() {
  const recs = records();
  const KY = kanaTable(recs);
  const results = recs.map((rec) => {
    const E = evaluate(rec, KY);
    return { rec, E, stats: stats(rec, E) };
  });
  const plain = { format: "sparse", llm: "pyopenjtalk", output: Object.fromEntries(ITEMS.map((x) => [x.name, x.text])) };
  const baseE = evaluate(plain, KY);
  const md = summary(results, { E: baseE, stats: stats(plain, baseE) });
  fs.writeFileSync(path.join(OUT, "summary.md"), md);
  const items = results.map(({ rec, E }) => ({
    format: rec.format,
    llm: rec.llm,
    run: rec.run,
    items: E.map(({ name, got, right, words, unannotated, problems }) => ({ name, got, right, words, unannotated, problems })),
  }));
  fs.writeFileSync(path.join(OUT, "items.json"), JSON.stringify(items, null, 1));
  console.log(md.split("## Problems found")[0]);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main();
