// Accent marks from the dictionary, written onto the LLM's YomiScript without touching its reading. For each accent
// phrase of dict_accent.json (OpenJTalk), the LLM words covering the same characters (by <t:…>) are found; when their
// reading is the dictionary's (as `same` compares them) and the morae line up, ꜛ / ꜜ go after the morae where the
// dictionary's pitch rises / falls and ` | ` around the phrase. Every other phrase stays unmarked (Kokoro's own pitch).
//   marked     phrases given marks
//   reading    the LLM read the phrase another way (or with another number of morae): left unmarked
//   words      the phrase does not start and end at the LLM's word boundaries: left unmarked
// usage: node dict_marks.mjs [llm] [rep]   (default claude 2) -> runs/dict/<llm>.<set>.<rep>.json, dict_marks.md
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { applyEdits, parse } from "@yomiscript/core";
import { SETS } from "../../sets.mjs";
import { loose } from "../../reading.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DICT = JSON.parse(fs.readFileSync(path.join(HERE, "dict_accent.json"), "utf8"));
const [LLM = "claude", REP = "2"] = process.argv.slice(2);
const strip = (ys) => ys.replace(/[ꜛꜜ]/g, "").replace(/ \| /g, " ");

function words(u, ys) {
  // the LLM's words: character span of the text, the Japanese units reading it, and where its <t:…> ends in ys
  const W = [];
  let at = 0;
  u.texts.forEach((t) => {
    W.push({ start: at, end: at + t.length, text: t, units: [] });
    at += t.length;
  });
  for (const sec of u.sections) for (const t of sec.toks) if (t.kind === "unit" && t.lang === "ja" && t.span !== undefined) W[t.span].units.push(t);
  for (const w of W) {
    if (!w.units.length) continue;
    const e = w.units.at(-1).end;
    w.from = Math.max(ys.lastIndexOf(" ", w.units[0].end - 1), ys.lastIndexOf("/", w.units[0].end - 1)) + 1; // units carry no start
    w.reading = ys.slice(w.from, e);
    w.close = ys.indexOf(">", e) + 1;
  }
  return W;
}
// the same morae: also z / dz and an ASCII u for ɯ (spellings that do not change where the accent goes)
const same = (a, b) => [a, b].map((x) => loose(x).replace(/dz/g, "z").replace(/u/g, "ɯ")).reduce((x, y) => x === y);
const PUNCT = /^[\s、。，．,.!?！？「」『』()（）・…〜~]*$/;

function cover(W, p, text) {
  // the LLM words reading exactly the phrase's characters (trailing punctuation allowed), or null
  const a = W.findIndex((w) => w.start === p.start);
  if (a < 0) return null;
  let z = a;
  while (z < W.length && W[z].end < p.end) z++;
  if (z >= W.length || !PUNCT.test(text.slice(p.end, W[z].end))) return null;
  return W.slice(a, z + 1);
}
function marks(p, U) {
  // edits: ꜛ after a mora followed by a higher one, ꜜ after one followed by a lower one
  const E = [];
  for (let i = 0; i + 1 < U.length; i++) {
    if (p.hl[i] === "L" && p.hl[i + 1] === "H") E.push({ at: U[i].end, ins: "ꜛ" });
    if (p.hl[i] === "H" && p.hl[i + 1] === "L") E.push({ at: U[i].end, ins: "ꜜ" });
  }
  return E;
}
function markItem(ys, text, P) {
  const u = parse(ys),
    W = words(u, ys),
    st = { phrases: P.length, marked: 0, reading: 0, words: 0, diffs: [] },
    E = [];
  if (u.texts.join("") !== text) return { ys, st: { ...st, words: P.length } };
  for (const p of P) {
    const C = cover(W, p, text);
    const U = C?.flatMap((w) => w.units) ?? [];
    if (!C || !U.length) {
      st.words++;
      continue;
    }
    const llm = C.map((w) => w.reading ?? "").join("");
    if (U.length !== p.hl.length || !same(llm, p.ipa)) {
      st.reading++;
      st.diffs.push(`${text.slice(p.start, p.end)}: dictionary ${p.ipa}, LLM ${llm}`);
      continue;
    }
    st.marked++;
    E.push(...marks(p, U), { at: C[0].from, ins: "| " }, { at: C.at(-1).close, ins: " |" });
  }
  const out = applyEdits(ys, E)
    .replace(/\/\| /g, "/")
    .replace(/ \| (?=[‖↘↗]|\/|\|)/g, " ")
    .replace(/ {2,}/g, " ");
  return { ys: out, st };
}

const runDir = path.join(HERE, "runs", "dict");
fs.mkdirSync(runDir, { recursive: true });
const md = [
  `# Dictionary marks on ${LLM} rep ${REP} (\`node dict_marks.mjs\`)`,
  "",
  "| set | phrases | marked | other reading | not at word boundaries | reading unchanged |",
  "|---|---|---|---|---|---|",
];
const missed = [];
for (const set of ["hard", "ja"]) {
  const src = JSON.parse(fs.readFileSync(path.join(HERE, "runs", LLM, `none.${set}.${REP}.json`), "utf8")).output;
  const out = {},
    tot = { phrases: 0, marked: 0, reading: 0, words: 0 };
  let same = 0,
    n = 0;
  for (const x of SETS[set]) {
    const ys = src[x.name],
      P = DICT[set][x.name];
    if (!ys || !P) continue;
    let r;
    try {
      r = markItem(ys, x.text, P);
    } catch {
      continue; // the LLM's YomiScript does not parse
    }
    out[x.name] = r.ys;
    n++;
    same += strip(r.ys).replace(/\s+/g, " ") === strip(ys).replace(/\s+/g, " ");
    for (const k of Object.keys(tot)) tot[k] += r.st[k];
    for (const d of r.st.diffs) missed.push(`${set} ${x.name} ${d}`);
  }
  fs.writeFileSync(path.join(runDir, `${LLM}.${set}.${REP}.json`), JSON.stringify({ llm: LLM, rep: Number(REP), set, output: out }, null, 1));
  const pc = (k) => `${tot[k]} (${((100 * tot[k]) / tot.phrases).toFixed(1)}%)`;
  md.push(`| ${set} | ${tot.phrases} | ${pc("marked")} | ${pc("reading")} | ${pc("words")} | ${same} of ${n} |`);
}
md.push("", "## Phrases the LLM read another way than the dictionary (left unmarked)", "", ...missed.map((m) => `- ${m}`));
fs.writeFileSync(path.join(HERE, "dict_marks.md"), md.join("\n") + "\n");
console.log(md.join("\n"));
