// A blind A/B listening test: Claude's YomiScript spoken by the Kokoro Katarite as the tools ship it (fp32, the
// dictionary accent of D25) and by Audio8 0.1B (kana for every word with kanji, the voice cloned from Kokoro's
// Japanese voice, made by audio8.py --ys claude kanji --voice kokoro). The same reading on both sides.
// The 18 sentences of the accent trial (eval/browser_tts/trials/accent_marks), so the two tests can be read together.
// Both sides are brought to the same loudness (../blind_audio.mjs).
// usage: node blind.mjs   -> audio/blind/<variant>/<set>.<name>.wav and audio/blind/listen.json; serve eval/ and
//        open blind.html?test=audio8
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { openKatarite, originalText } from "yomiscript";
import { readWav, writeLevelled } from "../blind_audio.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BROWSER_TTS = path.join(HERE, "../browser_tts");
const OUT = path.join(HERE, "audio/blind");
const PICK = {
  hard: ["h001", "h004", "h007", "h011", "h012", "h017", "h020", "h021", "h024", "h025", "h026", "h031"],
  ja: ["plain", "comma", "ka_question", "geminate", "two_sentences", "kanji_names"],
};
const AUDIO8 = path.join(BROWSER_TTS, "audio/audio8_ys_claude_kanji_kokoro");

const kokoro = await openKatarite("kokoro");
const items = [];
for (const [set, names] of Object.entries(PICK)) {
  const ys = JSON.parse(fs.readFileSync(path.join(BROWSER_TTS, `results/claude.${set}.json`), "utf8")).output;
  for (const name of names) {
    const id = `${set}.${name}`;
    writeLevelled(OUT, "kokoro", id, await kokoro.speak(ys[name]));
    writeLevelled(OUT, "audio8", id, readWav(path.join(AUDIO8, `${id}.wav`)));
    items.push({ set, name, text: originalText(ys[name]) });
    console.log(id);
  }
}
fs.writeFileSync(
  path.join(OUT, "listen.json"),
  JSON.stringify({ test: "kokoro_vs_audio8", title: "Kokoro vs Audio8", variants: ["kokoro", "audio8"], items }, null, 1),
);
console.log(`${items.length} sentences -> ${path.relative(HERE, OUT)}`);
