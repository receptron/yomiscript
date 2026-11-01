// The listening set of eval/ipa_value: (A) each target word of items_accent.json in four conditions (kokoro,
// kana_dict, dict, claude), cut from its sentence's audio, to be identified among its minimal set; (B) each sentence of
// items_mixed.json with English meant as English, as Claude's YomiScript and as Claude's kana, to be rated.
// A clip of A is the target word plus the mora after it (the stretch score_accent.mjs measures), cut at the mora times
// of the .json next to the wav (Kokoro's own predicted durations, so the cut is where the audio was generated, not an
// aligner's guess). The whole sentence is not played: its meaning tells which word it is, and the test is the pitch.
// Each clip gets an opaque id (a001, b001, ...) in an order fixed by the seed; the page reorders the clips per listener.
// usage: node build.mjs [--seed S]   -> set.json (the key: which condition and item each clip is; not served)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { shuffled } from "../../tts_readings/listen/shuffle.mjs";
import { seconds } from "../../tts_readings/listen/build.mjs";
import { ACCENT_ITEMS, AUDIO, MIXED_ITEMS, locate, morae, readJson, targetKeys } from "../common.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SET = path.join(HERE, "set.json");
export { AUDIO };
export const ACCENT_CONDS = ["kokoro", "kana_dict", "dict", "claude"];
export const MIXED_CONDS = ["ys_claude", "kana_claude"];
// seconds kept before the word's first mora and after the next mora (the cut is faded in and out by serve.mjs)
const PAD_BEFORE = 0.02,
  PAD_AFTER = 0.03;
// seconds a listener spends on a clip besides playing it: choosing a word (A); two ratings and maybe typing (B)
const CHOOSE_S = 5,
  RATE_S = 12,
  PLAYS = 2;

// the stretch of a condition's sentence audio that holds the target word and the mora after it, or null
function cut(cond, x, keys) {
  const meta = JSON.parse(fs.readFileSync(path.join(AUDIO, "accent", cond, `${x.name}.json`), "utf8")),
    M = morae(meta.ys),
    i = locate(M, keys, x.word),
    last = meta.morae?.[i + keys.length] ?? meta.morae?.[i + keys.length - 1];
  if (i < 0 || !meta.morae || meta.morae.length !== M.length || !last) return null;
  const from = Math.max(0, meta.morae[i].start - PAD_BEFORE),
    to = last.end + PAD_AFTER;
  return { from: +from.toFixed(3), to: +to.toFixed(3), heard: M.slice(i, i + keys.length + 1).map((m) => m.key) };
}

function accentClips(failed) {
  const base = readJson("results/base.json"),
    scored = Object.fromEntries(readJson("results/accent_items.json").map((x) => [x.name, x])),
    items = ACCENT_ITEMS(),
    out = [];
  for (const x of items) {
    const keys = targetKeys(x, base[x.name]),
      members = items.filter((y) => y.set === x.set).map((y) => ({ name: y.name, word: y.word, gold: scored[y.name].gold, textbook: y.textbook }));
    for (const cond of ACCENT_CONDS) {
      const at = cut(cond, x, keys);
      if (!at) {
        failed.push(`${cond} ${x.name}`);
        continue;
      }
      const audio = path.join("accent", cond, `${x.name}.wav`);
      out.push({
        part: "A",
        item: x.name,
        set: x.set,
        word: x.word,
        kana: x.kana,
        cond,
        marked: scored[x.name].cond[cond]?.nucleus ?? null,
        members,
        audio,
        ...at,
      });
    }
  }
  return out;
}

// the sentence with its Latin-script run (the English) hidden, so that what the listener types is what was heard
export const masked = (text) => text.replace(/[A-Za-z][A-Za-z'’ ?!.,-]*[A-Za-z?!.]/g, "＿＿＿");

function mixedClips(failed) {
  const out = [];
  for (const x of MIXED_ITEMS().filter((y) => y.intent === "en")) {
    for (const cond of MIXED_CONDS) {
      const audio = path.join("mixed", cond, `${x.name}.wav`);
      if (!fs.existsSync(path.join(AUDIO, audio))) {
        failed.push(`${cond} ${x.name}`);
        continue;
      }
      out.push({ part: "B", item: x.name, cond, text: x.text, shown: masked(x.text), target: x.target, audio });
    }
  }
  return out;
}

export function build(seed = "ipa_value listening 1") {
  const failed = [],
    ids = (clips, p) => shuffled(clips, `${seed} ids ${p}`).map((c, i) => ({ id: `${p}${String(i + 1).padStart(3, "0")}`, ...c }));
  const A = ids(accentClips(failed), "a"),
    B = ids(mixedClips(failed), "b").map((c) => ({ ...c, seconds: +seconds(path.join(AUDIO, c.audio)).toFixed(2) }));
  const set = { seed, made: new Date().toLocaleDateString("sv"), failed, clips: [...A, ...B].sort((a, b) => a.id.localeCompare(b.id)) };
  fs.writeFileSync(SET, JSON.stringify(set, null, 1) + "\n");
  return set;
}

export const clipSeconds = (c) => (c.part === "A" ? c.to - c.from : c.seconds);

// the minutes a listener needs for the set (each clip played PLAYS times, plus choosing or rating)
export function minutes(set, part) {
  const clips = set.clips.filter((c) => !part || c.part === part);
  return clips.reduce((t, c) => t + PLAYS * clipSeconds(c) + (c.part === "A" ? CHOOSE_S : RATE_S), 0) / 60;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const at = process.argv.indexOf("--seed"),
    set = build(...(at > 0 ? [process.argv[at + 1]] : []));
  const n = (p) => set.clips.filter((c) => c.part === p).length,
    audio = set.clips.reduce((t, c) => t + clipSeconds(c), 0) / 60;
  console.log(`${n("A")} accent clips, ${n("B")} English sentences -> ${path.relative(process.cwd(), SET)}; not cut: ${set.failed.join(", ") || "none"}`);
  console.log(`audio ${audio.toFixed(1)} min; a listener needs about ${Math.round(minutes(set, "A"))} + ${Math.round(minutes(set, "B"))} min`);
}
