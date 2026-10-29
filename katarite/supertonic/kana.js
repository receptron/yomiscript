// Japanese YomiScript -> kana text, for a Katarite whose engine reads text (Supertonic 3 takes characters, not IPA).
// The kana is written by pronunciation, as the YomiScript says it: は → わ, へ → え, を → お, ー for every long vowel
// (spelling it by the vowel would make カレー into かれい, a different word), っ for a geminate, ん for the moraic nasal. Pitch values and accent marks
// are dropped: the engine makes its own prosody. ‖ → 、, a sentence end → 。 or ？, <p:…> passes through.
import { parse } from "../../demo/ys_web/web/yomiscript.js";

const VOWEL = { a: "あ", i: "い", ɯ: "う", e: "え", o: "お" };
const ROWS = {
  k: "かきくけこ",
  ɡ: "がぎぐげご",
  s: "さ_すせそ",
  dz: "ざ_ずぜぞ",
  z: "ざ_ずぜぞ",
  t: "た__てと",
  d: "だ__でど",
  n: "な_ぬねの",
  h: "は__へほ",
  b: "ばびぶべぼ",
  p: "ぱぴぷぺぽ",
  m: "まみむめも",
  ɾ: "らりるれろ",
  r: "らりるれろ",
  j: "や_ゆ_よ",
  w: "わ____",
};
// onsets whose morae are not one row of the table: palatal and other special consonants, then the loanword sounds
const SMALL = { a: "ゃ", ɯ: "ゅ", o: "ょ", e: "ぇ" };
const PALATAL = {
  kʲ: "き",
  ɡʲ: "ぎ",
  ɕ: "し",
  dʑ: "じ",
  ʑ: "じ",
  tɕ: "ち",
  ɲ: "に",
  ç: "ひ",
  hʲ: "ひ",
  bʲ: "び",
  pʲ: "ぴ",
  mʲ: "み",
  ɾʲ: "り",
  rʲ: "り",
  nʲ: "に",
};
const SPECIAL = {
  ti: "てぃ",
  di: "でぃ",
  tɯ: "とぅ",
  dɯ: "どぅ",
  tsɯ: "つ",
  tsa: "つぁ",
  tsi: "つぃ",
  tse: "つぇ",
  tso: "つぉ",
  ɸɯ: "ふ",
  ɸa: "ふぁ",
  ɸi: "ふぃ",
  ɸe: "ふぇ",
  ɸo: "ふぉ",
  wi: "うぃ",
  we: "うぇ",
  wo: "うぉ",
  je: "いぇ",
  va: "ゔぁ",
  vi: "ゔぃ",
  vɯ: "ゔ",
  ve: "ゔぇ",
  vo: "ゔぉ",
  tʲi: "てぃ",
  dʲi: "でぃ",
  tʲɯ: "てゅ",
  dʲɯ: "でゅ",
  ɸʲɯ: "ふゅ",
  kwa: "くぁ",
  ɡwa: "ぐぁ",
  si: "すぃ",
  zi: "ずぃ",
  hi: "ひ",
  ni: "に",
  ki: "き",
  ɡi: "ぎ",
  ɾi: "り",
  mi: "み",
  bi: "び",
  pi: "ぴ",
};

function mora(on, v) {
  const key = on + v;
  if (SPECIAL[key]) return SPECIAL[key];
  if (!on) return VOWEL[v];
  if (PALATAL[on]) return v === "i" ? PALATAL[on] : PALATAL[on] + (SMALL[v] ?? VOWEL[v]);
  const row = ROWS[on];
  const k = row?.["aiɯeo".indexOf(v)];
  if (!k || k === "_") throw new Error(`no kana for the mora "${key}"`);
  return k;
}
const PUNCT = { ".": "。", "?": "？", "!": "！", ",": "、" };

function unit(t) {
  if (t.mk === "N") return "ん";
  if (t.mk === "Q") return "っ";
  if (t.mk === "R") return "ー";
  const v = t.v === "u" ? "ɯ" : t.v;
  return mora(t.on ?? "", v);
}

// -> the kana text of one YomiScript string; throws on a section in another language (its IPA has no text to give)
export function toKana(ys) {
  let out = "";
  for (const s of parse(ys).sections) {
    if (!/^ja\b/.test(s.lang)) throw new Error(`a ${s.lang} section cannot be given to a text engine as IPA`);
    for (const t of s.toks) {
      if (t.kind === "unit") {
        out += unit(t);
      } else if (t.kind === "pause") out += "、";
      else if (t.kind === "punct" || t.kind === "end") out += PUNCT[t.sym] ?? t.sym;
    }
  }
  return out.replace(/、(?=[。？！])/g, "");
}

// ---- text with reading hints, from the original text of each span (<t:…>, D23)
const NEEDS_READING = /[0-9A-Za-z０-９Ａ-Ｚａ-ｚ%％$＄&＆@＠#＃+＋〇一二三四五六七八九十百千万]/; // numbers, Latin letters, symbols, kanji numerals
const KANJI = /[㐀-鿿々]/;
function ambiguousIn(text, ambiguous) {
  // the span itself, or a written form of 2 to 8 characters inside it, has more than one reading (a single kanji
  // inside a longer word is not a reason: 料 and 理 each have several readings, 料理 has one)
  const core = text.replace(/[、。，．？！?!「」『』（）()…\s]/g, "");
  if (ambiguous.has(core)) return true;
  for (let i = 0; i < core.length; i++)
    for (let j = i + 2; j <= Math.min(core.length, i + 8); j++) if (ambiguous.has(core.slice(i, j)) && KANJI.test(core.slice(i, j))) return true;
  return false;
}
export const HINT_RULES = {
  // kana for the spans whose reading the engine may get wrong: an ambiguous written form, a number or a symbol
  ambiguous: (text, ambiguous) => NEEDS_READING.test(text) || ambiguousIn(text, ambiguous),
  // kana for every span with kanji, numbers or symbols; only kana words stay as written
  kanji: (text) => NEEDS_READING.test(text) || KANJI.test(text),
};
function spans(r) {
  const S = r.texts.map((text) => ({ text, units: [] })),
    rest = [];
  for (const s of r.sections)
    for (const t of s.toks) if (t.kind === "unit") (t.span === undefined ? rest : S[t.span].units).push({ ...t, ja: /^ja\b/.test(s.lang) });
  return { S, rest };
}
// -> the text to give a text engine: each span as written, or its reading in kana where the rule says so (Japanese).
// Without <t:…> annotations this is toKana(). Units after the last <t:…> are given as kana.
export function toText(ys, ambiguous = new Set(), rule = "ambiguous") {
  const r = parse(ys);
  if (!r.texts.length) return toKana(ys);
  const { S, rest } = spans(r);
  if (rest.some((u) => !u.ja)) throw new Error("a span in another language has no <t:…> text");
  const kana = (us) => us.map(unit).join("");
  const out = S.map(({ text, units }) => (units.length && units.every((u) => u.ja) && HINT_RULES[rule](text, ambiguous) ? kana(units) + trailing(text) : text));
  return out.join("") + kana(rest);
}
// punctuation at the end of a span stays when the span is given as kana (です。 -> です + 。)
const CLOSING = new Set("、。，．？！?!」』）)…");
function trailing(text) {
  let i = text.length;
  while (i > 0 && CLOSING.has(text[i - 1])) i--;
  return text.slice(i);
}
