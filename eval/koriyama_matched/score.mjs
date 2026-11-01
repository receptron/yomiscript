// Score the matched-prompt ablation (README.md) with eval/koriyama_g2p's metrics: merged kana CER (Koriyama's
// normalisation, ヲ=オ ヂ=ジ ヅ=ズ), Koriyama's scorer as is, sentences exact, the share of YomiScript answers the
// Katarite takes (plan() of the Kokoro package), errors by cause; paired bootstrap differences over the same 2,000
// resamples of the 300 sentences as eval/koriyama_g2p's subset table; the same for the targeted set (conditions.mjs).
// usage: node score.mjs -> results/summary.md, results/scores.json (aggregates, committed); results/items.json (gitignored)
import fs from "fs";
import path from "path";
import { ps } from "../browser_tts/reading.mjs";
import { HERE as G2P, SUBSET } from "../koriyama_g2p/items.mjs";
import { norm, ysKana } from "../koriyama_g2p/kana.mjs";
import { CAUSES, causes, cer, interval, kanaRow, metric, resampler, wellFormed } from "../koriyama_g2p/metrics.mjs";
import { CONDITIONS, HERE, LLMS, reached, SETS } from "./conditions.mjs";

const OUT = path.join(HERE, "results");
const B = 2000;
const NAME = { claude: "Claude", codex: "Codex" };
// the set being scored: its name, sentences, indices and resamples (use())
let SET = "",
  ITEMS = [],
  ALL = [],
  R = [];
function use(set) {
  SET = set;
  ITEMS = SETS[set]().flat();
  ALL = ITEMS.map((_, i) => i);
  R = resampler(7, B)(ITEMS.length); // for the subset, the resamples of eval/koriyama_g2p's subset table
}

// the call records of a condition and LLM that hold sentences of the set: run 1 of the frozen prompts is
// eval/koriyama_g2p's (all 3,000 sentences, in its own batches)
function records(cond, llm) {
  const c = CONDITIONS[cond],
    dir = c.g2p ? path.join(G2P, "results", "raw", c.g2p, llm) : path.join(OUT, "raw", SET, cond, llm);
  const inSet = new Set(ITEMS.map((x) => x.name));
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")))
    .filter((r) => r.names.some((n) => inSet.has(n)));
}
// one answer as kana: YomiScript through the parser (word by word when it rejects the utterance), and whether the
// Katarite takes the utterance as written
function reading(format, out) {
  if (format === "kana") return { kana: out, parsed: true };
  return { ...ysKana(out), katarite: ps(out.trim()) !== null };
}
// metric 2, strict: an utterance the Katarite rejects is wholly deleted (its whole gold as deletions), what a user of
// the Katarite would get; otherwise the merged errors (kana answers and missing ones as metric 1)
function strictRow(row, katarite) {
  row.katarite = katarite;
  row.e.push(katarite === false ? row.n[1] : row.e[1]);
  row.n.push(row.n[1]);
  return row;
}
function system(cond, llm) {
  const recs = records(cond, llm),
    format = CONDITIONS[cond].format,
    A = new Map();
  for (const r of recs) for (const n of r.names) if (typeof r.output?.[n] === "string") A.set(n, reading(format, r.output[n]));
  const rows = ITEMS.map((x) => strictRow(kanaRow(x, A.get(x.name)), A.get(x.name)?.katarite));
  const asked = new Set(recs.flatMap((r) => r.names));
  const complete = ITEMS.every((x) => asked.has(x.name));
  return { key: `${cond}.${llm}`, cond, llm, format, label: `${CONDITIONS[cond].label}, ${NAME[llm]}`, recs, rows, complete };
}

