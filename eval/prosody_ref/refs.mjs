// Reference speech for the prosody score: the same Japanese texts read by commercial TTS services, from the original
// text (no YomiScript). Cached: a file already there is not requested again.
// usage: node refs.mjs [--env FILE] [--jsut N] [service …]   -> audio/ref/<service>/<set>.<name>.wav
//   --jsut N: also the first N JSUT sentences (items.mjs), for the accent extractor
//   API keys from the environment (OPENAI_API_KEY, GEMINI_API_KEY, ELEVENLABS_API_KEY), or from FILE (KEY=value
//   lines; default: the repository's .env, which .gitignore keeps out of git). A service without a key is skipped.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { items, jsut } from "./items.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const envAt = args.indexOf("--env");
const envFile = envAt >= 0 ? args.splice(envAt, 2)[1] : path.join(HERE, "../../.env");
const jsutAt = args.indexOf("--jsut");
const texts = [...items(), ...(jsutAt >= 0 ? jsut(Number(args.splice(jsutAt, 2)[1])) : [])];
const fileEnv = fs.existsSync(envFile) ? readEnv(envFile) : {};
const key = (k) => process.env[k] || fileEnv[k];

function readEnv(f) {
  const out = {};
  for (const raw of fs.readFileSync(f, "utf8").split("\n")) {
    const line = raw.trim().replace(/^export /, ""),
      i = line.indexOf("=");
    if (i <= 0 || line.startsWith("#")) continue;
    let v = line.slice(i + 1).trim();
    if (v.length >= 2 && (v[0] === '"' || v[0] === "'") && v.endsWith(v[0])) v = v.slice(1, -1);
    out[line.slice(0, i).trim()] = v;
  }
  return out;
}
function wavFromPcm(pcm, sr) {
  // 16-bit mono WAV around raw little-endian PCM
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVEfmt ", 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(sr, 24);
  h.writeUInt32LE(sr * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}
async function ok(r) {
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r;
}

const SERVICES = {
  openai: {
    key: "OPENAI_API_KEY",
    async speak(text, k) {
      const r = await ok(
        await fetch("https://api.openai.com/v1/audio/speech", {
          method: "POST",
          headers: { Authorization: `Bearer ${k}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "gpt-4o-mini-tts", voice: "coral", input: text, response_format: "wav" }),
        }),
      );
      return Buffer.from(await r.arrayBuffer());
    },
  },
  gemini: {
    key: "GEMINI_API_KEY",
    async speak(text, k) {
      const r = await ok(
        await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash-tts:generateContent", {
          method: "POST",
          headers: { "x-goog-api-key": k, "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text }] }],
            generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } } },
          }),
        }),
      );
      const d = (await r.json()).candidates?.[0]?.content?.parts?.[0]?.inlineData;
      if (!d) throw new Error("no audio in the response");
      const b = Buffer.from(d.data, "base64");
      const sr = Number(d.mimeType.match(/rate=(\d+)/)?.[1] ?? 24000);
      return d.mimeType.startsWith("audio/wav") ? b : wavFromPcm(b, sr);
    },
  },
  elevenlabs: {
    key: "ELEVENLABS_API_KEY",
    async speak(text, k) {
      const voice = "21m00Tcm4TlvDq8ikWAM"; // Rachel, a premade multilingual voice
      const r = await ok(
        await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=pcm_24000`, {
          method: "POST",
          headers: { "xi-api-key": k, "Content-Type": "application/json" },
          body: JSON.stringify({ text, model_id: "eleven_multilingual_v2", language_code: "ja" }),
        }),
      );
      return wavFromPcm(Buffer.from(await r.arrayBuffer()), 24000);
    },
  },
};

const PARALLEL = 4;
const want = args.length ? args : Object.keys(SERVICES);
for (const name of want) {
  const s = SERVICES[name],
    k = s && key(s.key);
  if (!s) throw new Error(`unknown service ${name}`);
  if (!k) {
    console.log(`- ${name}: no ${s.key}, skipped`);
    continue;
  }
  const dir = path.join(HERE, "audio", "ref", name);
  fs.mkdirSync(dir, { recursive: true });
  let made = 0;
  const todo = texts.filter((it) => !fs.existsSync(path.join(dir, `${it.set}.${it.name}.wav`)));
  const worker = async () => {
    for (let it = todo.shift(); it; it = todo.shift()) {
      try {
        fs.writeFileSync(path.join(dir, `${it.set}.${it.name}.wav`), await s.speak(it.text, k));
        made++;
      } catch (e) {
        console.log(`  ${name} ${it.set}.${it.name}: ${e.message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker)); // a few requests at a time
  console.log(`${name}: ${made} new`);
}
