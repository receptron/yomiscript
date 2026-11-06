// Is what makes Qwen's sentence ends better in the pitch values? Blind: current (the tools as they are), qwen_end (the same with the last two
// morae given Qwen's measured pitch), qwen_all (every mora given Qwen's measured pitch) and qwen (Qwen's clone), on the short sentences of
// end_listen.mjs that Qwen read right. Two sentences are repeated in another order of the sides.
// usage: after end_listen.mjs, with Qwen measured into work/end_prep.json and work/end_measured.json (eval/qwen3_tts/measure.py);
//        node end_transplant_listen.mjs   -> audio/end2/; serve eval/ and open blind.html?test=qwen_prosody&run=end2
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { applyEdits, f0Mark, parse } from "@yomiscript/core";
import { pitchYomite } from "@yomiscript/ja-accent";
import { nodeAnalyzer, nodePitchModel } from "@yomiscript/ja-accent/node";
import * as K from "@yomiscript/kokoro";
import { nodeEngine } from "@yomiscript/kokoro/node";
import { readWav, writeLevelled } from "../blind_audio.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => JSON.parse(fs.readFileSync(path.join(HERE, f), "utf8"));
const OUT = path.join(HERE, "audio/end2"),
  CACHE = path.join(process.env.HOME, ".cache/yomiscript"),
  VARIANTS = ["current", "qwen_end", "qwen_all", "qwen"],
  MISREAD_BY_QWEN = new Set(["e35"]);

/** the marked YomiScript with Qwen's values on every mora that has them */
function allFromQwen(marked, values) {
  const units = parse(marked).sections[0].toks.filter((t) => t.kind === "unit");
  if (units.length !== values.length) throw new Error(`${values.length} values for ${units.length} units`);
  return applyEdits(
    marked,
    units.flatMap((t, i) => (values[i] ? [{ at: t.end, ins: f0Mark(values[i]) }] : [])),
  );
}
/** the tools' YomiScript with the last two morae's values Qwen's, where it has them */
function endFromQwen(ys, values) {
  const found = [...ys.matchAll(/<f0:[^>]*>/g)];
  if (found.length !== values.length) throw new Error(`${values.length} values for ${found.length} units`);
  let out = ys;
  for (const i of [found.length - 1, found.length - 2]) {
    if (values[i]) out = `${out.slice(0, found[i].index)}${f0Mark(values[i])}${out.slice(found[i].index + found[i][0].length)}`;
  }
  return out;
}

// blind.html: the order of the sides at place k, an index into the 24 permutations
const orderAt = (k) => (k * 5 + Math.floor(k / 24)) % 24;

async function main() {
  const prep = read("work/end_prep.json").filter((x) => !MISREAD_BY_QWEN.has(x.name)),
    measured = read("work/end_measured.json"),
    story = read("../../demo/ys_web/web/aozora/chumon.json").paragraphs.flatMap((p) => p.sentences),
    A = await nodeAnalyzer({ dir: path.join(CACHE, "ja-dict", fs.readdirSync(path.join(CACHE, "ja-dict"))[0]) }),
    E = await nodeEngine({ dir: path.join(CACHE, "kokoro") }),
    step = pitchYomite(A, await nodePitchModel({ dir: path.join(CACHE, "ja-pitch/qwen-2") })),
    speak = async (ys) => {
      const P = K.plan(ys);
      if (P.length !== 1) throw new Error(`${P.length} sections: ${ys}`);
      return { samples: (await E.synthSection(P[0])).audio, sampleRate: K.SR };
    },
    items = [];
  for (const x of prep) {
    const values = measured[x.name].qwen.values,
      current = step(story[Number(x.name.slice(1)) - 1].ys),
      id = `end2.${x.name}`;
    writeLevelled(OUT, "current", id, await speak(current));
    writeLevelled(OUT, "qwen_end", id, await speak(endFromQwen(current, values)));
    writeLevelled(OUT, "qwen_all", id, await speak(allFromQwen(x.ys, values)));
    writeLevelled(OUT, "qwen", id, readWav(path.join(HERE, "work/end_qwen", `${x.name}.wav`)));
    items.push({ set: "end2", name: x.name, text: x.text });
  }
  const page = [...items];
  for (const it of items.slice(0, 2)) {
    if (orderAt(page.length) === orderAt(items.indexOf(it))) throw new Error("the same order of the sides");
    page.push({ ...it, name: `${it.name}r`, of: it.name });
    for (const v of VARIANTS) fs.copyFileSync(path.join(OUT, v, `end2.${it.name}.wav`), path.join(OUT, v, `end2.${it.name}r.wav`));
  }
  fs.writeFileSync(
    path.join(OUT, "listen.json"),
    JSON.stringify({ test: "qwen_prosody_end2", title: "文末：Qwen の高さを移す", variants: VARIANTS, items: page }, null, 1),
  );
  console.log(page.map((x) => x.name).join(" "));
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
