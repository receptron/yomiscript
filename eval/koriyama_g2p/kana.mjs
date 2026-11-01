// Readings as the benchmark's kana: YomiScript -> katakana (the inverse of tools/yomiscript/kana2ipa.py's mora table,
// read from it through helper.py), and the normalisation Koriyama's scorer applies before the kana CER.
import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { parse, isJa } from "@yomiscript/core";
import { HERE } from "./items.mjs";

export const PYTHON = process.env.PYTHON ?? path.join(HERE, "../prosody_ref/.venv/bin/python");
/** run a Python script with `input` on stdin (from a temporary file: a large input through a pipe stalled) -> its JSON */
export function runPython(script, args, input = "") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "koriyama_g2p_")),
    file = path.join(dir, "in.json");
  fs.writeFileSync(file, input);
  const fd = fs.openSync(file, "r");
  try {
    const p = spawnSync(PYTHON, [script, ...args], { stdio: [fd, "pipe", "pipe"], encoding: "utf8", maxBuffer: 1 << 28 });
    if (p.status !== 0) throw new Error(`${path.basename(script)} ${args.join(" ")} failed: ${p.stderr}`);
    return JSON.parse(p.stdout);
  } finally {
    fs.closeSync(fd);
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
export const python = (args, input) => runPython(path.join(HERE, "helper.py"), args, input);

// IPA mora -> kana: the first kana kana2ipa spells that way wins (its table lists ジ before ヂ, ズ before ヅ, オ before
// ヲ and ォ), which is also how the benchmark's gold writes them
const MORA = python(["--mora"]);
const IPA_KANA = new Map();
for (const [k, ipa] of Object.entries(MORA)) if (!IPA_KANA.has(ipa)) IPA_KANA.set(ipa, k);
// contracted sounds the table does not list but the gold writes
for (const [ipa, k] of Object.entries({
  je: "イェ",
  ɸʲa: "フャ",
  ɸʲo: "フョ",
  vʲa: "ヴャ",
  vʲɯ: "ヴュ",
  vʲo: "ヴョ",
  tʲa: "テャ",
  tʲo: "テョ",
  dʲa: "デャ",
  dʲo: "デョ",
  sʲa: "スャ",
}))
  if (!IPA_KANA.has(ipa)) IPA_KANA.set(ipa, k);
/** what a mora with no kana is written as: it counts as one wrong character */
export const UNKNOWN = "〓";

// spellings the parser takes that the table writes otherwise (Kokoro's affricate ligatures, Latin u / z, h n before i)
const ONSET = { ʨ: "tɕ", ʥ: "dʑ", ʦ: "ts", ʣ: "dz", ʑ: "dʑ", z: "dz", hʲ: "ç", nʲ: "ɲ", ɕʲ: "ɕ", tɕʲ: "tɕ", dʑʲ: "dʑ", çʲ: "ç", ɲʲ: "ɲ", β: "b" };
const VOWEL = { u: "ɯ", ɨ: "ɯ" };
const ALT = { hi: "çi", ni: "ɲi", hɯ: "ɸɯ", wɯ: "ɯ", ji: "i" };
function moraKana(t) {
  const on = ONSET[t.on] ?? t.on ?? "",
    v = VOWEL[t.v] ?? t.v;
  const ipa = on + v;
  return IPA_KANA.get(ipa) ?? IPA_KANA.get(ALT[ipa]) ?? UNKNOWN;
}
const SPECIAL = { N: "ン", Q: "ッ", R: "ー" };
function unitKana(t, lang) {
  if (!isJa(lang)) return UNKNOWN; // a syllable of another language: no kana for it
  return t.mk === "mora" ? moraKana(t) : SPECIAL[t.mk];
}
function utteranceKana(ys) {
  let out = "";
  for (const s of parse(ys).sections) for (const t of s.toks) if (t.kind === "unit") out += unitKana(t, s.lang);
  return out;
}

/** YomiScript -> { kana, parsed }: when the whole utterance does not parse, each word that does is read on its own
 * (a word that does not parse gives nothing), so a slip costs that word and not the sentence */
export function ysKana(ys) {
  try {
    return { kana: utteranceKana(ys.trim()), parsed: true };
  } catch {
    const t = ys.trim(),
      a = t.indexOf("/"),
      b = t.lastIndexOf("/");
    const lang = a > 0 && b > a ? t.slice(0, a).trim() : "ja";
    const body = (b > a ? t.slice(a + 1, b) : t).replace(/<t:[^>]*>/g, " ").replace(/[↘↗‖|]/g, " ");
    let kana = "";
    for (const w of body.split(/\s+/).filter(Boolean))
      try {
        kana += utteranceKana(`${lang} /${w} ↘/`);
      } catch {
        /* nothing read from this word */
      }
    return { kana, parsed: false };
  }
}

// Koriyama's eval_cer.py (MIT): ー becomes the vowel of the kana before it (ン after ン); the scorer then removes 、.
const VOWEL_OF = {
  ア: "アカガサザタダナハバパマヤラワァャ",
  イ: "イキギシジチヂニヒビピミリィ",
  ウ: "ウクグスズツヅヌフブプムユルヴゥュ",
  エ: "エケゲセゼテデネヘベペメレェ",
  オ: "オコゴソゾトドノホボポモヨロヲォョ",
  ン: "ン",
};
const VMAP = new Map(Object.entries(VOWEL_OF).flatMap(([v, ks]) => [...ks].map((k) => [k, v])));
export function expandLong(s) {
  let out = "",
    prev = null;
  for (const c of s) {
    if (c === "ー") {
      out += prev ?? c;
      continue;
    }
    out += c;
    prev = VMAP.get(c) ?? null;
  }
  return out;
}
const hira2kata = (s) => s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
/** kana as scored: katakana only (punctuation, spaces and anything else removed; UNKNOWN kept), ー expanded; with `merge` also the
 * spellings of the same sound the gold never uses (ヲ オ, ヂ ジ, ヅ ズ) */
export function norm(s, merge) {
  let k = hira2kata(s ?? "").replace(/[^ァ-ヺー〓]/g, "");
  if (merge) k = k.replace(/ヲ/g, "オ").replace(/ヂ/g, "ジ").replace(/ヅ/g, "ズ");
  return expandLong(k);
}
