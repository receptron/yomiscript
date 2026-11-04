// A blind test of the direct pitch model on several sentences as one utterance, which it was not trained on and which
// is how YomiScript writes them (D33). Six passages of four test-half sentences, none of them in listen.mjs's pick:
//   tools   the dictionary accent as the tools run it now (accentYomite)
//   direct  the predicted values, the passage read by the model as one section (pitchYomite)
//   alone   the predicted values, each sentence read by the model alone, then joined
// usage: node pitch_listen_long.mjs   -> audio/long/<variant>/jsut.<name>.wav, listen.json, results/pitch_long.json;
//        serve eval/ and open blind.html?test=qwen_prosody&run=long
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parse } from "@yomiscript/core";
import { accentYomite, pitchYomite } from "@yomiscript/ja-accent";
import { nodeAnalyzer, nodePitchModel } from "@yomiscript/ja-accent/node";
import * as K from "@yomiscript/kokoro";
import { nodeEngine } from "@yomiscript/kokoro/node";
import { originalText } from "yomiscript";
import { writeLevelled } from "../blind_audio.mjs";
import { jsutPick } from "./listen.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "audio/long");
const CACHE = path.join(process.env.HOME, ".cache/yomiscript");
const PASSAGES = 6,
  SENTENCES = 4;

const A = await nodeAnalyzer({ dir: path.join(CACHE, "ja-dict", fs.readdirSync(path.join(CACHE, "ja-dict"))[0]) }),
  E = await nodeEngine({ dir: path.join(CACHE, "kokoro") }),
  tools = accentYomite(A),
  direct = pitchYomite(A, await nodePitchModel({ dir: path.join(HERE, "work/pitch_model") })),
  phrased = JSON.parse(fs.readFileSync(path.join(HERE, "work/phrased.json"), "utf8")),
  speech = (ys) => E.synth(ys).then((r) => ({ samples: r.audio, sampleRate: K.SR }));

const inner = (ys) => ys.replace(/^ja \//, "").replace(/\/$/, ""),
  join = (list) => `ja /${list.map(inner).join(" ")}/`,
  values = (ys) =>
    parse(ys)
      .sections[0].toks.filter((t) => t.kind === "unit")
      .flatMap((t) => t.f0 ?? []);

const picked = new Set(jsutPick().map((x) => x.name)),
  test = Object.keys(phrased).filter((n) => Number(n.split("_")[1]) % 2 === 1 && !picked.has(n)),
  step = Math.floor(test.length / PASSAGES);

const items = [],
  stats = [];
for (let p = 0; p < PASSAGES; p++) {
  const list = test.slice(p * step, p * step + SENTENCES).map((n) => phrased[n]),
    whole = join(list),
    name = `passage${p + 1}`,
    id = `jsut.${name}`,
    together = direct(whole),
    apart = join(list.map(direct)),
    a = values(together),
    b = values(apart);
  if (a.length !== b.length) throw new Error(`${name}: ${a.length} values and ${b.length}`);
  stats.push({
    name,
    values: a.length,
    rms_together_vs_apart: +Math.sqrt(a.reduce((s, x, i) => s + (x - b[i]) ** 2, 0) / a.length).toFixed(3),
    lowest: Math.min(...a),
    highest: Math.max(...a),
  });
  writeLevelled(OUT, "tools", id, await speech(tools(whole)));
  writeLevelled(OUT, "direct", id, await speech(together));
  writeLevelled(OUT, "alone", id, await speech(apart));
  items.push({ set: "jsut", name, text: originalText(whole) });
  console.log(id, stats.at(-1));
}
fs.writeFileSync(
  path.join(OUT, "listen.json"),
  JSON.stringify({ test: "qwen_prosody_long", title: "Direct pitch on several sentences", variants: ["tools", "direct", "alone"], items }, null, 1),
);
fs.writeFileSync(path.join(HERE, "results/pitch_long.json"), JSON.stringify(stats, null, 1) + "\n");
