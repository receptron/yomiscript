// Score every answer against the benchmark's gold kana (README.md, "Scoring"):
//   kana CER (Koriyama)   his normalisation (ー expanded, punctuation removed), errors / gold characters
//   kana CER (merged)     the same with ヲ オ, ヂ ジ, ヅ ズ merged (the gold writes を as オ; our kana prompt asks ヲ)
//   phoneme CER           the coarse phoneme spelling of eval/representation (reading.mjs loose), the gold through
//                         the same kana.py as the kana answers
// with 95% bootstrap intervals over sentences (the same resamples for every system, so differences are paired).
// usage: node score.mjs   (the subset, and all sentences once an LLM has answered them all; PYTHON: a python with pyopenjtalk, default ../prosody_ref/.venv/bin/python)
//   -> results/summary.md, results/scores.json (aggregates, committed); results/items.json (per sentence, gitignored)
import fs from "fs";
import path from "path";
import { lev, loose, ps } from "../browser_tts/reading.mjs";
import { HERE as REPRESENTATION, LLMS } from "../representation/formats.mjs";
import { BATCH, FORMATS, ordered, SUBSET, HERE } from "./items.mjs";
import { norm, python, runPython, ysKana } from "./kana.mjs";
import { CAUSES, causes, cer, interval as intervalOver, kanaRow, metric as metricOver, resampler, wellFormed } from "./metrics.mjs";

const OUT = path.join(HERE, "results"),
  RAW = path.join(OUT, "raw");
const ORDER = ordered();
// the sentences being scored (the subset, then all): set by use()
let ITEMS = [],
  RESAMPLES = [],
  ALL = [];
const NAME = { claude: "Claude", codex: "Codex", agy: "Antigravity" };

// the answers of one format and LLM: name -> string, and the call records
function answers(format, llm) {
  const dir = path.join(RAW, format, llm);
  const recs = fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .filter((f) => f.endsWith(".json"))
        .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")))
    : [];
  const A = new Map();
  for (const r of recs) for (const n of r.names) if (typeof r.output?.[n] === "string") A.set(n, r.output[n]);
  const inSet = new Set(ITEMS.map((x) => x.name));
  return { A, recs: recs.filter((r) => r.names.some((n) => inSet.has(n))) };
}
// pyopenjtalk's reading of every sentence, kept on disk
function openjtalk() {
  const file = path.join(RAW, "openjtalk.json");
  const have = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  const todo = ITEMS.filter((x) => !(x.name in have));
  if (todo.length) {
    python(["--openjtalk"], JSON.stringify(todo.map((x) => x.text))).forEach((k, i) => (have[todo[i].name] = k));
    fs.mkdirSync(RAW, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(have, null, 1));
  }
  return new Map(Object.entries(have));
}
// katakana -> loose phonemes, through eval/representation/kana.py (one Python call for all)
function phonemesOfKana(list) {
  const ys = runPython(path.join(REPRESENTATION, "kana.py"), [], JSON.stringify(list));
  return new Map(list.map((k, i) => [k, lp(ys[i])]));
}
const lp = (ys) => {
  const p = ys && !ys.startsWith("error") ? ps(ys) : null;
  return p === null ? "" : loose(p);
};
const kataOnly = (s) => (s ?? "").replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60)).replace(/[^ァ-ヺー、。？！]/g, "");

// the systems: [key, label, format, name -> { kana, ys?, parsed }]
function systems() {
  const S = [];
  for (const format of FORMATS)
    for (const llm of LLMS) {
      const { A, recs } = answers(format, llm);
      if (recs.length < ITEMS.length / BATCH) continue; // only systems with every batch of the set
      const read = new Map([...A].map(([n, out]) => [n, format === "kana" ? { kana: out, parsed: true } : { ...ysKana(out), ys: out.trim() }]));
      S.push({ key: `${format}.${llm}`, label: `${format === "kana" ? "kana" : "YomiScript"}, ${NAME[llm]}`, format, llm, read, recs });
    }
  const O = openjtalk();
  S.push({
    key: "openjtalk",
    label: "pyopenjtalk (plain text)",
    format: "kana",
    read: new Map([...O].map(([n, k]) => [n, { kana: k, parsed: true }])),
    recs: [],
  });
  return S;
}

