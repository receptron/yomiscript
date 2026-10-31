// A blind A/B listening test: Claude's YomiScript spoken by the Kokoro Katarite as the tools ship it (fp32, the
// dictionary accent of D25) and by Audio8 0.1B (kana for every word with kanji, the voice cloned from Kokoro's
// Japanese voice, made by audio8.py --ys claude kanji --voice kokoro). The same reading on both sides.
// The 18 sentences of the accent trial (eval/browser_tts/trials/accent_marks), so the two tests can be read together.
// Both sides are brought to the same loudness (RMS), so the louder one is not heard as the better one.
// usage: node blind.mjs   -> audio/blind/<variant>/<set>.<name>.wav and audio/blind/listen.json; serve this
//        directory and open blind.html
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { openKatarite, originalText, toWav } from "yomiscript";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BROWSER_TTS = path.join(HERE, "../browser_tts");
const OUT = path.join(HERE, "audio/blind");
const PICK = {
  hard: ["h001", "h004", "h007", "h011", "h012", "h017", "h020", "h021", "h024", "h025", "h026", "h031"],
  ja: ["plain", "comma", "ka_question", "geminate", "two_sentences", "kanji_names"],
};
const AUDIO8 = path.join(BROWSER_TTS, "audio/audio8_ys_claude_kanji_kokoro");
const RMS = 0.06;

// the 16-bit PCM WAV audio8.py writes (soundfile's default for float data), as float samples
function readWav(file) {
  const b = fs.readFileSync(file);
  let at = 12,
    fmt = null;
  while (at < b.length) {
    const id = b.toString("ascii", at, at + 4),
      size = b.readUInt32LE(at + 4),
      body = at + 8;
    if (id === "fmt ") fmt = { channels: b.readUInt16LE(body + 2), sampleRate: b.readUInt32LE(body + 4), bits: b.readUInt16LE(body + 14) };
    if (id === "data") {
      if (!fmt || fmt.bits !== 16 || fmt.channels !== 1) throw new Error(`${file}: expected mono 16-bit PCM`);
      const samples = new Float32Array(size / 2);
      for (let i = 0; i < samples.length; i++) samples[i] = b.readInt16LE(body + 2 * i) / 32768;
      return { samples, sampleRate: fmt.sampleRate };
    }
    at = body + size + (size % 2);
  }
  throw new Error(`${file}: no data chunk`);
}
function levelled(samples) {
  const rms = Math.sqrt(samples.reduce((s, x) => s + x * x, 0) / samples.length),
    peak = samples.reduce((m, x) => Math.max(m, Math.abs(x)), 0),
    gain = Math.min(RMS / rms, 0.99 / peak);
  return samples.map((x) => x * gain);
}
function write(variant, id, speech) {
  fs.mkdirSync(path.join(OUT, variant), { recursive: true });
  fs.writeFileSync(path.join(OUT, variant, `${id}.wav`), toWav({ ...speech, samples: levelled(speech.samples) }));
}

const kokoro = await openKatarite("kokoro");
const items = [];
for (const [set, names] of Object.entries(PICK)) {
  const ys = JSON.parse(fs.readFileSync(path.join(BROWSER_TTS, `results/claude.${set}.json`), "utf8")).output;
  for (const name of names) {
    const id = `${set}.${name}`;
    write("kokoro", id, await kokoro.speak(ys[name]));
    write("audio8", id, readWav(path.join(AUDIO8, `${id}.wav`)));
    items.push({ set, name, text: originalText(ys[name]) });
    console.log(id);
  }
}
fs.writeFileSync(path.join(OUT, "listen.json"), JSON.stringify({ variants: ["kokoro", "audio8"], items }, null, 1));
console.log(`${items.length} sentences -> ${path.relative(HERE, OUT)}`);
