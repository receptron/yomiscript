// The pitch model against the linear model, on the same accents. Blind: qwen (the published pitch model) against linear (the values of
// D28 and D29, from the marks alone), both from the dictionary's marks in this checkout, with Kokoro, on short sentences frozen before
// listening: words whose fall the maintainer has named, and others. It asks whether the fall is heard where it is written and which
// sounds more natural. The marks are checked to be the same on both sides. Two sentences are repeated, the sides the other way round.
// usage: node model_listen.mjs   -> audio/model/; serve eval/ and open blind.html?test=qwen_prosody&run=model
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { accentYomite, pitchYomite } from "@yomiscript/ja-accent";
import { nodeAnalyzer, nodePitchModel } from "@yomiscript/ja-accent/node";
import * as K from "@yomiscript/kokoro";
import { nodeEngine } from "@yomiscript/kokoro/node";
import { originalText } from "yomiscript";
import { writeLevelled } from "../blind_audio.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "audio/model"),
  CACHE = path.join(process.env.HOME, ".cache/yomiscript");
const SENTENCES = [
  "ja /ɾʲoːhoː<t:両方> | kaneteɾɯ<t:兼ねてる。> ↘/",
  "ja /ɸɯmbetsɯ<t:分別> o<t:を> | motsɯ<t:持つ> beki<t:べき> da<t:だ。> ↘/",
  "ja /hoɴ<t:本> o<t:を> | motteɾɯ<t:持ってる。> ↘/",
  "ja /ɡohaɴ<t:ご飯> o<t:を> | tabete<t:食べて> | neɾɯ<t:寝る。> ↘/",
  "ja /kitte<t:切手> o<t:を> | atsɯmete<t:集めて> | iɾɯ<t:いる。> ↘/",
  "ja /kotoba<t:言葉> o<t:を> | ɕiɾabete<t:調べて> | kakɯ<t:書く。> ↘/",
  "ja /soto<t:外> ɲi<t:に> | deteɾɯ<t:出てる。> ↘/",
  "ja /kodomo<t:子供> ɡa<t:が> | neteɾɯ<t:寝てる。> ↘/",
  "ja /moː<t:もう> | neteɾɯ<t:寝てる。> ↘/",
  "ja /kasa<t:傘> o<t:を> | saɕite<t:差して> | aɾɯkɯ<t:歩く。> ↘/",
  "ja /bokɯ<t:ぼく> mo<t:も> | soː<t:そう> da<t:だ。> ↘/",
  "ja /sate<t:さて> ‖<t:、> jamanekokeɴ<t:山猫軒> ↘/",
];
// blind.html: the side that comes first at place k
const firstSide = (k) => (k * 5 + Math.floor(k / 2)) % 2;
const marksOf = (ys) => ys.replaceAll(/<[a-z0-9]+:[^>]*>/g, "");

/** the sentences in order, then two again, each at a place where its sides are the other way round */
function listing(items) {
  const page = [...items];
  for (const it of items) {
    if (page.length === items.length + 2) break;
    if (firstSide(page.length) !== firstSide(items.indexOf(it))) page.push({ ...it, name: `${it.name}r`, of: it.name });
  }
  return page;
}

async function main() {
  const A = await nodeAnalyzer({ dir: path.join(CACHE, "ja-dict", fs.readdirSync(path.join(CACHE, "ja-dict"))[0]) }),
    E = await nodeEngine({ dir: path.join(CACHE, "kokoro") }),
    qwen = pitchYomite(A, await nodePitchModel({ dir: path.join(CACHE, "ja-pitch/qwen-2") })),
    linear = accentYomite(A),
    speak = async (ys) => {
      const P = K.plan(ys);
      if (P.length !== 1) throw new Error(`${P.length} sections: ${ys}`);
      return { samples: (await E.synthSection(P[0])).audio, sampleRate: K.SR };
    },
    items = [];
  for (const [i, ys] of SENTENCES.entries()) {
    const [a, b] = [qwen(ys), linear(ys)],
      name = `m${i + 1}`;
    if (marksOf(a) !== marksOf(b)) throw new Error(`other marks: ${marksOf(a)} / ${marksOf(b)}`);
    writeLevelled(OUT, "qwen", `model.${name}`, await speak(a));
    writeLevelled(OUT, "linear", `model.${name}`, await speak(b));
    items.push({ set: "model", name, text: originalText(ys), marks: marksOf(a) });
    console.log(name, originalText(ys), "|", marksOf(a));
  }
  const page = listing(items);
  for (const it of page.filter((x) => x.of)) {
    for (const v of ["qwen", "linear"]) fs.copyFileSync(path.join(OUT, v, `model.${it.of}.wav`), path.join(OUT, v, `model.${it.name}.wav`));
  }
  fs.writeFileSync(
    path.join(OUT, "listen.json"),
    JSON.stringify({ test: "qwen_prosody_model", title: "ピッチモデルと線形モデル", variants: ["qwen", "linear"], items: page }, null, 1),
  );
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
