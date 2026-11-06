// The adverb そう falling after ソ (D40), against no fall as NAIST-JDIC has it. Blind: current (the dictionary before, built into work/main_pkg) against
// fixed (this checkout), with the published pitch model and Kokoro, on sentences frozen before listening: those of the story the listener marked
// as rising at the end, others with そう, and controls with the そう of 降りそう, which do not change and have one recording on both sides. Two
// sentences are repeated, the sides the other way round.
// usage: build the previous code into work/main_pkg; node sou_listen.mjs   -> audio/sou/; serve eval/ and open blind.html?test=qwen_prosody&run=sou
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
const OUT = path.join(HERE, "audio/sou"),
  CACHE = path.join(process.env.HOME, ".cache/yomiscript"),
  DICT = path.join(CACHE, "ja-dict", fs.readdirSync(path.join(CACHE, "ja-dict"))[0]);
const story = JSON.parse(fs.readFileSync(path.join(HERE, "../../demo/ys_web/web/aozora/chumon.json"), "utf8")).paragraphs.flatMap((p) => p.sentences);
const CASES = [
  story[23].ys, // ぼくもそうだ
  story[71].ys, // それあそうだ
  story[122].ys, // そうだ
  story[79].ys, // そうだろう
  story[53].ys, // どうもそうらしい
  "ja /soː<t:そう> desɯ<t:です。> ↘/",
  "ja /soː<t:そう> ka<t:か。> ↘/",
];
const CONTROLS = ["ja /ame<t:雨> ɡa<t:が> | ɸɯɾisoː<t:降りそう> da<t:だ。> ↘/", "ja /ima<t:今> ɲi<t:に> mo<t:も> | naki<t:泣き> soː<t:そう> da<t:だ。> ↘/"];
// blind.html: the side that comes first at place k
const firstSide = (k) => (k * 5 + Math.floor(k / 2)) % 2;
const bare = (ys) =>
  ys
    .split("<")
    .map((part, i) => (i ? part.slice(part.indexOf(">") + 1) : part))
    .join("");

/** the items in order, then two cases again, each at a place where its sides are the other way round */
function listing(items) {
  const page = [...items];
  for (const it of items.filter((x) => x.kind === "case")) {
    if (page.length === items.length + 2) break;
    if (firstSide(page.length) !== firstSide(items.indexOf(it))) page.push({ ...it, name: `${it.name}r`, of: it.name });
  }
  return page;
}

async function main() {
  const { pitchYomite: previous } = await import(path.join(HERE, "work/main_pkg/dist/index.js")),
    { nodeAnalyzer: previousAnalyzer } = await import(path.join(HERE, "work/main_pkg/dist/node.js")),
    E = await nodeEngine({ dir: path.join(CACHE, "kokoro") }),
    model = await nodePitchModel({ dir: path.join(CACHE, "ja-pitch/qwen-2") }),
    current = previous(await previousAnalyzer({ dir: DICT }), model),
    fixed = pitchYomite(await nodeAnalyzer({ dir: DICT }), model),
    speak = async (ys) => {
      const P = K.plan(ys);
      if (P.length !== 1) throw new Error(`${P.length} sections: ${ys}`);
      return { samples: (await E.synthSection(P[0])).audio, sampleRate: K.SR };
    },
    items = [];
  for (const [i, ys] of [...CASES, ...CONTROLS].entries()) {
    const [a, b] = [current(ys), fixed(ys)],
      name = `s${i + 1}`,
      id = `sou.${name}`,
      kind = i < CASES.length ? "case" : "control";
    console.log(name, kind, originalText(ys), "|", bare(a), "|", bare(b), a === b ? "SAME" : "");
    if ((a === b) !== (kind === "control")) throw new Error(`${name} is not what it should be`);
    const before = await speak(a);
    writeLevelled(OUT, "current", id, before);
    writeLevelled(OUT, "fixed", id, a === b ? before : await speak(b));
    items.push({ set: "sou", name, text: originalText(ys), kind });
  }
  const page = listing(items);
  for (const it of page.filter((x) => x.of))
    for (const v of ["current", "fixed"]) fs.copyFileSync(path.join(OUT, v, `sou.${it.of}.wav`), path.join(OUT, v, `sou.${it.name}.wav`));
  fs.writeFileSync(
    path.join(OUT, "listen.json"),
    JSON.stringify({ test: "qwen_prosody_sou", title: "そう：平板と ソ\\ー", variants: ["current", "fixed"], items: page }, null, 1),
  );
  console.log(page.map((x) => x.name).join(" "));
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
