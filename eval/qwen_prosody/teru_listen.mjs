// Does the fix for the auxiliary てる / でる (D36) sound better? Blind: current (the published @yomiscript/ja-accent 0.1.4) against
// fixed (this checkout), both with the published pitch model and Kokoro, on short sentences written for this test and frozen before
// listening. CASES have てる or でる, both verbs with a fall and verbs with none (呼んでる, 盛ってる). CONTROLS do not change, and have one
// recording on both sides, to show whether a difference is heard where there is none. Two cases are repeated, the sides the other
// way round. Going on takes more cases preferring fixed than current, no more unnatural than current, controls heard as the same,
// and repeats that agree.
// usage: put the package in work/old (npm pack @yomiscript/ja-accent@0.1.4, untar); node teru_listen.mjs
//        -> audio/teru/; serve eval/ and open blind.html?test=qwen_prosody&run=teru
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pitchYomite } from "@yomiscript/ja-accent";
import { nodeAnalyzer, nodePitchModel } from "@yomiscript/ja-accent/node";
import * as K from "@yomiscript/kokoro";
import { nodeEngine } from "@yomiscript/kokoro/node";
import { originalText } from "yomiscript";
import { writeLevelled } from "../blind_audio.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "audio/teru"),
  CACHE = path.join(process.env.HOME, ".cache/yomiscript");
const CASES = [
  "ja /haha<t:母> ɡa<t:が> | jondeɾɯ<t:呼んでる。> ↘/",
  "ja /daɾeka<t:誰か> ɡa<t:が> | jondeɾɯ<t:呼んでる。> ↘/",
  "ja /ɡohaɴ<t:ご飯> o<t:を> | motteɾɯ<t:盛ってる。> ↘/",
  "ja /hanaɕi<t:話> o<t:を> | motteɾɯ<t:盛ってる。> ↘/",
  "ja /hoɴ<t:本> o<t:を> | motteɾɯ<t:持ってる。> ↘/",
  "ja /hoɴ<t:本> o<t:を> | jondeɾɯ<t:読んでる。> ↘/",
  "ja /teɡami<t:手紙> o<t:を> | kaiteɾɯ<t:書いてる。> ↘/",
  "ja /teɾebi<t:テレビ> o<t:を> | miteɾɯ<t:見てる。> ↘/",
  "ja /tomodatɕi<t:友達> to<t:と> | hanaɕiteɾɯ<t:話してる。> ↘/",
  "ja /moː<t:もう> | neteɾɯ<t:寝てる。> ↘/",
];
const CONTROLS = ["ja /hoɴ<t:本> o<t:を> | jomɯ<t:読む。> ↘/", "ja /teɡami<t:手紙> o<t:を> | kakɯ<t:書く。> ↘/"];
// the page's order, fixed before listening; blind.html has its two sides the other way round at positions 0 and 13, and at 1 and 12
const ORDER = [0, 4, 7, 2, 10, 5, 8, 1, 6, 11, 3, 9, 4, 0];

/** the YomiScript without what is in < > */
const bare = (ys) =>
  ys
    .split("<")
    .map((part, i) => (i ? part.slice(part.indexOf(">") + 1) : part))
    .join("");

async function main() {
  const { pitchYomite: published } = await import(path.join(HERE, "work/old/package/dist/index.js")),
    A = await nodeAnalyzer({ dir: path.join(CACHE, "ja-dict", fs.readdirSync(path.join(CACHE, "ja-dict"))[0]) }),
    E = await nodeEngine({ dir: path.join(CACHE, "kokoro") }),
    model = await nodePitchModel({ dir: path.join(CACHE, "ja-pitch/qwen-2") }),
    [current, fixed] = [published(A, model), pitchYomite(A, model)],
    all = [...CASES, ...CONTROLS],
    speak = async (ys) => {
      const P = K.plan(ys);
      if (P.length !== 1) throw new Error(`${P.length} sections: ${ys}`);
      return { samples: (await E.synthSection(P[0])).audio, sampleRate: K.SR };
    };
  for (const [i, ys] of all.entries()) {
    const [a, b] = [current(ys), fixed(ys)],
      id = `teru.t${i + 1}`,
      before = await speak(a);
    if ((a === b) !== i >= CASES.length) throw new Error(`t${i + 1} is not what it should be: ${a} / ${b}`);
    writeLevelled(OUT, "current", id, before);
    writeLevelled(OUT, "fixed", id, a === b ? before : await speak(b));
    console.log(`t${i + 1}`, originalText(ys), "|", bare(a), "|", bare(b));
  }
  const seen = new Set(),
    items = ORDER.map((i) => {
      const name = seen.has(i) ? `t${i + 1}r` : `t${i + 1}`;
      seen.add(i);
      return { set: "teru", name, text: originalText(all[i]), kind: i < CASES.length ? "case" : "control" };
    });
  // a repeat has its own name, because the page keeps one answer per name; its audio is the first one's
  for (const it of items.filter((x) => x.name.endsWith("r")))
    for (const v of ["current", "fixed"]) fs.copyFileSync(path.join(OUT, v, `teru.${it.name.slice(0, -1)}.wav`), path.join(OUT, v, `teru.${it.name}.wav`));
  fs.writeFileSync(
    path.join(OUT, "listen.json"),
    JSON.stringify({ test: "qwen_prosody_teru", title: "The auxiliary てる / でる", variants: ["current", "fixed"], items }, null, 1),
  );
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
