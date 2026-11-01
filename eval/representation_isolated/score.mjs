// Score the isolated calls exactly as eval/representation scores its one-call answers (its score.mjs: the phonemes
// Kokoro would be given against the hard set's gold; target words by edit distance), and compare the two. The
// batches of a condition, LLM and run are joined into one answer of the 70 items before scoring. Intervals: 95%,
// percentile bootstrap over the 70 sentences (all runs of a sentence go together); a difference is paired by sentence.
// usage: node score.mjs   (PYTHON: a python with pyopenjtalk, default ../prosody_ref/.venv/bin/python)
//   -> results/summary.md, results/items.json
import fs from "fs";
import path from "path";
import { evaluate, GOLD, ITEMS, kanaTable, problemCounts, stats, TARGETS, wrongLines } from "../representation/score.mjs";
import { HERE as REPRESENTATION } from "../representation/formats.mjs";
import { CONDITIONS, HERE, LLMS, random } from "./conditions.mjs";

const OUT = path.join(HERE, "results");
const RESAMPLES = 10000;
const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const runDirs = (dir) => fs.readdirSync(dir).filter((d) => /^r\d+$/.test(d));
const sum = (a) => a.reduce((x, y) => x + y, 0);
const mean = (a) => (a.length ? sum(a) / a.length : NaN);

// one record per condition, LLM and run: the outputs of its batches joined, the seconds per call, the tokens summed
function joined(calls) {
  const [c] = calls;
  const tokens = calls.map((r) => r.outputTokens);
  return {
    format: CONDITIONS[c.condition],
    condition: c.condition,
    setup: "isolated",
    llm: c.llm,
    run: c.run,
    model: [...new Set(calls.map((r) => r.model))].join(","),
    output: Object.assign({}, ...calls.map((r) => r.output ?? {})),
    seconds: mean(calls.map((r) => r.seconds)),
    secondsAll: sum(calls.map((r) => r.seconds)),
    outputTokens: tokens.every((t) => typeof t === "number") ? sum(tokens) : undefined,
    calls: calls.length,
    noJson: calls.filter((r) => !r.output).length,
  };
}
function isolated() {
  const R = [];
  for (const d of runDirs(OUT))
    for (const condition of Object.keys(CONDITIONS))
      for (const llm of LLMS) {
        const dir = path.join(OUT, d, condition, llm);
        if (!fs.existsSync(dir)) continue;
        const calls = fs.readdirSync(dir).map((f) => readJson(path.join(dir, f)));
        if (calls.length) R.push(joined(calls));
      }
  return R;
}
// eval/representation's answers of the same LLMs, the whole set in one call
const ONE_CALL = { yomiscript: "yomiscript", kana: "kana", ssml: "ssml_word" };
function oneCall() {
  const dir = path.join(REPRESENTATION, "results");
  return runDirs(dir).flatMap((d) =>
    Object.keys(ONE_CALL).flatMap((format) =>
      LLMS.map((llm) => path.join(dir, d, `${format}.${llm}.json`))
        .filter((f) => fs.existsSync(f))
        .map((f) => readJson(f))
        .map((r) => ({ ...r, condition: ONE_CALL[r.format], setup: "one call", secondsAll: r.seconds, calls: 1 })),
    ),
  );
}

// per sentence, over the runs given: [right sentences, runs, right target words, target words]
const perSentence = (R) =>
  ITEMS.map((_, i) => [
    R.filter((r) => r.E[i].right).length,
    R.length,
    R.flatMap((r) => r.E[i].words).filter(Boolean).length,
    R.flatMap((r) => r.E[i].words).length,
  ]);
const pct = (S, idx, a, b) => (100 * sum(idx.map((i) => S[i][a]))) / sum(idx.map((i) => S[i][b]));
const both = (S, idx) => [pct(S, idx, 0, 1), pct(S, idx, 2, 3)];
function bootstrap(f) {
  // f(indices) -> [sentence, word]; the point estimate and the 2.5 / 97.5 percentiles of each
  const rnd = random(7),
    n = ITEMS.length,
    all = ITEMS.map((_, i) => i);
  const draws = Array.from({ length: RESAMPLES }, () => f(Array.from({ length: n }, () => Math.floor(rnd() * n))));
  return f(all).map((v, k) => {
    const s = draws.map((d) => d[k]).sort((a, b) => a - b);
    return { v, lo: s[Math.floor(0.025 * RESAMPLES)], hi: s[Math.ceil(0.975 * RESAMPLES) - 1] };
  });
}
const interval = (R) => bootstrap((idx) => both(perSentence(R), idx));
function difference(A, B) {
  const SA = perSentence(A),
    SB = perSentence(B);
  return bootstrap((idx) => both(SA, idx).map((a, k) => a - both(SB, idx)[k]));
}
const ci = ({ v, lo, hi }, sign = false) => {
  const f = (x) => (sign && x > 0 ? "+" : "") + x.toFixed(1);
  return `${f(v)} [${f(lo)}, ${f(hi)}]`;
};

