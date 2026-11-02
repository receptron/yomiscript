// The transplant test: does Kokoro sound like Qwen3-TTS (the clone, the one heard as best in blind.mjs's test) when it
// is given Qwen's prosody? Kokoro speaks the same YomiScript with
//   kokoro        the tools' pitch (the D31 dictionary marks, the D29 values), Kokoro's durations (as blind.mjs)
//   kokoro_f0     Qwen's pitch as YomiScript values (<f0:start,middle,end> per mora, measure.py), Kokoro's durations
//   kokoro_f0dur  Qwen's pitch and Qwen's durations (per mora, spread over its ids as Kokoro spreads them; the
//                 durations go to the engine directly: YomiScript has no notation for them)
// and Qwen's own audio (qwen_clone) is the fourth side. If kokoro_f0 sounds as good as Qwen, what was heard is pitch,
// which a Yomite can write; if only kokoro_f0dur does, it is timing too; if neither, it is the rest of Kokoro.
// usage: node transplant.mjs prepare   -> audio/transplant/prep.json (the tools' YomiScript, its units, Kokoro's durations)
//        ../prosody_ref/.venv/bin/python measure.py   -> audio/transplant/measured.json
//        node transplant.mjs render    -> audio/transplant/<variant>/ja.<name>.wav, listen.json;
//                                         serve eval/ and open blind.html?test=qwen3_tts&run=transplant
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parse, applyEdits, f0Mark } from "@yomiscript/core";
import { accentYomite } from "@yomiscript/ja-accent";
import { nodeAnalyzer } from "@yomiscript/ja-accent/node";
import * as K from "@yomiscript/kokoro";
import { nodeEngine } from "@yomiscript/kokoro/node";
import { originalText } from "yomiscript";
import { readWav, writeLevelled } from "../blind_audio.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "audio/transplant");
const CACHE = path.join(process.env.HOME, ".cache/yomiscript");
const STEP = K.SAMPLES_PER_STEP / K.SR; // seconds per duration step

async function engine() {
  return nodeEngine({ dir: path.join(CACHE, "kokoro") }); // the tools' models, fp32
}
async function accentStep() {
  const base = path.join(CACHE, "ja-dict");
  return accentYomite(await nodeAnalyzer({ dir: path.join(base, fs.readdirSync(base)[0]) }));
}
const texts = () => JSON.parse(fs.readFileSync(path.join(HERE, "texts.json"), "utf8"));

async function prepare() {
  const E = await engine(),
    step = await accentStep(),
    out = [];
  for (const { name, ys } of texts()) {
    const y = step(ys),
      [sec] = K.plan(y),
      { dur } = await E.predict(sec);
    out.push({ name, ys: y, toks: sec.toks.map(({ kind, mk, on, v, ipa, dev }) => ({ kind, mk, on, v, ipa, dev })), uid: sec.uid, dur });
    console.log(name, y);
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "prep.json"), JSON.stringify(out, null, 1));
}

/** the YomiScript with every <f0:…> taken out and Qwen's values written after each mora that has them */
function withValues(ys, values) {
  const bare = ys.replace(/<f0:[^>]*>/g, ""),
    units = parse(bare).sections[0].toks.filter((t) => t.kind === "unit");
  if (units.length !== values.length) throw new Error(`${values.length} values for ${units.length} units`);
  return applyEdits(
    bare,
    units.flatMap((t, i) => (values[i] ? [{ at: t.end, ins: f0Mark(values[i]) }] : [])),
  );
}

/** steps per id: Qwen's time for each mora, each pause and each space Qwen paused at (measure.py's gaps), spread over
 * the unit's ids as Kokoro spreads them. Any other space gets one step per id, taken from the mora before it (Qwen's
 * time between two words is in the mora spans already); BOS / EOS, the end symbol and the last mora keep Kokoro's.
 * The last mora's vowel is where Kokoro puts the end of the utterance (it predicts it about 0.7 s long, the silence
 * after it included); given Qwen's 0.1-0.2 s, the end of every sentence was cut off (heard so, and Whisper missed the
 * last one to three morae of all 12) */
function qwenDurations(p, { spans, pauses, gaps }) {
  const dur = [...p.dur],
    units = p.toks.map((t, k) => (t.kind === "unit" ? k : -1)).filter((k) => k >= 0),
    seconds = new Map(),
    idsOf = (k) => p.uid.flatMap((u, l) => (u === k ? [l] : []));
  units.slice(0, -1).forEach((k, i) => seconds.set(k, spans[i][1] - spans[i][0]));
  p.toks.forEach((t, k) => {
    if (t.kind === "pause") seconds.set(k, pauses[k] ?? 0.2);
    else if (t.kind === "space" && gaps[k] === undefined && p.toks[k - 1]?.kind === "unit" && idsOf(k).length) {
      const s = idsOf(k).length * STEP;
      seconds.set(k, s);
      seconds.set(k - 1, Math.max(STEP, seconds.get(k - 1) - s));
    }
  });
  for (const [k, s] of Object.entries(gaps)) seconds.set(Number(k), s);
  for (const [k, s] of seconds) {
    const ids = idsOf(k),
      kok = ids.map((l) => p.dur[l]),
      total = Math.max(ids.length, Math.round(s / STEP)),
      sum = kok.reduce((a, b) => a + b, 0) || 1;
    let left = total;
    ids.forEach((l, j) => {
      const d = j === ids.length - 1 ? left : Math.max(1, Math.round((total * kok[j]) / sum));
      dur[l] = Math.max(1, d);
      left -= d;
    });
  }
  return dur;
}

const VARIANTS = ["kokoro", "kokoro_f0", "kokoro_f0dur", "qwen_clone"];
async function speak(E, variant, p, m, ys) {
  const speech = (r) => ({ samples: r.audio, sampleRate: K.SR }),
    [sec] = K.plan(ys);
  if (variant === "kokoro") return speech(await E.synth(p.ys));
  if (variant === "kokoro_f0") return speech(await E.synthSection(sec));
  if (variant === "kokoro_f0dur") return speech(await E.synthSection(sec, "values", qwenDurations(p, m)));
  return readWav(path.join(HERE, "audio/raw/clone", `${p.name}.wav`));
}
/** one listening test: the variants named (all four by default) into audio/<run>/ */
async function render(run = "transplant", variants = VARIANTS) {
  const E = await engine(),
    step = await accentStep(),
    dir = path.join(HERE, "audio", run),
    measured = JSON.parse(fs.readFileSync(path.join(OUT, "measured.json"), "utf8")),
    items = [];
  for (const p of JSON.parse(fs.readFileSync(path.join(OUT, "prep.json"), "utf8"))) {
    if (step(texts().find((t) => t.name === p.name).ys) !== p.ys) throw new Error(`${p.name}: prep.json is out of date`);
    const m = measured[p.name],
      ys = withValues(p.ys, m.values);
    for (const v of variants) writeLevelled(dir, v, `ja.${p.name}`, await speak(E, v, p, m, ys));
    items.push({ set: "ja", name: p.name, text: originalText(p.ys), ys });
    console.log(p.name, ys);
  }
  fs.writeFileSync(path.join(dir, "listen.json"), JSON.stringify({ test: `qwen3_tts_${run}`, title: "Qwen's prosody in Kokoro", variants, items }, null, 1));
}

const [cmd, run, list] = process.argv.slice(2);
if (cmd === "prepare") await prepare();
else if (cmd === "render") await render(run, list?.split(","));
else throw new Error("usage: node transplant.mjs prepare | render [run] [variant,variant,…]");
