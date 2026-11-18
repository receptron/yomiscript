// The sentences of experiment 4, without the LLM's phrases: JKYB's (eval/jkyb, an LLM's YomiScript), JSUT's and Wikipedia's, each with the current dictionary's falls and phrase starts
// (the weak labels), and the short sentences checked by ear.
// usage: node rows_all.mjs   -> work/rows_all.json
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parse } from "@yomiscript/core";
import { accentMarks, phraseUnits, pitchRows } from "@yomiscript/ja-accent";
import { nodeAnalyzer } from "@yomiscript/ja-accent/node";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => JSON.parse(fs.readFileSync(path.join(HERE, f), "utf8"));
const CACHE = path.join(process.env.HOME, ".cache/yomiscript/ja-dict");
const A = await nodeAnalyzer({ dir: path.join(CACHE, fs.readdirSync(CACHE)[0]) });
const CHECKS = [
  ["ja /soː<t:そう> da<t:だ。> ↘/", "soꜜː da"],
  ["ja /bokɯ<t:ぼく> mo<t:も> soː<t:そう> da<t:だ。> ↘/", "soꜜː da"],
  ["ja /neteɾɯ<t:寝てる。> ↘/", "neꜛteɾɯ"],
  ["ja /kiteɾɯ<t:着てる。> ↘/", "kiꜛteɾɯ"],
  ["ja /deteɾɯ<t:出てる。> ↘/", "deꜜteɾɯ"],
  ["ja /miteɾɯ<t:見てる。> ↘/", "miꜜteɾɯ"],
  ["ja /jondeɾɯ<t:呼んでる。> ↘/", "joꜛndeɾɯ"],
  ["ja /jondeɾɯ<t:読んでる。> ↘/", "joꜜndeɾɯ"],
  ["ja /motteɾɯ<t:持ってる。> ↘/", "moꜜtteɾɯ"],
  ["ja /motteɾɯ<t:盛ってる。> ↘/", "moꜛtteɾɯ"],
  ["ja /kaneteɾɯ<t:兼ねてる。> ↘/", "kaꜜneteɾɯ"],
  ["ja /tabete<t:食べて> neɾɯ<t:寝る。> ↘/", "taꜜbete"],
  ["ja /jamete<t:やめて> neɾɯ<t:寝る。> ↘/", "jaꜛmete"],
  ["ja /pikapika<t:ぴかぴか> sɯɾɯ<t:する。> ↘/", "piꜜkapika"],
  ["ja /toːkeɴ<t:当軒> wa<t:は。> ↘/", "toꜜːkeɴ"],
  ["ja /mitai<t:見たい> mon<t:もん> da<t:だ> naː<t:なあ。> ↘/", "miꜛtaꜜi"],
];
function row(name, ys, extra = {}) {
  const bare = ys.replaceAll(" | ", " ").replaceAll(/<f0:[^>]*>/g, ""),
    U = parse(bare.replaceAll(/[ꜛꜜ]/g, "")),
    sec = U.sections[0];
  if (U.sections.length !== 1) return null;
  const { morae } = pitchRows(
      sec,
      U.texts,
      phraseUnits(sec).map(() => null),
    ),
    units = parse(accentMarks(bare, A)).sections.flatMap((s) => s.toks.filter((t) => t.kind === "unit")),
    falls = [],
    starts = [];
  let ph = null;
  units.forEach((t, i) => {
    if (t.fall) falls.push(i);
    if (t.ph !== ph) starts.push(i);
    ph = t.ph;
  });
  if (units.length !== morae.length) return null;
  return {
    name,
    morae: morae.map((m) => ({ ipa: m.ipa, span: m.span, word: m.word, bound: m.bound === "#" ? "" : m.bound })),
    dict: { falls, starts },
    ...extra,
  };
}
const rows = read("../qwen_prosody/work/pitch_rows.json"),
  byName = new Map(rows.map((r) => [r.name, r])),
  phrased = read("../qwen_prosody/work/phrased.json"),
  wiki = read("../qwen_prosody/work/abs_wiki.json"),
  out = [];
for (const [name, r] of byName) {
  const ys = phrased[name] ?? wiki[name]?.ys;
  if (!ys) continue;
  const x = row(name, ys, { test: r.test, target: r.target });
  if (x && x.morae.length === r.morae.length) out.push(x);
}
const counted = out.length;
for (const l of fs.readFileSync(path.join(HERE, "../jkyb/work/ys.jsonl"), "utf8").trim().split("\n")) {
  const j = JSON.parse(l);
  const x = row(`JKYB_${j.key}`, j.ys, { test: false, target: null });
  if (x) out.push(x);
}
const checks = CHECKS.map(([ys, want], i) => row(`CHECK_${i}`, ys, { test: false, target: null, want })).filter(Boolean);
fs.writeFileSync(path.join(HERE, "work/rows_all.json"), JSON.stringify({ rows: out, checks }));
console.log(counted, "JSUT and Wikipedia,", out.length - counted, "JKYB,", checks.length, "checks");
