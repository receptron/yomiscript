// A blind test of the direct pitch model (pitch.py) as the tools run it (pitchYomite), on the 12 test-half sentences
// listen.mjs picks, in the LLM's accent phrases:
//   qwen    Qwen3-TTS (the clone) itself
//   start   the dictionary's nuclei, the values of the model fitted to Qwen (what the direct model adds to)
//   abs     the nuclei read from Qwen's pitch of that sentence, the same values
//   direct  the predicted values, from the text alone
// usage: node pitch_listen.mjs   -> audio/direct/<variant>/jsut.<name>.wav, listen.json;
//        serve eval/ and open blind.html?test=qwen_prosody&run=direct
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { realize } from "@yomiscript/core";
import { ACCENT_SCALE, pitchYomite } from "@yomiscript/ja-accent";
import { nodeAnalyzer, nodePitchModel } from "@yomiscript/ja-accent/node";
import * as K from "@yomiscript/kokoro";
import { nodeEngine } from "@yomiscript/kokoro/node";
import { originalText } from "yomiscript";
import { readWav, writeLevelled } from "../blind_audio.mjs";
import { withNucleiOf } from "./abs.mjs";
import { jsutPick } from "./listen.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "audio/direct");
const CACHE = path.join(process.env.HOME, ".cache/yomiscript");
const read = (f) => JSON.parse(fs.readFileSync(path.join(HERE, f), "utf8"));

const A = await nodeAnalyzer({ dir: path.join(CACHE, "ja-dict", fs.readdirSync(path.join(CACHE, "ja-dict"))[0]) }),
  E = await nodeEngine({ dir: path.join(CACHE, "kokoro") }),
  model = read("work/fit.json"),
  abs = read("work/abs_phrased.json"),
  phrased = read("work/phrased.json"),
  direct = pitchYomite(A, await nodePitchModel({ dir: path.join(HERE, "work/pitch_model") })),
  speech = (ys) => E.synth(ys).then((r) => ({ samples: r.audio, sampleRate: K.SR })),
  values = (ys) => realize(ys, { markedOnly: true, jaScale: ACCENT_SCALE, jaModel: model });

const items = [];
for (const { name } of jsutPick()) {
  const r = abs[name],
    id = `jsut.${name}`,
    start = withNucleiOf(
      r.ys,
      r.d31.filter((k) => k !== null),
      A,
    );
  writeLevelled(OUT, "qwen", id, readWav(path.join(HERE, "work/audio", `${name}.wav`)));
  writeLevelled(OUT, "start", id, await speech(values(start)));
  writeLevelled(OUT, "abs", id, await speech(values(r.ys)));
  writeLevelled(OUT, "direct", id, await speech(direct(phrased[name])));
  items.push({ set: "jsut", name, text: originalText(r.ys) });
  console.log(id);
}
fs.writeFileSync(
  path.join(OUT, "listen.json"),
  JSON.stringify({ test: "qwen_prosody_direct", title: "Direct pitch from the text", variants: ["qwen", "start", "abs", "direct"], items }, null, 1),
);