function stats(s) {
  const sec = s.recs.map((r) => r.seconds),
    rows = s.rows;
  return {
    key: s.key,
    label: s.label,
    model: [...new Set(s.recs.map((r) => r.model).filter(Boolean))].join(","),
    merged: metric(rows, 1, R),
    asIs: metric(rows, 0, R),
    deleted: metric(rows, 2, R),
    mergedParsed: wellFormed(rows),
    exact: (100 * rows.filter((r) => r.e[1] === 0).length) / rows.length,
    missing: rows.filter((r) => r.missing).length,
    unparsed: rows.filter((r) => r.unparsed).length,
    katarite: s.format === "kana" ? null : rows.filter((r) => r.katarite).length,
    causes: causes(rows),
    errors: rows.reduce((a, r) => a + r.e[1], 0),
    calls: s.recs.length,
    retries: s.recs.filter((r) => r.tries.length > 1).length,
    secondsPerCall: sec.length ? sec.reduce((a, b) => a + b, 0) / sec.length : NaN,
  };
}
// a minus b, kana CER of metric m (1 merged, 2 strict), paired over the resamples
function diff(a, b, m) {
  const f = (idx) => cer(a.rows, m, idx) - cer(b.rows, m, idx);
  return { a: a.key, b: b.key, metric: m === 1 ? "merged" : "strict", diff: f(ALL), ci: interval(R, f) };
}
const mean2 = (x, y, idx) => (cer(x.rows, 1, idx) + cer(y.rows, 1, idx)) / 2;
// the share of the frozen YomiScript-kana gap a prompt closes, both frozen prompts averaged over their two runs
function closed(S, cond, llm) {
  const g = (c) => S.find((s) => s.key === `${c}.${llm}`);
  const [y1, y2, k1, k2, m] = ["yomiscript.frozen.r1", "yomiscript.frozen.r2", "kana.frozen.r1", "kana.frozen.r2", cond].map(g);
  if (![y1, y2, k1, k2, m].every(Boolean)) return null; // not all run yet
  const f = (idx) => {
    const y = mean2(y1, y2, idx);
    return (100 * (y - cer(m.rows, 1, idx))) / (y - mean2(k1, k2, idx));
  };
  return { cond, llm, share: f(ALL), ci: interval(R, f) };
}

const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : "-");
const ci = (m) => `${f2(m.cer)} [${f2(m.ci[0])}, ${f2(m.ci[1])}]`;
const d2 = (d) => `${d.diff >= 0 ? "+" : ""}${f2(d.diff)} [${f2(d.ci[0])}, ${f2(d.ci[1])}]`;
function mainTable(St, D) {
  const L = [
    "| system | model | kana CER, merged | vs YomiScript frozen r1 | vs kana frozen r1 | strict: rejected = deleted | strict vs YomiScript frozen r1 | strict vs kana frozen r1 | Koriyama's scorer as is | merged, parsed answers only | sentences exact % | Katarite accepts | not parsed | calls (retries) | s / call |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
  ];
  for (const s of St) {
    const llm = s.key.split(".").pop();
    const vs = (b, m = "merged") => D.find((d) => d.a === s.key && d.b === `${b}.${llm}` && d.metric === m);
    const cell = (d) => (d ? d2(d) : "-");
    const acc = s.katarite === null ? "-" : `${s.katarite}/${ITEMS.length}`;
    L.push(
      `| ${s.label} | ${s.model} | ${ci(s.merged)} | ${cell(vs("yomiscript.frozen.r1"))} | ${cell(vs("kana.frozen.r1"))} | ${ci(s.deleted)} | ${cell(vs("yomiscript.frozen.r1", "strict"))} | ${cell(vs("kana.frozen.r1", "strict"))} | ${ci(s.asIs)} | ${f2(s.mergedParsed)} | ${s.exact.toFixed(1)} | ${acc} | ${s.unparsed} | ${s.calls} (${s.retries}) | ${s.secondsPerCall.toFixed(0)} |`,
    );
  }
  return L;
}
function causeTable(St) {
  const keys = [...CAUSES.map(([k]) => k), "other"];
  const L = [`| system | errors | ${keys.join(" | ")} |`, `|---|---|${"---|".repeat(keys.length)}`];
  for (const s of St) L.push(`| ${s.label} | ${s.errors} | ${keys.map((k) => s.causes[k]).join(" | ")} |`);
  return L;
}
const INTRO = {
  subset: `The first ${SUBSET} sentences of eval/koriyama_g2p's order (its stratified subset).`,
  all: "All 3,000 sentences, in eval/koriyama_g2p's batches (the matched prompt's first 6 batches are the subset's run).",
  targeted:
    "Every other sentence of the 3,000 with いう / 言う read ユウ in the gold or with 先生, in the same order (the frozen run 1 answered them in eval/koriyama_g2p's batches, the rest here in batches of these sentences only).",
};
function summary(St, D, C) {
  const L = [`## ${SET}: ${ITEMS.length} sentences`, "", INTRO[SET], ""];
  L.push(...mainTable(St, D), "", "Run to run (run 2 minus run 1, the same prompt), merged kana CER:", "");
  for (const d of D.filter((x) => x.metric === "merged" && x.a.includes(".r2.") && x.b === x.a.replace(".r2.", ".r1."))) L.push(`- ${d.a}: ${d2(d)}`);
  L.push("", "Share of the gap closed: (YomiScript frozen - condition) / (YomiScript frozen - kana frozen), %, both frozen");
  L.push("prompts as the mean of their two runs; the interval is the bootstrap of the ratio (wide, the gap is small):", "");
  for (const c of C) L.push(`- ${CONDITIONS[c.cond].label}, ${NAME[c.llm]}: ${f2(c.share)} [${f2(c.ci[0])}, ${f2(c.ci[1])}]`);
  const has = (re, k) => ITEMS.filter((x) => re.test(x.text) && norm(x.gold, true).includes(k)).length;
  const reach = `いう / 言う read ユウ in the gold: ${has(/[い言云]う/, "ユウ")}; 先生 read センセー: ${has(/先生/, "センセ")}`;
  L.push("", `Sentences of the set that edits (a) and (b) can reach: ${reach}.`);
  L.push("", "Merged kana errors by cause (characters; the first cause that applies to the sentence):", "", ...causeTable(St), "");
  return L.join("\n");
}