function range(vals, digits) {
  const v = vals.filter((x) => typeof x === "number" && !Number.isNaN(x));
  if (!v.length) return "–";
  const m = mean(v).toFixed(digits),
    lo = Math.min(...v).toFixed(digits),
    hi = Math.max(...v).toFixed(digits);
  return lo !== hi ? `${m} (${lo}–${hi})` : m;
}
const select = (results, setup, condition, llm) => results.filter((r) => r.rec.setup === setup && r.rec.condition === condition && (!llm || r.rec.llm === llm));
const label = (R, llm) => (llm ? `${llm} (${[...new Set(R.map((r) => r.rec.model))].join(",")})` : "both");
function row(R, condition, llm) {
  const [s, w] = interval(R);
  const S = R.map((r) => r.stats);
  const cells = [
    ci(s),
    ci(w),
    range(
      S.map((x) => x.sentence),
      1,
    ),
    range(
      S.map((x) => x.malformed),
      1,
    ),
    range(
      S.map((x) => x.missing),
      1,
    ),
  ];
  cells.push(
    range(
      S.map((x) => x.chars),
      0,
    ),
    range(
      S.map((x) => x.ipaChars),
      0,
    ),
    range(
      S.map((x) => x.tokens),
      0,
    ),
  );
  cells.push(
    range(
      R.map((r) => r.rec.seconds),
      0,
    ),
    range(
      R.map((r) => r.rec.secondsAll),
      0,
    ),
  );
  return `| ${condition} | ${label(R, llm)} | ${R.length} | ${cells.join(" | ")} |`;
}
const HEAD =
  "| condition | LLM | runs | sentence right % [95%] | target words right % [95%] | sentence right %, per run | malformed items / 70 | missing items / 70 | chars / item | reading chars / item | output tokens / item | seconds / call | seconds / 70 items |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|";
function tables(results, setup, conditions) {
  const per = [],
    pooled = [];
  for (const c of conditions) {
    for (const llm of LLMS) {
      const R = select(results, setup, c, llm);
      if (R.length) per.push(row(R, c, llm));
    }
    const R = select(results, setup, c);
    if (R.length) pooled.push(row(R, c, null));
  }
  return `${HEAD}\n${per.join("\n")}\n\nBoth LLMs pooled:\n\n${HEAD}\n${pooled.join("\n")}`;
}

// isolated against one call, per LLM and pooled: [condition, isolated condition, one-call condition]
const PAIRS = [
  ["YomiScript", "yomiscript", "yomiscript"],
  ["kana", "kana", "kana"],
  ["SSML: per bunsetsu, isolated against per word, one call", "ssml_bunsetsu", "ssml_word"],
];
function comparison(results) {
  const lines = [];
  for (const [name, iso, one] of PAIRS)
    for (const llm of [...LLMS, null]) {
      const A = select(results, "isolated", iso, llm),
        B = select(results, "one call", one, llm);
      if (!A.length || !B.length) continue;
      const [ai, aw] = interval(A),
        [bi, bw] = interval(B),
        [ds, dw] = difference(A, B);
      lines.push(`| ${name} | ${llm ?? "both"} | ${ci(bi)} | ${ci(ai)} | ${ci(ds, true)} | ${ci(bw)} | ${ci(aw)} | ${ci(dw, true)} |`);
    }
  return `| condition | LLM | sentence %, one call | sentence %, isolated | difference | target words %, one call | target words %, isolated | difference |\n|---|---|---|---|---|---|---|---|\n${lines.join("\n")}`;
}

function details(results) {
  const lines = [],
    problems = [];
  for (const [setup, conditions] of [
    ["isolated", Object.keys(CONDITIONS)],
    ["one call", ["ssml_word"]],
  ])
    for (const c of conditions)
      for (const llm of LLMS) {
        const R = select(results, setup, c, llm);
        if (!R.length) continue;
        lines.push(`\n### ${c} / ${llm} (${setup})\n`, ...wrongLines(R));
        problems.push(`| ${c} (${setup}) | ${llm} | ${problemCounts(R)} |`);
      }
  return { lines, problems };
}

function summary(results) {
  const D = details(results);
  const calls = results.filter((r) => r.rec.setup === "isolated");
  const noJson = sum(calls.map((r) => r.rec.noJson));
  return `# Representation, isolated calls: YomiScript, kana and SSML per bunsetsu, about ten items per call

Generated by \`score.mjs\` on ${new Date().toISOString().slice(0, 10)}: the hard set (${ITEMS.length} sentences), in ${calls[0]?.rec.calls ?? "?"} calls of about ten items per condition, LLM and run, no two items of a call sharing a word of words.tsv (results/batches.json). Scored with eval/representation/score.mjs (the same gold, \`loose\` comparison and ${Object.values(TARGETS).flat().length} target words). Brackets after a percentage: 95% interval, bootstrap over the ${GOLD.length} sentences (${RESAMPLES} resamples, all runs of a sentence together); other cells: the mean over the runs, lowest and highest run in brackets. Calls with no JSON after the retry: ${noJson}.

- **seconds / call**: mean per call (three calls at a time per LLM); **seconds / 70 items**: the calls of a run added up.
- **output tokens / item**: as Claude's CLI reports them, reasoning included; Codex reports none.

## Isolated calls

${tables(results, "isolated", Object.keys(CONDITIONS))}

## One call (eval/representation, the same scorer), for comparison

${tables(results, "one call", Object.values(ONE_CALL))}

## Isolated against one call

The difference is isolated minus one call, in percentage points, paired by sentence.

${comparison(results)}

## Problems found (items, all runs)

| condition | LLM | problems |
|---|---|---|
${D.problems.join("\n")}

## Sentences read wrong (the first wrong run's reading)
${D.lines.join("\n")}
`;
}

const recs = [...isolated(), ...oneCall()];
const KY = kanaTable(recs);
const results = recs.map((rec) => {
  const E = evaluate(rec, KY);
  return { rec, E, stats: stats(rec, E) };
});
const md = summary(results);
fs.writeFileSync(path.join(OUT, "summary.md"), md);
const items = results
  .filter((r) => r.rec.setup === "isolated")
  .map(({ rec, E }) => ({
    condition: rec.condition,
    llm: rec.llm,
    run: rec.run,
    items: E.map(({ name, got, right, words, problems }) => ({ name, got, right, words, problems })),
  }));
fs.writeFileSync(path.join(OUT, "items.json"), JSON.stringify(items, null, 1));
console.log(md.split("## Problems found")[0]);
