// A blind test of the accent read from Qwen (abs.mjs) on the 12 sentences of eval/qwen3_tts (never fitted on):
//   d29         the tools as shipped (D31 marks, D29 values)
//   abs         the marks read from Qwen's pitch of that sentence, with the values of the model fitted to Qwen
//   qwen_pitch  Qwen's own pitch as values (eval/qwen3_tts's kokoro_f0, the side that beat D29 in 9 of 11)
// If abs is heard as good as qwen_pitch, the marks carry what was heard, and a Yomite that writes them (a dictionary,
// rules) is worth learning from the marks read on the 2,503 sentences.
// usage: node abs_listen.mjs   (after eval/qwen3_tts's transplant.mjs render pitch_ab, and fit.py)
//        -> audio/abs/<variant>/ja.<name>.wav, listen.json; serve eval/ and open blind.html?test=qwen_prosody&run=abs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { realize } from "@yomiscript/core";
import { ACCENT_SCALE, accentYomite } from "@yomiscript/ja-accent";
import { nodeAnalyzer } from "@yomiscript/ja-accent/node";
import * as K from "@yomiscript/kokoro";
import { nodeEngine } from "@yomiscript/kokoro/node";
import { originalText } from "yomiscript";
import { readWav, writeLevelled } from "../blind_audio.mjs";
import { readAccent } from "./abs.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const QWEN3 = path.join(HERE, "../qwen3_tts");
const OUT = path.join(HERE, "audio/abs");
const CACHE = path.join(process.env.HOME, ".cache/yomiscript");

const A = await nodeAnalyzer({ dir: path.join(CACHE, "ja-dict", fs.readdirSync(path.join(CACHE, "ja-dict"))[0]) }),
  E = await nodeEngine({ dir: path.join(CACHE, "kokoro") }),
  model = JSON.parse(fs.readFileSync(path.join(HERE, "work/fit.json"), "utf8")),
  measured = JSON.parse(fs.readFileSync(path.join(QWEN3, "audio/transplant/measured.json"), "utf8")),
  shipped = accentYomite(A),
  speech = (ys) => E.synth(ys).then((r) => ({ samples: r.audio, sampleRate: K.SR }));

const items = [],
  report = {};
for (const { name, ys } of JSON.parse(fs.readFileSync(path.join(QWEN3, "texts.json"), "utf8"))) {
  const id = `ja.${name}`,
    x = readAccent(ys, measured[name].values, model, A);
  writeLevelled(OUT, "d29", id, await speech(shipped(ys)));
  writeLevelled(OUT, "abs", id, await speech(realize(x.ys, { markedOnly: true, jaScale: ACCENT_SCALE, jaModel: model })));
  writeLevelled(OUT, "qwen_pitch", id, readWav(path.join(QWEN3, "audio/pitch_ab/kokoro_f0", `${id}.wav`)));
  items.push({ set: "ja", name, text: originalText(ys) });
  report[name] = { d31: x.d31, abs: x.abs, marks: x.ys.replace(/<t:[^>]*>/g, ""), before: x.before, after: x.after };
  console.log(name, x.d31.join(","), "->", x.abs.join(","), x.ys.replace(/<t:[^>]*>/g, ""));
}
fs.writeFileSync(path.join(OUT, "marks.json"), JSON.stringify(report, null, 1));
fs.writeFileSync(
  path.join(OUT, "listen.json"),
  JSON.stringify({ test: "qwen_prosody_abs", title: "Accent read from Qwen", variants: ["d29", "abs", "qwen_pitch"], items }, null, 1),
);
