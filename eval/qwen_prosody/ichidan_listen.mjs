// Ichidan verbs before て fall one mora earlier than their base form (食べる タベ\ル, 食べて タ\ベテ), and 室 read へや and 扉 read と are in the user
// dictionary. Current (the code and dictionary before these, built into work/main_pkg) against fixed (this checkout), with the published
// pitch model and Kokoro, on short sentences frozen before listening. The listener marks only what sounds wrong, on either side.
// Controls do not change and have one recording on both sides. Two cases are repeated, the sides the other way round.
// usage: build the previous code into work/main_pkg; node ichidan_listen.mjs   -> audio/ichidan/;
//        serve eval/ and open blind.html?test=qwen_prosody&run=ichidan
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
const OUT = path.join(HERE, "audio/ichidan"),
  CACHE = path.join(process.env.HOME, ".cache/yomiscript"),
  DICT = path.join(CACHE, "ja-dict", fs.readdirSync(path.join(CACHE, "ja-dict"))[0]);
const CASES = [
  "ja /ɾʲoːhoː<t:両方> | kaneteɾɯ<t:兼ねてる。> ↘/",
  "ja /ɡohaɴ<t:ご飯> o<t:を> | tabete<t:食べて> | neɾɯ<t:寝る。> ↘/",
  "ja /kitte<t:切手> o<t:を> | atsɯmete<t:集めて> | iɾɯ<t:いる。> ↘/",
  "ja /kotoba<t:言葉> o<t:を> | ɕiɾabete<t:調べて> | kakɯ<t:書く。> ↘/",
  "ja /himo<t:紐> ɡa<t:が> | kiɾete<t:切れて> | otɕiɾɯ<t:落ちる。> ↘/",
  "ja /ie<t:家> o<t:を> | hanaɾete<t:離れて> | kɯɾasɯ<t:暮らす。> ↘/",
  "ja /kaɡi<t:鍵> o<t:を> | kakete<t:かけて> | deɾɯ<t:出る。> ↘/",
  "ja /ɕiken<t:試験> o<t:を> | ɯkete<t:受けて> | kaeɾɯ<t:帰る。> ↘/",
  "ja /te<t:手> o<t:を> | awasete<t:合わせて> | inoɾɯ<t:祈る。> ↘/",
  "ja /ɕɯkɯdai<t:宿題> ɡa<t:が> | dekite<t:できて> | jokatta<t:良かった。> ↘/",
  "ja /deŋki<t:電気> o<t:を> | tsɯkete<t:つけて> | jomɯ<t:読む。> ↘/",
  "ja /ame<t:雨> ɡa<t:が> | otɕite<t:落ちて> | kɯɾɯ<t:くる。> ↘/",
  "ja /çito<t:人> ɡa<t:が> | ɸɯete<t:増えて> | komɯ<t:混む。> ↘/",
  "ja /ɕiɴɕitsɯ<t:真実> o<t:を> | motomete<t:求めて> | aɾɯkɯ<t:歩く。> ↘/",
  "ja /kaɾe<t:彼> o<t:を> | ɕindʑite<t:信じて> | matsɯ<t:待つ。> ↘/",
  "ja /hajakɯ<t:早く> | dokoka<t:どこか> | heja<t:室> no<t:の> | naka<t:中> ɲi<t:に> | haiɾitai<t:はいりたい。> ↘/",
  "ja /heja<t:室> e<t:へ> | haiɾɯ<t:はいる。> ↘/",
  "ja /to<t:扉> o<t:を> | akeɾɯ<t:あける。> ↘/",
  "ja /to<t:扉> ɲi<t:に> | kaite<t:書いて> | aɾɯ<t:ある。> ↘/",
];
const CONTROLS = ["ja /tomodatɕi<t:友達> to<t:と> | hanaɕite<t:話して> | waɾaɯ<t:笑う。> ↘/", "ja /jokɯ<t:良く> | kaŋɡaete<t:考えて> | kotaeɾɯ<t:答える。> ↘/"];
/** a generator of numbers in [0, 1), the same on every run */
function seeded() {
  let state = 20261106;
  return () => {
    state = (state * 48271) % 2147483647;
    return state / 2147483647;
  };
}
// blind.html: the side that comes first at place k
const firstSide = (k) => (k * 5 + Math.floor(k / 2)) % 2;
const bare = (ys) =>
  ys
    .split("<")
    .map((part, i) => (i ? part.slice(part.indexOf(">") + 1) : part))
    .join("");

/** the items in a seeded order, then the first two cases again, each at a place where its sides are the other way round */
function listing(items) {
  const random = seeded(),
    pool = [...items],
    order = [];
  while (pool.length) order.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  const page = [...order],
    cases = order.filter((x) => x.kind === "case");
  for (const it of cases) {
    if (page.length === order.length + 2) break;
    if (firstSide(page.length) !== firstSide(order.indexOf(it))) page.push({ ...it, name: `${it.name}r`, of: it.name });
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
      name = `i${i + 1}`,
      id = `ichidan.${name}`,
      kind = i < CASES.length ? "case" : "control";
    console.log(name, kind, originalText(ys), "|", bare(a), "|", bare(b), a === b ? "SAME" : "");
    if ((a === b) !== (kind === "control")) continue;
    const before = await speak(a);
    writeLevelled(OUT, "current", id, before);
    writeLevelled(OUT, "fixed", id, a === b ? before : await speak(b));
    items.push({ set: "ichidan", name, text: originalText(ys), kind });
  }
  const page = listing(items);
  for (const it of page.filter((x) => x.of)) {
    for (const v of ["current", "fixed"]) fs.copyFileSync(path.join(OUT, v, `ichidan.${it.of}.wav`), path.join(OUT, v, `ichidan.${it.name}.wav`));
  }
  fs.writeFileSync(
    path.join(OUT, "listen.json"),
    JSON.stringify({ test: "qwen_prosody_ichidan", title: "一段動詞と て、室、扉", variants: ["current", "fixed"], items: page }, null, 1),
  );
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
