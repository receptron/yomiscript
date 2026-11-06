// Sentence ends heard as rising (ぼくもそうだ, それあそうだ, 山猫軒) and other short sentences of the story. Blind: current (the tools as they are),
// lowered (the same with the pitch of its last two morae lowered by a rule frozen before listening: the second to last by 0, 0.5, 1.5
// semitones, the last by 2, 3, 4) and qwen (Qwen's clone reading the text). Two sentences are repeated, in another order of the sides.
// usage: node end_listen.mjs --items; ../qwen3_tts/.venv/bin/python generate.py --items work/end_items.json --out work/end_qwen;
//        node end_listen.mjs   -> audio/end/; serve eval/ and open blind.html?test=qwen_prosody&run=end
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pitchYomite } from "@yomiscript/ja-accent";
import { nodeAnalyzer, nodePitchModel } from "@yomiscript/ja-accent/node";
import * as K from "@yomiscript/kokoro";
import { nodeEngine } from "@yomiscript/kokoro/node";
import { readWav, writeLevelled } from "../blind_audio.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "audio/end"),
  CACHE = path.join(process.env.HOME, ".cache/yomiscript"),
  // the first three were marked by the listener; the others are short sentences of the story ending in だ or です, or a noun
  PLACES = [24, 72, 35, 123, 64, 66, 91, 160],
  VARIANTS = ["current", "lowered", "qwen"],
  LOWER = [
    [0, 0.5, 1.5],
    [2, 3, 4],
  ];
const sentences = JSON.parse(fs.readFileSync(path.join(HERE, "../../demo/ys_web/web/aozora/chumon.json"), "utf8")).paragraphs.flatMap((p) => p.sentences);
const picked = PLACES.map((n) => ({ name: `e${n}`, ...sentences[n - 1] }));
const plainText = (t) => t.replaceAll(/[「」]/g, "");

/** the YomiScript with the pitch of its last two valued units lowered by LOWER */
function lowered(ys) {
  const found = [...ys.matchAll(/<f0:([^>]*)>/g)],
    lastTwo = found.slice(-2);
  let out = ys;
  for (const [k, m] of [...lastTwo.entries()].reverse()) {
    const values = m[1].split(",").map(Number),
      by = LOWER[k + LOWER.length - lastTwo.length];
    if (values.length !== 3) throw new Error(`expected three values: ${m[0]}`);
    const next = values.map((v, j) => +(v - by[j]).toFixed(2)).join(",");
    out = `${out.slice(0, m.index)}<f0:${next}>${out.slice(m.index + m[0].length)}`;
  }
  return out;
}

// blind.html: the order of the sides at place k, an index into the permutations of the three
const orderAt = (k) => (k * 5 + Math.floor(k / 6)) % 6;
/** the sentences, then the first two again, each at a place where the order of the sides is another */
function listing(items) {
  const page = [...items];
  for (const it of items) {
    if (page.length === items.length + 2) break;
    while (orderAt(page.length) === orderAt(items.indexOf(it))) page.push(items[(page.length * 3) % items.length]);
    page.push({ ...it, name: `${it.name}r`, of: it.name });
  }
  return page.filter((x, i) => page.findIndex((y) => y.name === x.name) === i);
}

async function main() {
  if (process.argv.includes("--items")) {
    fs.writeFileSync(path.join(HERE, "work/end_items.json"), JSON.stringify(picked.map((x) => ({ name: x.name, text: plainText(x.text) }))));
    return;
  }
  const A = await nodeAnalyzer({ dir: path.join(CACHE, "ja-dict", fs.readdirSync(path.join(CACHE, "ja-dict"))[0]) }),
    E = await nodeEngine({ dir: path.join(CACHE, "kokoro") }),
    step = pitchYomite(A, await nodePitchModel({ dir: path.join(CACHE, "ja-pitch/qwen-2") })),
    speak = async (ys) => {
      const P = K.plan(ys);
      if (P.length !== 1) throw new Error(`${P.length} sections: ${ys}`);
      return { samples: (await E.synthSection(P[0])).audio, sampleRate: K.SR };
    },
    items = [];
  for (const x of picked) {
    const id = `end.${x.name}`,
      ys = step(x.ys);
    writeLevelled(OUT, "current", id, await speak(ys));
    writeLevelled(OUT, "lowered", id, await speak(lowered(ys)));
    writeLevelled(OUT, "qwen", id, readWav(path.join(HERE, "work/end_qwen", `${x.name}.wav`)));
    items.push({ set: "end", name: x.name, text: x.text });
  }
  const page = listing(items);
  for (const it of page.filter((x) => x.of))
    for (const v of VARIANTS) fs.copyFileSync(path.join(OUT, v, `end.${it.of}.wav`), path.join(OUT, v, `end.${it.name}.wav`));
  fs.writeFileSync(
    path.join(OUT, "listen.json"),
    JSON.stringify({ test: "qwen_prosody_end", title: "文末：今の版、語尾を下げた版、Qwen", variants: VARIANTS, items: page }, null, 1),
  );
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
