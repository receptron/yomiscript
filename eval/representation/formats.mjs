// The four output formats compared (README.md): their prompts and how an answer is checked and turned into the
// YomiScript that is scored. The YomiScript prompt and its examples are eval/browser_tts's own; the kana and SSML
// prompts follow it section by section, and the SSML prompt takes its IPA rules from it (no copy).
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parse } from "@yomiscript/core";
import { buildPrompt, HERE as BROWSER_TTS } from "../browser_tts/sets.mjs";
import { ps } from "../browser_tts/reading.mjs";

export const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(f, "utf8");
const YS_TEMPLATE = read(path.join(BROWSER_TTS, "prompt.md"));
// the pronunciation rules of the YomiScript prompt (Japanese IPA table, English IPA), from its first rule to the pause rule
const IPA_RULES = YS_TEMPLATE.slice(YS_TEMPLATE.indexOf("- The pronunciation is IPA"), YS_TEMPLATE.indexOf("- ` ‖ `")).trimEnd();
const EXAMPLES = JSON.parse(read(path.join(HERE, "examples.json")));
const examples = (key) => EXAMPLES.map((x) => ({ lang: x.lang, text: x.text, ys: x[key] }));

const TEMPLATES = {
  yomiscript: [YS_TEMPLATE, undefined], // undefined: buildPrompt's default, eval/browser_tts/examples.json
  kana: [read(path.join(HERE, "prompt_kana.md")), examples("kana")],
  ssml: [read(path.join(HERE, "prompt_ssml.md")).replace("{{IPA}}", IPA_RULES), examples("ssml")],
  sparse: [read(path.join(HERE, "prompt_sparse.md")), examples("sparse")],
};
export const FORMATS = Object.keys(TEMPLATES);
export const LLMS = ["claude", "codex", "agy"];
export const prompt = (format, items) => buildPrompt(TEMPLATES[format][0], items, TEMPLATES[format][1]);

const flat = (s) => s.replace(/\s+/g, "");
const ja = (ipa) => `ja /${ipa} ↘/`;

// YomiScript: valid when the Katarite's parser and planner take it; its <t:…> values should give back the input
function yomiscript(out, text) {
  const ys = out.trim(),
    problems = [];
  if (ps(ys) === null) problems.push("not parsed");
  let texts = [];
  try {
    texts = parse(ys).texts;
  } catch {
    /* counted above */
  }
  const textBack = texts.length > 0 && flat(texts.join("")) === flat(text);
  const ipaOnly = ys.replace(/<t:[^>]*>/g, "");
  return { ys, problems, textBack, ipaChars: [...ipaOnly].length };
}

// kana: only katakana, ー and the punctuation the prompt allows (・ and spaces tolerated: a kana TTS reads past them).
// Hiragana is read as katakana; anything else is dropped before the kana is turned into YomiScript (kana.py).
const KANA_OK = /^[ァ-ヺー、。？！・\s]+$/u;
function kana(out) {
  const k = out.trim(),
    problems = KANA_OK.test(k) ? [] : ["not katakana only"];
  const kata = k.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
  return { kana: kata, problems, textBack: null, ipaChars: [...k].length };
}

