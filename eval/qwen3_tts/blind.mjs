// A blind listening test, three ways: the YomiScript of texts.json spoken by the Kokoro Katarite as the tools ship it
// (fp32, the dictionary accent of D31, jf_alpha), and the plain text spoken by Qwen3-TTS 1.7B with its Japanese
// speaker (anna) and with the voice cloned from Kokoro's (clone), made by qwen3_tts.py. The texts have no word whose
// reading depends on the context, so the test is about the way of speaking, not the reading.
// Every side is brought to the same loudness (../blind_audio.mjs).
// usage: node blind.mjs   (after qwen3_tts.py)  -> audio/blind/<variant>/<name>.wav and audio/blind/listen.json;
//        serve eval/ and open blind.html?test=qwen3_tts
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { openKatarite, originalText } from "yomiscript";
import { readWav, writeLevelled } from "../blind_audio.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "audio/blind");
const QWEN = ["anna", "clone"];

const kokoro = await openKatarite("kokoro");
const items = [];
for (const { name, ys } of JSON.parse(fs.readFileSync(path.join(HERE, "texts.json"), "utf8"))) {
  const id = `ja.${name}`;
  writeLevelled(OUT, "kokoro", id, await kokoro.speak(ys));
  for (const v of QWEN) writeLevelled(OUT, `qwen_${v}`, id, readWav(path.join(HERE, "audio/raw", v, `${name}.wav`)));
  items.push({ set: "ja", name, text: originalText(ys) });
  console.log(id);
}
const variants = ["kokoro", ...QWEN.map((v) => `qwen_${v}`)];
fs.writeFileSync(path.join(OUT, "listen.json"), JSON.stringify({ test: "kokoro_vs_qwen3_tts", title: "Kokoro vs Qwen3-TTS", variants, items }, null, 1));
console.log(`${items.length} sentences -> ${path.relative(HERE, OUT)}`);
