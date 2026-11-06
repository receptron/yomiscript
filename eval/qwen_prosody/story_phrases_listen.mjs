// The story with the dictionary's accent phrases instead of the LLM's, and ぴかぴか falling on its first mora like くるくる. Blind: current
// (the sentence as 青空朗読文庫 has it, with the LLM's ` | `) against dict (without them), with the published pitch model and Kokoro, on
// consecutive sentences in order. A sentence the change leaves as it is has one recording on both sides, as a control. The listener
// marks only what sounds wrong. Two sentences that differ are repeated at the end, the sides the other way round.
// usage: node story_phrases_listen.mjs [first sentence, from 0] [count]   -> audio/story_phrases/;
//        serve eval/ and open blind.html?test=qwen_prosody&run=story_phrases
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
const OUT = path.join(HERE, "audio/story_phrases"),
  CACHE = path.join(process.env.HOME, ".cache/yomiscript"),
  STORY = path.join(HERE, "../../demo/ys_web/web/aozora/chumon.json");
const withoutPhrases = (ys) => ys.replaceAll(" | ", " ");
const source = (e) => (e.surface === "ぴかぴか" ? { a: 1 } : undefined);
// blind.html: which side comes first at place k
const firstSide = (k) => (k * 5 + Math.floor(k / 2)) % 2;
const bare = (ys) =>
  ys
    .split("<")
    .map((part, i) => (i ? part.slice(part.indexOf(">") + 1) : part))
    .join("");

/** the sentences in order, then two that differ again, each at a place where its sides are the other way round */
function listing(items) {
  const out = [...items];
  for (const it of items.filter((x) => x.differs)) {
    if (out.length === items.length + 2) break;
    if (firstSide(out.length) !== firstSide(items.indexOf(it))) out.push({ ...it, name: `${it.name}r`, of: it.name });
  }
  return out;
}

async function main() {
  const first = Number(process.argv[2] ?? 0),
    count = Number(process.argv[3] ?? 10),
    sentences = JSON.parse(fs.readFileSync(STORY, "utf8"))
      .paragraphs.flatMap((p) => p.sentences.map((x) => x.ys))
      .slice(first, first + count),
    A = await nodeAnalyzer({ dir: path.join(CACHE, "ja-dict", fs.readdirSync(path.join(CACHE, "ja-dict"))[0]) }),
    E = await nodeEngine({ dir: path.join(CACHE, "kokoro") }),
    model = await nodePitchModel({ dir: path.join(CACHE, "ja-pitch/qwen-2") }),
    [current, dict] = [pitchYomite(A, model), pitchYomite(A, model, { source })],
    speak = async (ys) => {
      const P = K.plan(ys);
      if (P.length !== 1) throw new Error(`${P.length} sections: ${ys}`);
      return { samples: (await E.synthSection(P[0])).audio, sampleRate: K.SR };
    },
    items = [];
  for (const [i, ys] of sentences.entries()) {
    const [a, b] = [current(ys), dict(withoutPhrases(ys))],
      name = `s${first + i + 1}`,
      id = `story.${name}`,
      before = await speak(a);
    writeLevelled(OUT, "current", id, before);
    writeLevelled(OUT, "dict", id, a === b ? before : await speak(b));
    items.push({ set: "story", name, text: originalText(ys), differs: a !== b });
    console.log(name, a === b ? "same" : "differs", "\n ", bare(a), "\n ", bare(b));
  }
  const page = listing(items);
  for (const it of page.filter((x) => x.of))
    for (const v of ["current", "dict"]) fs.copyFileSync(path.join(OUT, v, `story.${it.of}.wav`), path.join(OUT, v, `story.${it.name}.wav`));
  fs.writeFileSync(
    path.join(OUT, "listen.json"),
    JSON.stringify({ test: "qwen_prosody_story_phrases", title: "注文の多い料理店：句の区切り", variants: ["current", "dict"], items: page }, null, 1),
  );
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