// per system and sentence: [errors, gold length] for each metric, and what went wrong
function evaluate(S) {
  const kanaList = new Set(ITEMS.map((x) => x.gold));
  // kana answers, and YomiScript the parser rejects (read word by word as kana, ysKana)
  for (const s of S) for (const r of s.read.values()) if (s.format === "kana" || !r.parsed) kanaList.add(kataOnly(r.kana));
  const PH = phonemesOfKana([...kanaList]);
  return S.map((s) => {
    const rows = ITEMS.map((x) => {
      const r = s.read.get(x.name),
        row = kanaRow(x, r);
      const gp = PH.get(x.gold); // a gold kana.py cannot convert: not in the phoneme CER
      let ph = "";
      if (r && gp) ph = s.format === "kana" || !r.parsed ? PH.get(kataOnly(r.kana)) : lp(r.ys);
      row.e.push(lev(gp, ph));
      row.n.push([...gp].length);
      return row;
    });
    return { ...s, rows };
  });
}

const B = 2000,
  draw = resampler(7, B);
function use(n) {
  ITEMS = ORDER.slice(0, n);
  RESAMPLES = draw(n);
  ALL = ITEMS.map((_, i) => i);
}
const interval = (f) => intervalOver(RESAMPLES, f);
const metric = (rows, m) => metricOver(rows, m, RESAMPLES);

function stats(s) {
  const rows = s.rows,
    present = rows.filter((r) => !r.missing);
  const sec = s.recs.map((r) => r.seconds);
  return {
    key: s.key,
    label: s.label,
    model: [...new Set(s.recs.map((r) => r.model).filter(Boolean))].join(","),
    strict: metric(rows, 0),
    merged: metric(rows, 1),
    phoneme: metric(rows, 2),
    mergedParsed: wellFormed(rows),
    exact: (100 * rows.filter((r) => r.e[1] === 0).length) / rows.length,
    missing: rows.length - present.length,
    unparsed: rows.filter((r) => r.unparsed).length,
    foreign: rows.reduce((a, r) => a + r.foreign, 0),
    calls: s.recs.length,
    retries: s.recs.filter((r) => r.tries.length > 1).length,
    noJson: s.recs.filter((r) => !r.output).length,
    secondsPerCall: sec.length ? sec.reduce((a, b) => a + b, 0) / sec.length : NaN,
    secondsTotal: sec.reduce((a, b) => a + b, 0),
  };
}
// YomiScript minus kana for each LLM, merged kana CER, paired over the same resamples
function differences(E) {
  const D = [];
  for (const llm of LLMS) {
    const y = E.find((s) => s.key === `yomiscript.${llm}`),
      k = E.find((s) => s.key === `kana.${llm}`);
    if (!y || !k) continue;
    const f = (idx) => cer(y.rows, 1, idx) - cer(k.rows, 1, idx);
    D.push({ llm, diff: f(ALL), ci: interval(f) });
  }
  return D;
}

