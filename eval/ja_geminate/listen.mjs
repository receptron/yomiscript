// A blind test of the minimum on a geminate and the vowel before it (D34), on sentences it changes and that the
// test which led to it (eval/announce_minutes) did not have: the public page's sentences, unseen JSUT sentences and
// counted words, with the predicted pitch as the tools add it, in the browser's w16 models:
//   before  the durations as Kokoro predicts them
//   after   with the minimum
// It also measures, over the test half of JSUT, how often the minimum changes something.
// usage: node listen.mjs   -> audio/blind/<variant>/<set>.<name>.wav, listen.json, results.json;
//        serve eval/ and open blind.html?test=ja_geminate
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parse } from "@yomiscript/core";
import { PITCH_VERSION, pitchYomite } from "@yomiscript/ja-accent";
import { nodeAnalyzer, nodePitchModel } from "@yomiscript/ja-accent/node";
import { writeLevelled } from "../blind_audio.mjs";
import { engine, K, WEB } from "../../demo/ys_web/node.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)),
  OUT = path.join(HERE, "audio/blind"),
  CACHE = path.join(process.env.HOME, ".cache/yomiscript"),
  JSUT = path.join(HERE, "../qwen_prosody/work/phrased.json"),
  PAGE_MAX = 5,
  JSUT_PICK = 5,
  MEASURED = 300,
  MS = (K.SAMPLES_PER_STEP / K.SR) * 1000;
const COUNTED = {
  hon20: "ja /eɴpitsɯ<t:鉛筆> ɡa<t:が> | ɲidʑɯppoɴ<t:二十本> | aɾɯ<t:ある。> ↘/",
  kai20: "ja /ɲidʑɯkkai<t:二十回> | ikɯ<t:行く。> ↘/",
  fun70: "ja /kaiɡi<t:会議> wa<t:は> | nanadʑɯppɯɴ<t:七十分> ɡa<t:が> | jotei<t:予定> desɯ<t:です。> ↘/",
};
const base = path.join(CACHE, "ja-dict"),
  E = await engine("w16"),
  direct = pitchYomite(
    await nodeAnalyzer({ dir: path.join(base, fs.readdirSync(base)[0]) }),
    await nodePitchModel({ dir: path.join(CACHE, "ja-pitch", PITCH_VERSION) }),
  );

const without = (sec) => ({ ...sec, minSteps: sec.minSteps.map(() => 0) });
/** what the minimum does to a YomiScript of one section: the ids it raises, as phoneme and ms before */
async function raised(ys) {
  const sec = K.plan(ys)[0];
  const [{ dur: a }, { dur: b }] = [await E.predict(without(sec)), await E.predict(sec)],
    chars = sec.ids.map((id) => Object.keys(K.VOCAB).find((c) => K.VOCAB[c] === id) ?? "");
  const up = a.flatMap((d, i) => (b[i] !== d ? [`${chars[i]}${d * MS}`] : []));
  return { sec, up, geminates: chars.filter((c) => c === "ʔ").length, added: (b.reduce((s, x) => s + x, 0) - a.reduce((s, x) => s + x, 0)) * MS };
}

const phrased = JSON.parse(fs.readFileSync(JSUT, "utf8")),
  odd = Object.keys(phrased).filter((n) => Number(n.split("_")[1]) % 2 === 1),
  page = JSON.parse(fs.readFileSync(path.join(WEB, "misread.json"), "utf8")).items;

// how often, over the sentences with a geminate
let sentences = 0,
  withOne = 0,
  changed = 0,
  geminates = 0,
  ids = 0,
  added = 0;
const short = [];
for (const name of odd.slice(0, MEASURED)) {
  const ys = direct(phrased[name]),
    r = await raised(ys);
  sentences++;
  if (r.geminates) withOne++;
  geminates += r.geminates;
  if (r.up.length) {
    changed++;
    ids += r.up.length;
    added += r.added;
    short.push(name);
  }
}

const jsutStep = Math.max(1, Math.floor(short.length / JSUT_PICK)),
  picks = [];
for (const x of page) {
  const r = await raised(x.spoken);
  if (r.up.length && picks.filter((p) => p.set === "page").length < PAGE_MAX) picks.push({ set: "page", name: x.name, ys: x.spoken });
}
for (let i = 0; i < JSUT_PICK && i * jsutStep < short.length; i++)
  picks.push({ set: "jsut", name: short[i * jsutStep], ys: direct(phrased[short[i * jsutStep]]) });
for (const [name, ys] of Object.entries(COUNTED)) picks.push({ set: "count", name, ys: direct(ys) });

const items = [],
  detail = {};
for (const { set, name, ys } of picks) {
  const r = await raised(ys),
    id = `${set}.${name}`;
  detail[id] = { raised: r.up, added_ms: r.added };
  console.log(id, r.up.join(" "), `+${r.added} ms`);
  if (!r.up.length) continue;
  writeLevelled(OUT, "before", id, { samples: (await E.synthSection(without(r.sec))).audio, sampleRate: K.SR });
  writeLevelled(OUT, "after", id, { samples: (await E.synthSection(r.sec)).audio, sampleRate: K.SR });
  items.push({ set, name, text: parse(ys).texts.join("") });
}
fs.writeFileSync(
  path.join(OUT, "listen.json"),
  JSON.stringify({ test: "ja_geminate", title: "A minimum on the geminate", variants: ["before", "after"], items }, null, 1),
);
const summary = {
  sentences,
  with_geminate: withOne,
  geminates,
  changed_sentences: changed,
  raised_ids: ids,
  mean_added_ms_when_changed: changed ? Math.round(added / changed) : 0,
};
fs.writeFileSync(path.join(HERE, "results.json"), JSON.stringify({ summary, detail }, null, 1) + "\n");
console.log(summary);