// SSML: one <speak xml:lang> holding only <phoneme alphabet="ipa" ph="…">word</phoneme> elements and unspoken text
// (punctuation, spaces). The ph values in order are scored as one Japanese YomiScript utterance, whether the rest is
// well formed or not; the problems are counted separately.
// the attributes of a tag: name='value' or name="value", spaces around = allowed
function attrs(tag) {
  const A = {};
  let i = tag.indexOf("=");
  while (i >= 0) {
    const name = tag.slice(0, i).trimEnd().split(/\s/).pop();
    const rest = tag.slice(i + 1).trimStart(),
      q = rest[0];
    if (q !== "'" && q !== '"') break;
    const end = rest.indexOf(q, 1);
    if (end < 0) break;
    A[name] = rest.slice(1, end);
    tag = rest.slice(end + 1);
    i = tag.indexOf("=");
  }
  return A;
}
const unescape = (s) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
const SPOKEN = /[\p{L}\p{N}]/u;
function ssmlBody(out, problems) {
  const m = out.trim().match(/^<speak\b([^>]*)>([\s\S]*)<\/speak>$/);
  if (!m) {
    problems.push("no <speak> root");
    return out;
  }
  if (!attrs(m[1])["xml:lang"]) problems.push("no xml:lang");
  return m[2];
}
// one tag or one piece of text of the body; `open` is the attributes of the <phoneme> being read, or null
function step(S, piece) {
  if (piece.startsWith("<phoneme")) {
    const a = attrs(piece);
    if (S.open || a.alphabet !== "ipa" || a.ph === undefined) S.problems.push("phoneme without alphabet='ipa' and ph");
    if (a.ph) S.ph.push(unescape(a.ph).trim());
    S.open = a;
  } else if (piece === "</phoneme>" && S.open) S.open = null;
  else if (piece.startsWith("<")) S.problems.push(`other markup ${piece.slice(0, 20)}`);
  else {
    if (!S.open && SPOKEN.test(piece)) S.problems.push(`word outside <phoneme>: ${piece.trim().slice(0, 12)}`);
    S.texts.push(unescape(piece));
  }
}
function ssml(out, text) {
  const S = { problems: [], ph: [], texts: [], open: null };
  const body = ssmlBody(out, S.problems);
  for (const piece of body.split(/(<[^<>]*>)/)) if (piece) step(S, piece);
  if (S.open) S.problems.push("unclosed <phoneme>");
  const { problems, ph, texts } = S;
  const ys = ja(ph.join(" "));
  if (ph.length && ps(ys) === null) problems.push("ph not parsed");
  return { ys, problems: [...new Set(problems)], textBack: flat(texts.join("")) === flat(text), ipaChars: [...ph.join(" ")].length };
}

// sparse kana: the input with word[reading] after some words, |word[reading] where the word starts inside a run
// (prompt_sparse.md). `sparse` is what kana.py --sparse reads: the text without its readings and the annotated runs as
// [start, end, reading in katakana], in code points.
const RUN_CHAR = /[\p{Script=Han}々〆ヶ\p{N}A-Za-zＡ-Ｚａ-ｚ.,:/%％．，：]/u;
const KANA_READING = /^[\u3041-\u3096\u30a1-\u30fa\u30fc]+$/u;
const katakana = (s) => s.replace(/[\u3041-\u3096]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
// the text before a reading -> [kept, word]: the word is the run at its end, from a | before it if there is one
function splitRun(before) {
  const ch = [...before];
  let i = ch.length;
  while (i > 0 && RUN_CHAR.test(ch[i - 1])) i--;
  const word = ch.slice(i).join("");
  const bar = i > 0 && (ch[i - 1] === "|" || ch[i - 1] === "｜");
  return [ch.slice(0, bar ? i - 1 : i).join(""), word];
}
function sparse(out, text) {
  const pieces = out.trim().split(/(\[[^[\]]*\])/),
    problems = [],
    spans = [];
  let plain = "",
    readingChars = 0;
  for (let k = 0; k < pieces.length; k += 2) {
    const reading = pieces[k + 1]?.slice(1, -1);
    if (reading === undefined) {
      plain += pieces[k];
      continue;
    }
    const [kept, word] = splitRun(pieces[k]);
    if (!word) problems.push("bracket without a run before it");
    if (!KANA_READING.test(reading)) problems.push("reading not kana");
    plain += kept + word;
    const n = [...plain].length;
    spans.push([n - [...word].length, n, katakana(reading)]);
    readingChars += [...reading].length;
  }
  if (/[[\]|｜]/.test(plain)) problems.push("stray bracket");
  const textBack = flat(plain) === flat(text);
  if (!textBack) problems.push("text changed");
  return { sparse: JSON.stringify({ text: plain, spans }), spans: textBack ? spans : null, problems: [...new Set(problems)], textBack, ipaChars: readingChars };
}

/** check one answer: { problems: [], textBack, ipaChars, chars, ys | kana } (problems ["missing"] when there is none) */
export function check(format, out, text) {
  if (typeof out !== "string" || !out.trim()) return { problems: ["missing"], textBack: false, ipaChars: 0, chars: 0 };
  const r = { yomiscript, kana, ssml, sparse }[format](out, text);
  return { ...r, chars: [...out.trim()].length };
}