const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : "-");
const calls = (s) => (s.calls ? `${s.calls} (${s.retries}, ${s.noJson})` : "-");
const ci = (m) => `${f2(m.cer)} [${f2(m.ci[0])}, ${f2(m.ci[1])}]`;
function errorTable(E) {
  const lines = [`| system | sentences with an error | errors | ${[...CAUSES.map(([k]) => k), "other"].join(" | ")} | largest (sentence id, errors) |`];
  lines.push(`|---|---|---|${"---|".repeat(CAUSES.length + 2)}`);
  for (const s of E) {
    const bad = s.rows.filter((r) => r.e[1] > 0 && !r.missing).sort((a, b) => b.e[1] - a.e[1]);
    const C = causes(s.rows),
      all = bad.reduce((a, r) => a + r.e[1], 0);
    const top = bad.slice(0, 3).map((r) => `${r.name} (${r.e[1]})`);
    lines.push(`| ${s.label} | ${bad.length} | ${all} | ${Object.values(C).join(" | ")} | ${top.join(", ") || "-"} |`);
  }
  return lines;
}
function summary(St, D, E) {
  const what = { [SUBSET]: "Stratified subset", [ORDER.length]: "All sentences" }[ITEMS.length] ?? "The sentences every LLM answered";
  const L = [`## ${what}: the first ${ITEMS.length} sentences of the order`, ""];
  L.push(
    "| system | model | kana CER, Koriyama's scorer | kana CER, ヲ=オ ヂ=ジ ヅ=ズ | merged, well-formed answers only | phoneme CER (loose) | sentences exact % | missing | not parsed | moras with no kana | calls (retries, no JSON) | s / call |",
  );
  L.push("|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const s of St)
    L.push(
      `| ${s.label} | ${s.model || "-"} | ${ci(s.strict)} | ${ci(s.merged)} | ${f2(s.mergedParsed)} | ${ci(s.phoneme)} | ${s.exact.toFixed(1)} | ${s.missing} | ${s.unparsed} | ${s.foreign} | ${calls(s)} | ${s.calls ? s.secondsPerCall.toFixed(0) : "-"} |`,
    );
  L.push("", "YomiScript minus kana, kana CER (merged), paired bootstrap:", "");
  for (const d of D) L.push(`- ${NAME[d.llm]}: ${f2(d.diff)} [${f2(d.ci[0])}, ${f2(d.ci[1])}]`);
  L.push("", "Merged kana errors by cause (characters; sentence ids of items.mjs, the texts are in results/items.json, gitignored):", "", ...errorTable(E));
  const gold = ITEMS.reduce((a, x) => a + [...norm(x.gold, true)].length, 0);
  const lost = ITEMS.filter((x) => !E[0].rows.find((r) => r.name === x.name).n[2]).length;
  L.push("", `Phoneme CER: ${lost} sentences left out, whose gold kana tools/yomiscript/kana2ipa.py cannot convert (rare loanword moras).`);
  L.push("", `Gold: ${gold} kana characters after normalisation (${(gold / ITEMS.length).toFixed(1)} per sentence).`, "");
  return L.join("\n");
}

const head = [
  "# Koriyama 2026 benchmark (JVS-nonpara-kana)",
  "",
  `Generated by score.mjs on ${new Date().toISOString().slice(0, 10)}. CER in %, 95% bootstrap interval over sentences (${B} resamples).`,
  "Only the systems with an answer file for every batch of a set are listed under it.",
  "",
];
const parts = [],
  scores = {},
  items = [];
// the batches answered (with or without JSON) in a row from the first, for one format and LLM
function batchesDone(format, llm) {
  const dir = path.join(RAW, format, llm);
  let b = 0;
  while (fs.existsSync(path.join(dir, `b${String(b).padStart(2, "0")}.json`))) b++;
  return b;
}
// the subset, the part every LLM has answered in both formats (when it is neither), and all sentences
const common = Math.min(...FORMATS.flatMap((f) => LLMS.map((l) => batchesDone(f, l)))) * BATCH;
for (const n of [...new Set([SUBSET, common, ORDER.length])].filter((n) => n >= SUBSET).sort((a, b) => a - b)) {
  use(n);
  const E = evaluate(systems());
  if (E.length < 2) continue; // pyopenjtalk alone: no LLM has the whole set yet
  const St = E.map(stats),
    D = differences(E);
  parts.push(summary(St, D, E));
  scores[n] = { resamples: B, systems: St, differences: D };
  const byName = new Map(ITEMS.map((x) => [x.name, x]));
  items.length = 0;
  items.push(...E.flatMap((s) => s.rows.filter((r) => r.e[1] > 0).map((r) => ({ system: s.key, ...r, text: byName.get(r.name).text }))));
}
fs.writeFileSync(path.join(OUT, "summary.md"), [...head, ...parts].join("\n"));
fs.writeFileSync(path.join(OUT, "scores.json"), JSON.stringify(scores, null, 1));
fs.writeFileSync(path.join(OUT, "items.json"), JSON.stringify(items, null, 1)); // the largest set scored
console.log(fs.readFileSync(path.join(OUT, "summary.md"), "utf8"));
