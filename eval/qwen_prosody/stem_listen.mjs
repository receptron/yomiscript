// One-mora verbs before てる: NAIST-JDIC's entry for the stem disagrees with the verb's own accent for 寝 and 着 (寝る, 着る have no fall,
// 寝, 着 fall) and 出 (出る falls, 出 does not). Blind: current (this checkout) against fixed (those three stems given their verb's
// accent through the accent source, nothing else), with the published pitch model and Kokoro, on short sentences frozen before
// listening. CONTROLS are the verbs the listener named as already right (似てる, 捨てる, 来てる, 見てる): they do not change, and have one
// recording on both sides. Two cases are repeated, the sides the other way round. Going on takes more cases preferring fixed than
// current, no more unnatural than current, controls heard as the same, and repeats that agree.
// usage: node stem_listen.mjs   -> audio/stem/; serve eval/ and open blind.html?test=qwen_prosody&run=stem
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
const OUT = path.join(HERE, "audio/stem"),
  CACHE = path.join(process.env.HOME, ".cache/yomiscript");
const CASES = [
  "ja /moː<t:もう> | neteɾɯ<t:寝てる。> ↘/",
  "ja /kodomo<t:子供> ɡa<t:が> | neteɾɯ<t:寝てる。> ↘/",
  "ja /jɯkata<t:浴衣> o<t:を> | kiteɾɯ<t:着てる。> ↘/",
  "ja /kimono<t:着物> o<t:を> | kiteɾɯ<t:着てる。> ↘/",
  "ja /soto<t:外> ɲi<t:に> | deteɾɯ<t:出てる。> ↘/",
  "ja /hoɕi<t:星> ɡa<t:が> | deteɾɯ<t:出てる。> ↘/",
];
const CONTROLS = [
  "ja /tɕitɕi<t:父> ɲi<t:に> | niteɾɯ<t:似てる。> ↘/",
  "ja /ɡomi<t:ゴミ> o<t:を> | sɯteɾɯ<t:捨てる。> ↘/",
  "ja /tomodatɕi<t:友達> ɡa<t:が> | kiteɾɯ<t:来てる。> ↘/",
  "ja /teɾebi<t:テレビ> o<t:を> | miteɾɯ<t:見てる。> ↘/",
];
/** the verb's own accent, for the stems whose entry disagrees with it */
const STEMS = { 寝: 0, 着: 0, 出: 1 };
const source = (e) => (e.pos.startsWith("動詞,自立") && Object.hasOwn(STEMS, e.surface) ? { a: STEMS[e.surface] } : undefined);
// the page's order, fixed before listening; a repeat comes where blind.html has its two sides the other way round
const ORDER = [1, 4, 7, 0, 8, 2, 6, 5, 9, 3, 1, 4];

/** the YomiScript without what is in < > */
const bare = (ys) =>
  ys
    .split("<")
    .map((part, i) => (i ? part.slice(part.indexOf(">") + 1) : part))
    .join("");

/** the page's items; a repeat has its own name, because the page keeps one answer per name, and the first one's audio */
function listing(all) {
  const seen = new Set(),
    items = ORDER.map((i) => {
      const name = seen.has(i) ? `s${i + 1}r` : `s${i + 1}`;
      seen.add(i);
      return { set: "stem", name, text: originalText(all[i]), kind: i < CASES.length ? "case" : "control" };
    });
  for (const it of items.filter((x) => x.name.endsWith("r"))) {
    for (const v of ["current", "fixed"]) fs.copyFileSync(path.join(OUT, v, `stem.${it.name.slice(0, -1)}.wav`), path.join(OUT, v, `stem.${it.name}.wav`));
  }
  return items;
}

async function main() {
  const A = await nodeAnalyzer({ dir: path.join(CACHE, "ja-dict", fs.readdirSync(path.join(CACHE, "ja-dict"))[0]) }),
    E = await nodeEngine({ dir: path.join(CACHE, "kokoro") }),
    model = await nodePitchModel({ dir: path.join(CACHE, "ja-pitch/qwen-2") }),
    [current, fixed] = [pitchYomite(A, model), pitchYomite(A, model, { source })],
    all = [...CASES, ...CONTROLS],
    speak = async (ys) => {
      const P = K.plan(ys);
      if (P.length !== 1) throw new Error(`${P.length} sections: ${ys}`);
      return { samples: (await E.synthSection(P[0])).audio, sampleRate: K.SR };
    };
  for (const [i, ys] of all.entries()) {
    const [a, b] = [current(ys), fixed(ys)],
      id = `stem.s${i + 1}`,
      before = await speak(a);
    if ((a === b) !== i >= CASES.length) throw new Error(`s${i + 1} is not what it should be: ${bare(a)} / ${bare(b)}`);
    writeLevelled(OUT, "current", id, before);
    writeLevelled(OUT, "fixed", id, a === b ? before : await speak(b));
    console.log(`s${i + 1}`, originalText(ys), "|", bare(a), "|", bare(b));
  }
  const items = listing(all);
  fs.writeFileSync(
    path.join(OUT, "listen.json"),
    JSON.stringify({ test: "qwen_prosody_stem", title: "One-mora verbs before てる", variants: ["current", "fixed"], items }, null, 1),
  );
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
