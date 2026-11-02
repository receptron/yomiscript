// What the blind listening tests share (eval/audio8, eval/qwen3_tts; the page is eval/blind.html): reading the 16-bit
// WAV files other engines write, and bringing every side to the same loudness (RMS), so that the louder one is not
// heard as the better one.
import fs from "fs";
import path from "path";
import { toWav } from "yomiscript";

const RMS = 0.06;

// a mono 16-bit PCM WAV (soundfile's PCM_16, and its default for float data), as float samples
export function readWav(file) {
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

export function levelled(samples) {
  const rms = Math.sqrt(samples.reduce((s, x) => s + x * x, 0) / samples.length),
    peak = samples.reduce((m, x) => Math.max(m, Math.abs(x)), 0),
    gain = Math.min(RMS / rms, 0.99 / peak);
  return samples.map((x) => x * gain);
}

// <out>/<variant>/<id>.wav, levelled
export function writeLevelled(out, variant, id, speech) {
  fs.mkdirSync(path.join(out, variant), { recursive: true });
  fs.writeFileSync(path.join(out, variant, `${id}.wav`), toWav({ ...speech, samples: levelled(speech.samples) }));
}
