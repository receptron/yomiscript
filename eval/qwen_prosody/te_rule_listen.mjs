// The rule of D37 on verbs not yet heard: a verb before て keeps the fall of its base form, when that is none or on the first mora.
// Current (the code before the rule, built into work/main_pkg) against fixed (this checkout), with the published pitch model and
// Kokoro, on short sentences frozen before listening, the words among those the rule changes in the story, JSUT and JKYB. The
// listener marks only what sounds wrong, on either side. Controls do not change and have one recording on both sides. Two cases are
// repeated, the sides the other way round.
// usage: build the previous code into work/main_pkg; node te_rule_listen.mjs   -> audio/te_rule/;
//        serve eval/ and open blind.html?test=qwen_prosody&run=te_rule
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
const OUT = path.join(HERE, "audio/te_rule"),
  CACHE = path.join(process.env.HOME, ".cache/yomiscript");
const CASES = [
  "ja /ɯwaɡi<t:上着> o<t:を> | kite<t:着て> | dekakeɾɯ<t:出かける。> ↘/",
  "ja /beddo<t:ベッド> de<t:で> | nete<t:寝て> | sɯɡosɯ<t:過ごす。> ↘/",
  "ja /ɕɯkɯdai<t:宿題> o<t:を> | jatte<t:やって> | asobɯ<t:遊ぶ。> ↘/",
  "ja /ɕidʑi<t:指示> ɲi<t:に> | ɕitaɡatte<t:従って> | ɯɡokɯ<t:動く。> ↘/",
  "ja /osaɾa<t:お皿> ɡa<t:が> | kakete<t:欠けて> | komaɾɯ<t:困る。> ↘/",
  "ja /kado<t:角> o<t:を> | maɡatte<t:曲がって> | sɯsɯmɯ<t:進む。> ↘/",
  "ja /hana<t:花> o<t:を> | soete<t:添えて> | okɯɾɯ<t:贈る。> ↘/",
  "ja /kadzokɯ<t:家族> o<t:を> | sasaete<t:支えて> | hataɾakɯ<t:働く。> ↘/",
  "ja /osake<t:お酒> o<t:を> | jamete<t:やめて> | nemɯɾɯ<t:眠る。> ↘/",
  "ja /te<t:手> o<t:を> | aɡete<t:あげて> | wataɾɯ<t:渡る。> ↘/",
  "ja /jasete<t:痩せて> | mieɾɯ<t:見える。> ↘/",
  "ja /ame<t:雨> ɡa<t:が> | jande<t:止んで> | haɾeta<t:晴れた。> ↘/",
  "ja /soto<t:外> ɲi<t:に> | dete<t:出て> | asobɯ<t:遊ぶ。> ↘/",
  "ja /ito<t:糸> o<t:を> | toːɕite<t:通して> | nɯɯ<t:縫う。> ↘/",
  "ja /kasa<t:傘> o<t:を> | saɕite<t:差して> | aɾɯkɯ<t:歩く。> ↘/",
  "ja /heja<t:部屋> ɲi<t:に> | haitte<t:はいって> | sɯwaɾɯ<t:座る。> ↘/",
];
const CONTROLS = ["ja /teɡami<t:手紙> o<t:を> | kaite<t:書いて> | okɯɾɯ<t:送る。> ↘/", "ja /hoɴ<t:本> o<t:を> | jonde<t:読んで> | waɾaɯ<t:笑う。> ↘/"];
// blind.html: the side that comes first at place k
const firstSide = (k) => (k * 5 + Math.floor(k / 2)) % 2;

const bare = (ys) =>
  ys
    .split("<")
    .map((part, i) => (i ? part.slice(part.indexOf(">") + 1) : part))
    .join("");

/** the items in a fixed mixed order, then two cases again at the next places where their sides are the other way round */
function listing(names) {
  const order = names.map((_, i) => (i * 7) % names.length).map((i) => names[i]),
    cases = order.filter((x) => x.kind === "case"),
    items = [...order];
  for (const one of cases.slice(0, 2)) {
    const was = items.indexOf(one);
    while (firstSide(items.length) === firstSide(was)) items.push(cases[cases.length - 1 - items.length + order.length] ?? one);
    items.push({ ...one, name: `${one.name}r` });
  }
  return items.filter((x, i) => items.findIndex((y) => y.name === x.name) === i);
}

async function main() {
  const { pitchYomite: previous } = await import(path.join(HERE, "work/main_pkg/dist/index.js")),
    A = await nodeAnalyzer({ dir: path.join(CACHE, "ja-dict", fs.readdirSync(path.join(CACHE, "ja-dict"))[0]) }),
    E = await nodeEngine({ dir: path.join(CACHE, "kokoro") }),
    model = await nodePitchModel({ dir: path.join(CACHE, "ja-pitch/qwen-2") }),
    [current, fixed] = [previous(A, model), pitchYomite(A, model)],
    speak = async (ys) => {
      const P = K.plan(ys);
      if (P.length !== 1) throw new Error(`${P.length} sections: ${ys}`);
      return { samples: (await E.synthSection(P[0])).audio, sampleRate: K.SR };
    },
    names = [];
  for (const [i, ys] of [...CASES, ...CONTROLS].entries()) {
    const [a, b] = [current(ys), fixed(ys)],
      name = `r${i + 1}`,
      id = `te.${name}`,
      kind = i < CASES.length ? "case" : "control";
    console.log(name, kind, originalText(ys), "|", bare(a), "|", bare(b), a === b ? "SAME" : "");
    if ((a === b) !== (kind === "control")) continue;
    const before = await speak(a);
    writeLevelled(OUT, "current", id, before);
    writeLevelled(OUT, "fixed", id, a === b ? before : await speak(b));
    names.push({ set: "te", name, text: originalText(ys), kind });
  }
  const items = listing(names);
  for (const it of items.filter((x) => x.name.endsWith("r") && !names.includes(x))) {
    for (const v of ["current", "fixed"]) fs.copyFileSync(path.join(OUT, v, `te.${it.name.slice(0, -1)}.wav`), path.join(OUT, v, `te.${it.name}.wav`));
  }
  fs.writeFileSync(
    path.join(OUT, "listen.json"),
    JSON.stringify({ test: "qwen_prosody_te_rule", title: "Verbs before て", variants: ["current", "fixed"], items }, null, 1),
  );
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
