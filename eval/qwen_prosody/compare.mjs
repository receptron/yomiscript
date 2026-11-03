// An open (not blind) comparison, to point at what sounds wrong: each sentence as Qwen spoke it, as the tools speak it
// now, and with the accent read from Qwen (abs.mjs), the marks of the last two shown beside them.
//   qwen  Qwen3-TTS (the clone) itself
//   now   the tools as shipped: the D31 marks, the D29 values
//   abs   the marks read from Qwen's pitch of that sentence, the values of the model fitted to Qwen
// The 12 sentences of eval/qwen3_tts and the 12 of the test half that listen.mjs uses (the marks of those come from
// work/abs.json).
// usage: node compare.mjs   (after abs.mjs and fit.py)   -> audio/compare/<variant>/<set>.<name>.wav, listen.json;
//        serve eval/ and open blind.html?test=qwen_prosody&run=compare&open
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { realize } from "@yomiscript/core";
import { ACCENT_SCALE, accentMarks, accentYomite } from "@yomiscript/ja-accent";
import { nodeAnalyzer } from "@yomiscript/ja-accent/node";
import * as K from "@yomiscript/kokoro";
import { nodeEngine } from "@yomiscript/kokoro/node";
import { originalText } from "yomiscript";
import { readWav, writeLevelled } from "../blind_audio.mjs";
import { readAccent } from "./abs.mjs";
import { jsutPick } from "./listen.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const QWEN3 = path.join(HERE, "../qwen3_tts");
const OUT = path.join(HERE, "audio/compare");
const CACHE = path.join(process.env.HOME, ".cache/yomiscript");

const A = await nodeAnalyzer({ dir: path.join(CACHE, "ja-dict", fs.readdirSync(path.join(CACHE, "ja-dict"))[0]) }),
  E = await nodeEngine({ dir: path.join(CACHE, "kokoro") }),
  model = JSON.parse(fs.readFileSync(path.join(HERE, "work/fit.json"), "utf8")),
  measured = JSON.parse(fs.readFileSync(path.join(QWEN3, "audio/transplant/measured.json"), "utf8")),
  read = JSON.parse(fs.readFileSync(path.join(HERE, "work/abs.json"), "utf8")),
  shipped = accentYomite(A),
  speech = (ys) => E.synth(ys).then((r) => ({ samples: r.audio, sampleRate: K.SR })),
  marks = (ys) => {
    // the IPA and the marks between the slashes, without the <…> of the values and the text
    let bare = "",
      depth = 0;
    for (const c of ys) {
      if (c === "<") depth++;
      else if (c === ">") depth--;
      else if (!depth) bare += c;
    }
    return bare.slice(bare.indexOf("/") + 1, bare.lastIndexOf("/"));
  };

const sentences = [
  ...JSON.parse(fs.readFileSync(path.join(QWEN3, "texts.json"), "utf8")).map(({ name, ys }) => ({
    set: "ja",
    name,
    ys,
    absYs: readAccent(ys, measured[name].values, model, A).ys,
    qwen: path.join(QWEN3, "audio/raw/clone", `${name}.wav`),
  })),
  ...jsutPick().map(({ name, ys }) => ({ set: "jsut", name, ys, absYs: read[name].ys, qwen: path.join(HERE, "work/audio", `${name}.wav`) })),
];
const items = [];
for (const s of sentences) {
  const id = `${s.set}.${s.name}`,
    now = shipped(s.ys);
  writeLevelled(OUT, "qwen", id, readWav(s.qwen));
  writeLevelled(OUT, "now", id, await speech(now));
  writeLevelled(OUT, "abs", id, await speech(realize(s.absYs, { markedOnly: true, jaScale: ACCENT_SCALE, jaModel: model })));
  items.push({ set: s.set, name: s.name, text: originalText(s.ys), detail: { now: marks(accentMarks(s.ys, A)), abs: marks(s.absYs) } });
  console.log(id);
}
fs.writeFileSync(
  path.join(OUT, "listen.json"),
  JSON.stringify({ test: "qwen_prosody_compare", title: "Qwen, now, and the accent read from Qwen", variants: ["qwen", "now", "abs"], items }, null, 1),
);
