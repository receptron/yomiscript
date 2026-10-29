// Yomite (reference, rule-based prosody): YomiScript with accent / stress / tone marks -> the same YomiScript with
// pitch values <f0:…> (semitones relative to the speaker's register) after each unit. Also writes allophones that are
// a pronunciation choice: Japanese vowel devoicing (◌̥) and the American English t/d flap (ɾ).
// Units that already carry <f0:…> are left as written. The Katarite renders only the values.
// Dialect is a Yomite setting, not part of YomiScript: realize(ys, {dialect:{ja:'osaka'}}).
import { parse, isJa, VOWELS } from "./yomiscript.js";
const inStr = (ch, s) => s.includes(ch);
const fmt = (v) => String(Math.round(v * 100) / 100);
export const f0Mark = (c) => `<f0:${c.map(fmt).join(",")}>`;
export function applyEdits(s, E) {
  for (const e of [...E].sort((a, b) => b.at - a.at)) s = s.slice(0, e.at) + e.ins + s.slice(e.at + (e.del || 0));
  return s;
}
// Japanese: Tokyo-type pitch from ꜛ / ꜜ per accent phrase. Osaka (Keihan-type): a phrase without ꜛ is high-onset,
// ꜛ marks where a low-onset phrase rises; the high stretch is flatter and vowels are not devoiced
const VLJ = ["k", "s", "ɕ", "t", "ʨ", "ʦ", "h", "ç", "ɸ", "p"];
const voicelessStart = (m) => !!m && m.mk === "mora" && VLJ.some((x) => m.ipa.startsWith(x));
function devoiced(M, k, end) {
  // i / ɯ between voiceless consonants, and the ɯ of a sentence-final す
  const m = M[k];
  if (m.mk !== "mora" || !inStr(m.v, "iɯɨ") || !voicelessStart(m)) return false;
  if (voicelessStart(M[k + 1])) return true;
  return k === M.length - 1 && end === "$" && (m.ipa === "sɯ" || m.ipa === "sɨ");
}
function jaPhrase(M, end, osaka, E) {
  // one accent phrase: high after ꜛ (or from the start without ꜛ), low after ꜜ; declining within the high stretch
  let state = M[0].hasRise ? "L" : "H",
    hk = 0;
  M.forEach((m, k) => {
    let v;
    if (state === "H") v = 2.5 - 0.45 * hk++;
    else v = k === 0 ? -2.0 : -2.5 - 0.3 * hk;
    const auto = !osaka && devoiced(M, k, end);
    if (auto && !m.dev) E.push({ at: m.vend, ins: "̥" });
    if (osaka && v >= 0) v = 2.5 - (2.5 - v) / 3;
    if (!m.dev && !auto && !m.f0) E.push({ at: m.end, ins: f0Mark([v]) });
    if (m.rise) state = "H";
    if (m.fall) state = "L";
  });
}
function jaRules(sec, E, dialect) {
  const C = [];
  for (const t of sec.toks) {
    if (t.kind !== "unit") continue;
    C[t.chunk] ??= [];
    C[t.chunk].push(t);
  }
  for (const M of C) jaPhrase(M, sec.end, dialect === "osaka", E);
}
// English / French: stress-based pitch, phrase-boundary rise, sentence-final fall or rise
function flaps(t, prev) {
  // American English: t / d between a vowel (or r) and a vowel or syllabic l, not at the start of a word -> ɾ
  const r = t.raw;
  if (t.j === 0 || !inStr(r[0] ?? "#", "td") || r.length < 2 || prev?.kind !== "unit") return false;
  if (!inStr(r[1], VOWELS + "ɝɚ") && !r.slice(1).startsWith("l̩")) return false;
  return inStr(prev.raw.slice(-1), VOWELS + "ɹrɝɚ");
}
function euValue(t, fr) {
  if (fr) return t.j === t.nsyl - 1 ? [0.5] : [-0.5];
  return { ˈ: [3.0, 1.0], ˌ: [1.0] }[t.st] ?? [-1.5];
}
// American English only: not en-GB, not French, and not English words inside another language
const flapping = (lang, top) => lang.startsWith("en") && lang !== "en-GB" && top.startsWith("en");
const lastValued = (C) => C.findLast((x) => x.c);
function euContours(sec, top, E) {
  // stress-based value per syllable (null where the YomiScript already has one), plus the phrase-final rises
  const fr = sec.lang === "fr",
    flap = flapping(sec.lang, top);
  const C = [];
  let prev = null;
  for (const t of sec.toks) {
    const L = t.kind === "bound" ? lastValued(C) : null;
    if (L) L.c = [...L.c, 2.5];
    if (t.kind === "bound") continue;
    if (t.kind === "unit" && flap && !t.f0 && flaps(t, prev)) E.push({ at: t.start, del: 1, ins: "ɾ" });
    if (t.kind === "unit") C.push({ t, c: t.f0 ? null : euValue(t, fr) });
    prev = t;
  }
  return C;
}
function euRules(sec, E, top) {
  const C = euContours(sec, top, E),
    L = lastValued(C);
  if (L) L.c = [L.c[0], sec.end === "$" ? -5 : 6]; // sentence-final fall or rise
  for (const { t, c } of C) if (c) E.push({ at: t.end, ins: f0Mark(c) });
}
// Chinese: tone contours (tone 5 = neutral, no value)
const TC = { 1: [3, 3], 2: [-1, 3.5], 3: [-3, -4.5, -3], 4: [4, -3], 5: null };
function zhRules(sec, E) {
  for (const t of sec.toks) if (t.kind === "unit" && !t.f0 && TC[t.tone]) E.push({ at: t.end, ins: f0Mark(TC[t.tone]) });
}
export function realize(ys, opt = {}) {
  const Y = parse(ys),
    E = [],
    D = opt.dialect ?? {};
  for (const sec of Y.sections) {
    if (isJa(sec.lang)) jaRules(sec, E, D.ja);
    else if (sec.lang === "zh") zhRules(sec, E);
    else euRules(sec, E, Y.top);
  }
  return applyEdits(Y.ys, E);
}
