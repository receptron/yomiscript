// Dictionary accent marks written onto a YomiScript without touching its reading (D25). For each accent phrase of
// the dictionary, the words covering the same characters of the text (by <t:…>) are found; when they read it the
// same way, mora by mora, ꜛ / ꜜ go after the morae where the dictionary's pitch rises / falls, and ` | ` around
// the phrase. Every other phrase is left unmarked (the Katarite's own prosody).
import { applyEdits, parse, type Edit, type Token, type Utterance } from "@yomiscript/core";
import type { LabelMora } from "./labels.ts";
import type { DictPhrase } from "./phrases.ts";

/** OpenJTalk's consonants in YomiScript IPA */
const ONSET: Record<string, string> = {
  k: "k",
  ky: "kʲ",
  g: "ɡ",
  gy: "ɡʲ",
  s: "s",
  sh: "ɕ",
  z: "dz",
  j: "dʑ",
  t: "t",
  ty: "tʲ",
  ch: "tɕ",
  ts: "ts",
  d: "d",
  dy: "dʲ",
  n: "n",
  ny: "ɲ",
  h: "h",
  hy: "ç",
  f: "ɸ",
  b: "b",
  by: "bʲ",
  p: "p",
  py: "pʲ",
  m: "m",
  my: "mʲ",
  r: "ɾ",
  ry: "ɾʲ",
  y: "j",
  w: "w",
  v: "v",
};
/** one mora as both sides are compared: spellings that do not change the mora are made the same */
function moraKey(onset: string, vowel: string): string {
  // a consonant + j is the palatalized consonant (kjo = kʲo); v is the b the dictionary writes for ヴ
  const v = vowel.toLowerCase().replace(/[uɨ]/g, "ɯ"),
    o = onset
      .replace(/g/g, "ɡ")
      .replace(/^([kɡbpmɾtd])j$/, "$1ʲ")
      .replace(/^v/, "b")
      .replace(/^z/, "dz")
      .replace(/^ʑ/, "dʑ")
      .replace(/^h[ʲj]$/, "ç")
      .replace(/^n[ʲj]$/, "ɲ");
  if (v === "i" && o === "h") return "çi";
  if (v === "i" && o === "n") return "ɲi";
  return o + v;
}
function dictKey(m: LabelMora, prevVowel: string): string {
  const [a, b] = m.ph;
  if (a === "N") return "N";
  if (a === "cl") return "Q";
  if (b === undefined) return a.toLowerCase() === prevVowel ? "R" : moraKey("", a); // a long vowel repeats the vowel
  return moraKey(ONSET[a] ?? a, b);
}
function unitKey(t: Token): string {
  if (t.mk === "N") return "N";
  if (t.mk === "Q") return "Q";
  if (t.mk === "R") return "R";
  return moraKey(t.on ?? "", t.v ?? "");
}
/** the same reading: the same morae, mora by mora (a long vowel also matches its vowel written again) */
function sameMorae(M: LabelMora[], U: Token[]): boolean {
  if (M.length !== U.length) return false;
  let prev = "";
  return M.every((m, i) => {
    const k = dictKey(m, prev),
      u = unitKey(U[i]);
    if (k !== "R" && k !== "N" && k !== "Q") prev = k.slice(-1);
    return k === u || (k === "R" && u === prev) || (u === "R" && k === prev);
  });
}

interface Word {
  start: number;
  end: number;
  units: Token[];
  /** where the word's reading starts in the YomiScript, and where its <t:…> ends */
  from: number;
  close: number;
}
function words(u: Utterance, ys: string): Word[] {
  const W: Word[] = [];
  let at = 0;
  for (const t of u.texts) {
    W.push({ start: at, end: at + t.length, units: [], from: -1, close: -1 });
    at += t.length;
  }
  for (const sec of u.sections) for (const t of sec.toks) if (t.kind === "unit" && t.lang === "ja" && t.span !== undefined) W[t.span].units.push(t);
  for (const w of W) {
    if (!w.units.length) continue;
    const first = (w.units[0].end ?? 0) - 1,
      last = w.units[w.units.length - 1].end ?? 0;
    w.from = Math.max(ys.lastIndexOf(" ", first), ys.lastIndexOf("/", first)) + 1;
    w.close = ys.indexOf(">", last) + 1;
  }
  return W;
}
const TRAILING = /^[\s、。，．,.!?！？「」『』()（）・…〜~]*$/;
/** the words reading exactly the phrase's characters (trailing punctuation allowed), or null */
function cover(W: Word[], p: DictPhrase, text: string): Word[] | null {
  const a = W.findIndex((w) => w.start === p.start);
  if (a < 0) return null;
  let z = a;
  while (z < W.length && W[z].end < p.end) z++;
  if (z >= W.length || !TRAILING.test(text.slice(p.end, W[z].end))) return null;
  return W.slice(a, z + 1);
}
function phraseEdits(p: DictPhrase, C: Word[], U: Token[]): Edit[] {
  const E: Edit[] = [
    { at: C[0].from, ins: "| " },
    { at: C[C.length - 1].close, ins: " |" },
  ];
  for (let i = 0; i + 1 < U.length; i++) {
    const [a, b] = [p.morae[i].hl, p.morae[i + 1].hl];
    if (a !== b) E.push({ at: U[i].end ?? 0, ins: a === "L" ? "ꜛ" : "ꜜ" });
  }
  return E;
}
export interface MarkStats {
  phrases: number;
  marked: number;
  /** read another way than the dictionary (or another number of morae) */
  reading: number;
  /** not starting and ending at the YomiScript's word boundaries */
  words: number;
  /** each phrase read another way: its text and both readings, mora by mora as they are compared */
  misses: { text: string; dict: string[]; ys: string[] }[];
}
function dictKeys(M: LabelMora[]): string[] {
  let prev = "";
  return M.map((m) => {
    const k = dictKey(m, prev);
    if (k !== "R" && k !== "N" && k !== "Q") prev = k.slice(-1);
    return k;
  });
}
/** writes the dictionary's marks onto ys; text is the utterance's original text (its <t:…> joined) */
export function writeMarks(ys: string, P: DictPhrase[]): { ys: string; stats: MarkStats } {
  const u = parse(ys),
    text = u.texts.join(""),
    W = words(u, ys),
    stats: MarkStats = { phrases: P.length, marked: 0, reading: 0, words: 0, misses: [] },
    E: Edit[] = [];
  for (const p of P) {
    const C = cover(W, p, text),
      U = C?.flatMap((w) => w.units) ?? [];
    if (!C || !U.length) stats.words++;
    else if (!sameMorae(p.morae, U)) {
      stats.reading++;
      stats.misses.push({ text: text.slice(p.start, p.end), dict: dictKeys(p.morae), ys: U.map(unitKey) });
    } else {
      stats.marked++;
      E.push(...phraseEdits(p, C, U));
    }
  }
  const out = applyEdits(ys, E)
    .replace(/\/\| /g, "/")
    .replace(/ \| (?=[‖↘↗/|])/g, " ")
    .replace(/([‖↘↗]) \| /g, "$1 ")
    .replace(/([‖↘↗]<t:[^>]*>) \| /g, "$1 ")
    .replace(/ {2,}/g, " ");
  return { ys: out, stats };
}
