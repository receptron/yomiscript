// A blind A/B test of the refit: the tools' pipeline (D31 marks, values for the marked phrases only, Kokoro fp32)
// with the shipped pitch model (d29) and with the coefficients fitted to Qwen (refit, work/fit.json). The 12 sentences
// of eval/qwen3_tts (not JSUT, so never fitted on) and 12 of the test half (odd JSUT ids, never fitted on either).
// usage: node listen.mjs   -> audio/listen/<variant>/<set>.<name>.wav, audio/listen/listen.json;
//        serve eval/ and open blind.html?test=qwen_prosody&run=listen
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { realize } from "@yomiscript/core";
import { ACCENT_SCALE, accentMarks, accentYomite } from "@yomiscript/ja-accent";
import { nodeAnalyzer } from "@yomiscript/ja-accent/node";
import * as K from "@yomiscript/kokoro";
import { nodeEngine } from "@yomiscript/kokoro/node";
import { originalText } from "yomiscript";
import { writeLevelled } from "../blind_audio.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "audio/listen");
const CACHE = path.join(process.env.HOME, ".cache/yomiscript");
const JSUT_PICK = 12;

const A = await nodeAnalyzer({ dir: path.join(CACHE, "ja-dict", fs.readdirSync(path.join(CACHE, "ja-dict"))[0]) }),
  E = await nodeEngine({ dir: path.join(CACHE, "kokoro") }),
  model = JSON.parse(fs.readFileSync(path.join(HERE, "work/fit.json"), "utf8"));
const shipped = accentYomite(A),
  refit = (ys) => {
    const marked = accentMarks(ys, A);
    return marked === ys ? ys : realize(marked, { markedOnly: true, jaScale: ACCENT_SCALE, jaModel: model });
  };

function sentences() {
  const ours = JSON.parse(fs.readFileSync(path.join(HERE, "../qwen3_tts/texts.json"), "utf8")).map((x) => ({ set: "ja", ...x }));
  const test = fs
    .readFileSync(path.join(HERE, "data/jsut_qwen_clone.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l))
    .filter((r) => Number(r.name.split("_")[1]) % 2 === 1);
  const step = Math.floor(test.length / JSUT_PICK); // evenly spaced through the test half
  return [...ours, ...Array.from({ length: JSUT_PICK }, (_, i) => ({ set: "jsut", name: test[i * step].name, ys: test[i * step].ys }))];
}

const items = [];
for (const { set, name, ys } of sentences()) {
  const id = `${set}.${name}`;
  for (const [variant, step] of [
    ["d29", shipped],
    ["refit", refit],
  ])
    writeLevelled(OUT, variant, id, { samples: (await E.synth(step(ys))).audio, sampleRate: K.SR });
  items.push({ set, name, text: originalText(ys) });
  console.log(id);
}
fs.writeFileSync(
  path.join(OUT, "listen.json"),
  JSON.stringify({ test: "qwen_prosody_refit", title: "Pitch model fitted to Qwen", variants: ["d29", "refit"], items }, null, 1),
);
