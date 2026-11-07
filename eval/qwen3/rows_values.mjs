// Every teacher of qwen-3 in one form, pitch values per mora (<f0:…>): the linear model fitted to Qwen (the published pitch model's `contour`) turns accents into values. For each sentence: `dict` (the dictionary's accents), `gold` (JSUT's
// annotation, on the LLM's phrases), with `qwen` (measured) and `q2` (the published pitch model, to compare with) where there are; and every dictionary word on its own (work/word_values.jsonl).
// usage: node rows_values.mjs   -> work/rows_values.json, work/word_values.jsonl
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { applyEdits, jaContour, parse } from "@yomiscript/core";
import { accentMarks, marksFor, phraseUnits, pitchYomite } from "@yomiscript/ja-accent";
import { nodeAnalyzer, nodePitchModel } from "@yomiscript/ja-accent/node";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => JSON.parse(fs.readFileSync(path.join(HERE, f), "utf8"));
const CACHE = path.join(process.env.HOME, ".cache/yomiscript");
const A = await nodeAnalyzer({ dir: path.join(CACHE, "ja-dict", fs.readdirSync(path.join(CACHE, "ja-dict"))[0]) });
const M = await nodePitchModel({ dir: path.join(CACHE, "ja-pitch/qwen-2") });
const q2 = pitchYomite(A, M);

const round = (v) => v.map((x) => +x.toFixed(2));
/** the values the linear model gives a marked YomiScript, per unit; null if it has more than one section */
function valuesOf(marked) {
  const secs = parse(marked).sections;
  if (secs.length !== 1) return null;
  const C = jaContour(secs[0], M.contour);
  return secs[0].toks.filter((t) => t.kind === "unit").map((t) => round(C.get(t) ?? [0, 0, 0]));
}
/** the falls of JSUT's annotation written on a YomiScript with its phrases: a phrase with more than one fall keeps its first */
function withFalls(bare, falls) {
  const sec = parse(bare).sections[0],
    edits = [];
  let at = 0;
  for (const P of phraseUnits(sec)) {
    const inside = falls.filter((f) => f >= at && f < at + P.length),
      k = inside.length ? inside[0] - at + 1 : 0;
    if (P.length > 1 || k) edits.push(...marksFor(P, P.length === 1 ? 1 : k));
    at += P.length;
  }
  return applyEdits(bare, edits);
}
const goldFalls = (text, n) => {
  let i = 0;
  const falls = [];
  for (const c of text.replace(/^\^|[$?]$/g, "").match(/[ァ-ヴー][ァィゥェォャュョヮ]?|[[\]#_]/g) ?? []) {
    if (c === "]") falls.push(i - 1);
    else if (!"[#_".includes(c)) i++;
  }
  return i === n ? falls : null;
};
const qvalues = (ys) =>
  parse(q2(ys))
    .sections[0].toks.filter((t) => t.kind === "unit")
    .map((t) => (t.f0 ? round(t.f0) : null));

const gold = new Map(read("../jsut_accent/data/items.json").map((x) => [x.name, x.gold])),
  phrased = read("../qwen_prosody/work/phrased.json"),
  wiki = read("../qwen_prosody/work/abs_wiki.json"),
  pitch = read("../qwen_prosody/work/pitch_rows.json"),
  sentences = {};
for (const r of pitch) {
  const ys = phrased[r.name] ?? wiki[r.name]?.ys;
  if (!ys) continue;
  const bare = ys.replaceAll(/[ꜛꜜ]/g, "").replaceAll(/<f0:[^>]*>/g, ""),
    n = r.morae.length,
    dict = valuesOf(accentMarks(bare, A)),
    falls = gold.has(r.name) ? goldFalls(gold.get(r.name), n) : null,
    gv = falls ? valuesOf(withFalls(bare, falls)) : null;
  if (!dict || dict.length !== n) continue;
  sentences[r.name] = { dict, gold: gv && gv.length === n ? gv : null, q2: r.test ? qvalues(bare) : null };
}
for (const l of fs.readFileSync(path.join(HERE, "../jkyb/work/ys.jsonl"), "utf8").trim().split("\n")) {
  const j = JSON.parse(l);
  const v = valuesOf(accentMarks(j.ys, A));
  if (v) sentences[`JKYB_${j.key}`] = { dict: v, gold: null, q2: null };
}
fs.writeFileSync(path.join(HERE, "work/rows_values.json"), JSON.stringify(sentences));
console.log(Object.keys(sentences).length, "sentences");

// the dictionary's words, each on its own, in the same form
const table = read("work/kana_ipa.json"),
  out = fs.createWriteStream(path.join(HERE, "work/word_values.jsonl"));
let made = 0,
  skipped = 0;
const entries = read("work/word_falls.json");
for (const [surface, kana, fall] of entries) {
  const morae = kana.match(/[ァ-ヴー][ァィゥェォャュョヮ]?/g) ?? [];
  let ipa = "",
    bad = false;
  for (let i = 0; i < morae.length; i++) {
    const m = morae[i];
    if (m === "ー") ipa += "ː";
    else if (m === "ン") ipa += "ɴ";
    else if (m === "ッ") {
      const next = table[morae[i + 1]];
      if (!next) bad = true;
      else ipa += next[0];
    } else if (table[m]) ipa += table[m];
    else bad = true;
  }
  if (bad || !ipa) {
    skipped++;
    continue;
  }
  try {
    const bare = `ja /${ipa}<t:${surface.replaceAll(/[<>/]/g, "")}> ↘/`,
      P = phraseUnits(parse(bare).sections[0]);
    if (P.length !== 1 || P[0].length !== morae.length) {
      skipped++;
      continue;
    }
    const v = valuesOf(morae.length === 1 && !fall ? bare : applyEdits(bare, marksFor(P[0], fall)));
    if (v && v.length === morae.length) {
      const units = P[0].map((t) => (t.mk === "mora" ? (t.on ?? "") + (t.v ?? "") : { N: "ɴ", Q: "t", R: "ː" }[t.mk]));
      out.write(`${JSON.stringify({ s: surface, k: kana, i: units, v })}\n`);
      made++;
    } else skipped++;
  } catch {
    skipped++;
  }
}
out.end();
console.log(made, "words,", skipped, "skipped");
