// How much the reading changes when the LLM also writes accent marks, against how much it changes from run to run
// anyway. Only the written YomiScript is compared (no audio): runs/<llm>/<none|every>.<set>.<rep>.json.
//   sentence  the phonemes Kokoro would be given, without word spaces, marks, and the spellings `loose` treats as one
//             reading; share of pairs of runs whose two readings are the same: two runs without marks, two with
//             marks, and one of each. If one of each agrees about as often as two of a kind, the marks do not change
//             the reading beyond the runs' own spread.
//   words     each written word (`reading<t:surface>`) whose surface contains a kanji, grouped by the surface: the
//             readings each prompt gave it, so a change can be told from notation by eye
// usage: node stability.mjs   -> stability.md
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { SETS } from "../../sets.mjs";
import { loose, ps } from "../../reading.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROMPTS = ["none", "every"];
const KANJI = /[一-鿿々]/;

function load(llm, set) {
  // {prompt: [output per rep]}
  const dir = path.join(HERE, "runs", llm),
    R = {};
  for (const k of PROMPTS)
    R[k] = fs
      .readdirSync(dir)
      .filter((f) => f.startsWith(`${k}.${set}.`))
      .sort()
      .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")).output ?? {});
  return R;
}
const sentence = (ys) => {
  const p = ys ? ps(ys) : null;
  return p === null ? null : loose(p);
};
function words(ys) {
  // [surface, reading] for each word carrying <t:…>
  const out = [];
  for (const c of (ys ?? "").split(/\s+/)) {
    const i = c.indexOf("<t:"),
      j = c.indexOf(">", i);
    if (i >= 0 && j > i) out.push([c.slice(i + 3, j), loose(c.slice(0, i).replace(/[ꜛꜜ/]/g, ""))]);
  }
  return out;
}
function agreement(a, b, same) {
  // share of the pairs (one reading from a, one from b; distinct runs when same) that are equal, over the runs that parse
  let n = 0,
    eq = 0;
  a.forEach((x, i) =>
    b.forEach((y, j) => {
      if ((same && j <= i) || x === null || y === null) return;
      n++;
      eq += x === y;
    }),
  );
  return [eq, n];
}
function sentenceRows(R, items) {
  const tot = { none: [0, 0], every: [0, 0], cross: [0, 0] },
    varied = [];
  for (const x of items) {
    const S = Object.fromEntries(PROMPTS.map((k) => [k, R[k].map((o) => sentence(o[x.name]))]));
    const parts = { none: agreement(S.none, S.none, true), every: agreement(S.every, S.every, true), cross: agreement(S.none, S.every, false) };
    for (const [k, [e, n]] of Object.entries(parts)) ((tot[k][0] += e), (tot[k][1] += n));
    const distinct = (k) => new Set(S[k].filter((v) => v !== null)).size;
    varied.push({ name: x.name, none: distinct("none"), every: distinct("every"), both: new Set([...S.none, ...S.every].filter((v) => v !== null)).size });
  }
  return { tot, varied };
}
function addWords(W, name, k, ys) {
  for (const [surf, rd] of words(ys)) {
    if (!KANJI.test(surf)) continue;
    const key = `${name} ${surf}`;
    W[key] ??= { none: {}, every: {} };
    W[key][k][rd] = (W[key][k][rd] ?? 0) + 1;
  }
}
function wordTable(R, items) {
  // surface -> {prompt: {reading: count}}, for the surfaces whose readings are not all the same
  const W = {};
  for (const x of items) for (const k of PROMPTS) for (const o of R[k]) addWords(W, x.name, k, o[x.name]);
  return Object.entries(W).filter(([, v]) => new Set([...Object.keys(v.none), ...Object.keys(v.every)]).size > 1);
}

const pc = ([e, n]) => (n ? `${((100 * e) / n).toFixed(1)}% (${e}/${n})` : "-");
const fmt = (c) =>
  Object.entries(c)
    .sort((a, b) => b[1] - a[1])
    .map(([r, n]) => `${r} ${n}`)
    .join(", ") || "-";
const md = ["# Reading stability with and without accent marks (`node stability.mjs`)", ""];
const summary = [
  "| LLM | set | runs (none / every) | same reading: two runs without marks | two runs with marks | one of each | sentences with any difference: none / every / all runs |",
  "|---|---|---|---|---|---|---|",
];
const detail = [];
for (const llm of ["claude", "codex"])
  for (const set of ["hard", "ja"]) {
    if (!fs.existsSync(path.join(HERE, "runs", llm))) continue;
    const R = load(llm, set);
    if (!R.none.length || !R.every.length) continue;
    const { tot, varied } = sentenceRows(R, SETS[set]);
    const count = (k) => varied.filter((v) => v[k] > 1).length;
    summary.push(
      `| ${llm} | ${set} | ${R.none.length} / ${R.every.length} | ${pc(tot.none)} | ${pc(tot.every)} | ${pc(tot.cross)} | ${count("none")} / ${count("every")} / ${count("both")} of ${varied.length} |`,
    );
    detail.push("", `## ${llm}, ${set}: words read in more than one way`, "", "| sentence, word | without marks | with marks |", "|---|---|---|");
    for (const [key, v] of wordTable(R, SETS[set])) detail.push(`| ${key} | ${fmt(v.none)} | ${fmt(v.every)} |`);
  }
md.push(...summary, ...detail);
fs.writeFileSync(path.join(HERE, "stability.md"), md.join("\n") + "\n");
console.log(summary.join("\n"));
