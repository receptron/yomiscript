// qwen-3's candidates by ear. Blind: current (the dictionary and qwen-2, as the tools are) against qwen5 and qwen6, with Kokoro, on the words the maintainer checked, in short sentences, and on sentences of the story not heard before. The candidates
// are given the LLM's phrases (the story's earlier data) or, on the checks, the dictionary's in their place. Two items are repeated, in another order of the sides.
// usage: node compare_listen.mjs rows; python infer (below); node compare_listen.mjs audio   -> audio/compare/;
//        serve eval/ and open blind.html?test=qwen3&run=compare
//        ../prosody_ref/.venv/bin/python -c "..." reads work/compare_rows.json and writes work/compare_<model>.json
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { applyEdits, isJa, parse } from "@yomiscript/core";
import { accentMarks, phraseUnits, pitchRows, pitchYomite } from "@yomiscript/ja-accent";
import { nodeAnalyzer, nodePitchModel } from "@yomiscript/ja-accent/node";
import * as K from "@yomiscript/kokoro";
import { nodeEngine } from "@yomiscript/kokoro/node";
import { originalText } from "yomiscript";
import { writeLevelled } from "../blind_audio.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "audio/compare"),
  CACHE = path.join(process.env.HOME, ".cache/yomiscript"),
  MODELS = ["qwen5", "qwen6"],
  VARIANTS = ["current", ...MODELS];
const read = (f) => JSON.parse(fs.readFileSync(path.join(HERE, f), "utf8"));
const CHECKS = [
  "ja /soː<t:そう> da<t:だ。> ↘/",
  "ja /bokɯ<t:ぼく> mo<t:も> soː<t:そう> da<t:だ。> ↘/",
  "ja /moː<t:もう> neteɾɯ<t:寝てる。> ↘/",
  "ja /jɯkata<t:浴衣> o<t:を> kiteɾɯ<t:着てる。> ↘/",
  "ja /soto<t:外> ɲi<t:に> deteɾɯ<t:出てる。> ↘/",
  "ja /teɾebi<t:テレビ> o<t:を> miteɾɯ<t:見てる。> ↘/",
  "ja /haha<t:母> ɡa<t:が> jondeɾɯ<t:呼んでる。> ↘/",
  "ja /hoɴ<t:本> o<t:を> jondeɾɯ<t:読んでる。> ↘/",
  "ja /hoɴ<t:本> o<t:を> motteɾɯ<t:持ってる。> ↘/",
  "ja /ɡohaɴ<t:ご飯> o<t:を> motteɾɯ<t:盛ってる。> ↘/",
  "ja /ɾʲoːhoː<t:両方> kaneteɾɯ<t:兼ねてる。> ↘/",
  "ja /ɡohaɴ<t:ご飯> o<t:を> tabete<t:食べて> neɾɯ<t:寝る。> ↘/",
];
// the story's sentences 11 to 18: not heard before
const story = read("work/story_llm_phrases.json")
  .paragraphs.flatMap((p) => p.sentences.map((s) => s.ys))
  .slice(10, 18);
const analyzer = async () => nodeAnalyzer({ dir: path.join(CACHE, "ja-dict", fs.readdirSync(path.join(CACHE, "ja-dict"))[0]) });
const stripMarks = (ys) => ys.replaceAll(/[ꜛꜜ]/g, "");

async function items() {
  const A = await analyzer();
  return [...CHECKS.map((ys) => stripMarks(accentMarks(ys, A))), ...story].map((ys, i) => ({ name: `c${i + 1}`, ys }));
}

function rowsOf(ys) {
  const u = parse(ys),
    sec = u.sections.find((s) => isJa(s.lang));
  return pitchRows(
    sec,
    u.texts,
    phraseUnits(sec).map(() => null),
  );
}
function withValues(ys, values) {
  const sec = parse(ys).sections.find((s) => isJa(s.lang));
  return applyEdits(
    ys,
    phraseUnits(sec)
      .flat()
      .map((t, i) => ({ at: t.end, ins: `<f0:${values[i].map((v) => v.toFixed(2)).join(",")}>` })),
  );
}
const orderAt = (k) => (k * 5 + Math.floor(k / 6)) % 6;

async function audio() {
  const list = await items(),
    A = await analyzer(),
    E = await nodeEngine({ dir: path.join(CACHE, "kokoro") }),
    current = pitchYomite(A, await nodePitchModel({ dir: path.join(CACHE, "ja-pitch/qwen-2") })),
    values = Object.fromEntries(MODELS.map((m) => [m, read(`work/compare_${m}.json`)])),
    speak = async (ys) => {
      const P = K.plan(ys);
      if (P.length !== 1) throw new Error(`${P.length} sections: ${ys}`);
      return { samples: (await E.synthSection(P[0])).audio, sampleRate: K.SR };
    },
    page = [];
  for (const [i, x] of list.entries()) {
    const id = `compare.${x.name}`;
    writeLevelled(OUT, "current", id, await speak(current(x.ys.replaceAll(" | ", " "))));
    for (const m of MODELS) writeLevelled(OUT, m, id, await speak(withValues(x.ys, values[m][i])));
    page.push({ set: "compare", name: x.name, text: originalText(x.ys) });
  }
  const base = [...page];
  for (const it of [base[8], base[10]]) {
    while (orderAt(page.length) === orderAt(base.indexOf(it))) page.push(base[page.length % base.length]);
    page.push({ ...it, name: `${it.name}r`, of: it.name });
    for (const v of VARIANTS) fs.copyFileSync(path.join(OUT, v, `compare.${it.name}.wav`), path.join(OUT, v, `compare.${it.name}r.wav`));
  }
  const unique = page.filter((x, i) => page.findIndex((y) => y.name === x.name) === i);
  fs.writeFileSync(
    path.join(OUT, "listen.json"),
    JSON.stringify({ test: "qwen3_compare", title: "qwen-3 の候補と今の版", variants: VARIANTS, items: unique }, null, 1),
  );
  console.log(unique.length, "items");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === "rows") {
    const list = await items();
    fs.writeFileSync(path.join(HERE, "work/compare_rows.json"), JSON.stringify(list.map((x) => ({ name: x.name, ...rowsOf(x.ys) }))));
    console.log(list.length, "rows");
  } else await audio();
}
