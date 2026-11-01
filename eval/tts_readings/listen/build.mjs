// The listening set: every recording (system, run, sentence) in which the judge of score.py heard a target word
// misread, and a random sample of the recordings it heard read right (the control), as many as the misread ones.
// The verdicts come from results/items.json, the readings to choose from from targets.tsv (as written there, not
// normalized), the audio from audio/<system>/r<k>/hard.<name>.wav. Each clip gets an opaque id (c001, ...) in an order
// fixed by the seed, so neither the id nor the order tells the system; the page reorders the clips per listener.
// usage: node build.mjs [--seed S]   -> set.json (the key: which system and run each clip is; not served to the page)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { shuffled } from "./shuffle.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
export const SET = path.join(HERE, "set.json");
export const AUDIO = path.join(ROOT, "audio");
// seconds a listener spends on a clip besides playing it: reading the sentence, and per word, choosing a reading
const READ_S = 4,
  WORD_S = 4,
  PLAYS = 2;

// sentence -> [[word, right readings, misreadings]] as targets.tsv writes them (katakana, "-" for a word left out)
function targets() {
  const out = {};
  for (const line of fs.readFileSync(path.join(ROOT, "targets.tsv"), "utf8").split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const [name, word, right, wrong] = line.split("\t");
    out[name] = [...(out[name] ?? []), [word, right.split("|"), wrong.split("|")]];
  }
  return out;
}

// the seconds of a 16-bit PCM WAV file, from its header
export function seconds(file) {
  const b = fs.readFileSync(file);
  let at = 12,
    rate = 0,
    block = 0;
  while (at + 8 <= b.length) {
    const id = b.toString("ascii", at, at + 4),
      size = b.readUInt32LE(at + 4);
    if (id === "fmt ") [rate, block] = [b.readUInt32LE(at + 12), b.readUInt16LE(at + 20)];
    if (id === "data") return Math.min(size, b.length - at - 8) / (rate * block);
    at += 8 + size + (size % 2);
  }
  throw new Error(`${file}: no data chunk`);
}

// the word's reading the judge heard (as targets.tsv writes it): the candidate whose sentence is the one it chose
function judgedReading(item, k, heard, raw) {
  const [, right, wrong] = item.targets[k],
    base = item.gold[0],
    i = [...right, ...wrong].findIndex((c) => base.replace(right[0], () => c) === heard);
  return i < 0 ? null : [...raw[1], ...raw[2]][i];
}

// every recording of items.json as a clip: its sentence, system, run and per word the judge's verdict
function recordings(items, raw) {
  const out = [];
  for (const [name, item] of Object.entries(items)) {
    for (const [system, runs] of Object.entries(item.systems)) {
      runs.forEach((words, r) => {
        const judged = words.map(([ok, margin, heard], k) => ({ ok, margin, reading: judgedReading(item, k, heard, raw[name][k]) }));
        const file = path.join(AUDIO, system, `r${r + 1}`, `hard.${name}.wav`);
        out.push({ sentence: name, text: item.text, category: item.category, system, run: r + 1, file, judged });
      });
    }
  }
  return out;
}

export function build(seed = "tts_readings listening 1") {
  const items = JSON.parse(fs.readFileSync(path.join(ROOT, "results/items.json"), "utf8")),
    raw = targets(),
    all = recordings(items, raw);
  const misread = all.filter((c) => c.judged.some((w) => !w.ok)),
    control = shuffled(
      all.filter((c) => c.judged.every((w) => w.ok)),
      `${seed} control`,
    ).slice(0, misread.length);
  const picked = [...misread.map((c) => ({ ...c, stratum: "misread" })), ...control.map((c) => ({ ...c, stratum: "control" }))];
  const clips = shuffled(picked, `${seed} ids`).map((c, i) => {
    const words = raw[c.sentence].map(([word, right, wrong], k) => ({ word, right, wrong, judged: c.judged[k] }));
    const { sentence, text, category, system, run, stratum, file } = c;
    const id = `c${String(i + 1).padStart(3, "0")}`;
    return { id, sentence, text, category, system, run, stratum, audio: path.relative(AUDIO, file), seconds: +seconds(file).toFixed(2), words };
  });
  const population = Object.fromEntries([...new Set(all.map((c) => c.system))].map((s) => [s, all.filter((c) => c.system === s).length]));
  const set = { seed, made: new Date().toLocaleDateString("sv"), population, clips };
  fs.writeFileSync(SET, JSON.stringify(set, null, 1) + "\n");
  return set;
}

// the minutes a listener needs for the set (each clip played PLAYS times, plus reading and choosing)
export function minutes(set) {
  return set.clips.reduce((t, c) => t + PLAYS * c.seconds + READ_S + WORD_S * c.words.length, 0) / 60;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const at = process.argv.indexOf("--seed"),
    set = build(...(at > 0 ? [process.argv[at + 1]] : []));
  const n = (s) => set.clips.filter((c) => c.stratum === s).length,
    audio = set.clips.reduce((t, c) => t + c.seconds, 0) / 60;
  console.log(`${set.clips.length} clips (${n("misread")} judged misread, ${n("control")} control) -> ${path.relative(process.cwd(), SET)}`);
  console.log(`audio ${audio.toFixed(1)} min; a listener needs about ${Math.round(minutes(set))} min`);
}