function score(set) {
  use(set);
  const S = LLMS.flatMap((llm) => Object.keys(CONDITIONS).map((c) => system(c, llm))).filter((s) => s.complete);
  const D = [];
  for (const a of S) for (const b of S) if (a !== b && a.llm === b.llm && b.cond.endsWith(".r1")) D.push(diff(a, b, 1), diff(a, b, 2));
  const runs = ["yomiscript.frozen.r2", "yomiscript.matched", "yomiscript.mirror"];
  const C = LLMS.flatMap((llm) => runs.map((c) => closed(S, c, llm))).filter(Boolean);
  const St = S.map(stats);
  const byName = new Map(ITEMS.map((x) => [x.name, x]));
  const items = S.flatMap((s) => s.rows.filter((r) => r.e[1] > 0).map((r) => ({ set, system: s.key, ...r, text: byName.get(r.name).text })));
  return { md: summary(St, D, C), json: { sentences: ITEMS.length, resamples: B, systems: St, differences: D, gapClosed: C }, items };
}

// all 3,000 sentences, run 1 of eval/koriyama_g2p: the share of the frozen YomiScript-kana gap (merged error
// characters) that lies in the sentences edits (a) and (b) can reach, the most the edits could close there
function reachShare() {
  use("all");
  const sum = (rows, keep) => rows.reduce((a, r, i) => a + (keep(ITEMS[i]) ? r.e[1] : 0), 0);
  return LLMS.map((llm) => {
    const y = system("yomiscript.frozen.r1", llm).rows,
      k = system("kana.frozen.r1", llm).rows;
    const gap = sum(y, () => true) - sum(k, () => true),
      inReach = sum(y, reached) - sum(k, reached);
    return { llm, sentences: ITEMS.filter(reached).length, gap, inReach, share: (100 * inReach) / gap };
  });
}

const R0 = Object.keys(SETS).map(score);
const SHARE = reachShare();
const shareLines = [
  "## all 3,000 sentences (eval/koriyama_g2p run 1): how much of the gap the edits can reach",
  "",
  "Frozen YomiScript minus frozen kana, merged kana error characters, over all sentences and over the sentences edits (a)",
  "and (b) can reach (the subset's and the targeted set's):",
  "",
  ...SHARE.map((x) => `- ${NAME[x.llm]}: gap ${x.gap} characters, ${x.inReach} of them in the ${x.sentences} reached sentences (${x.share.toFixed(0)}%)`),
  "",
];
const head = [
  "# Koriyama 2026 benchmark: matched-prompt ablation (post hoc)",
  "",
  `Generated by score.mjs on ${new Date().toISOString().slice(0, 10)}. Kana CER in %, 95% bootstrap interval over sentences (${B}`,
  "resamples, the same for every system of a set, so differences are paired). Run 1 of the frozen prompts is",
  "eval/koriyama_g2p's run; everything else was run here. Only systems with an answer file for every sentence are listed.",
  "",
];
fs.writeFileSync(path.join(OUT, "summary.md"), [...head, ...R0.map((r) => r.md), ...shareLines].join("\n"));
fs.writeFileSync(
  path.join(OUT, "scores.json"),
  JSON.stringify({ ...Object.fromEntries(Object.keys(SETS).map((k, i) => [k, R0[i].json])), reachShare: SHARE }, null, 1),
);
fs.writeFileSync(
  path.join(OUT, "items.json"),
  JSON.stringify(
    R0.flatMap((r) => r.items),
    null,
    1,
  ),
);
console.log(fs.readFileSync(path.join(OUT, "summary.md"), "utf8"));
