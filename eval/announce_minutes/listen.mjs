// A blind test of the listener's report on the station announcement: the number of 20, 30, 40 and 50 minutes is too
// short, 10分 is fine. Kokoro gives じゅ's vowel and っ 75 ms each in 10分 and 50 ms in the others. The whole announcement,
// in the browser's w16 models, with only the number's durations changed (ぷん as predicted; 10分 as predicted in all, as
// the reference):
//   now     as the page speaks it
//   as10    じゅっ timed as in 10分 (its vowel and っ one step, 25 ms, longer)
//   plus25  every phoneme of the number one step longer
//   plus50  every phoneme of the number one and a half times as long
// usage: node listen.mjs   -> audio/blind/<variant>/min.<m>.wav, listen.json, results.json;
//        serve eval/ and open blind.html?test=announce_minutes
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { realize } from "@yomiscript/core";
import { writeLevelled } from "../blind_audio.mjs";
import { announce } from "../../demo/ys_web/web/announce.js";
import { engine, K } from "../../demo/ys_web/node.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)),
  OUT = path.join(HERE, "audio/blind"),
  MS = (K.SAMPLES_PER_STEP / K.SR) * 1000,
  WORD = "ʥɨʔpɯɴ";
const E = await engine("w16");

/** the durations of a variant: the number is the phonemes from start up to and including っ at end */
function changed(dur, start, end, variant, m) {
  const d = [...dur];
  if (m === 10 || variant === "now") return d;
  if (variant === "as10") {
    d[end - 1]++;
    d[end]++;
    return d;
  }
  for (let i = start; i <= end; i++) d[i] = variant === "plus25" ? d[i] + 1 : Math.round(d[i] * 1.5);
  return d;
}

const VARIANTS = ["now", "as10", "plus25", "plus50"],
  items = [],
  results = {};
for (const m of [10, 20, 30, 40, 50]) {
  const { ys, text } = announce({ train: "のぞみ", no: 8, place: "博多", track: 15, time: [8, m] }),
    sec = K.plan(realize(ys))[0],
    { dur } = await E.predict(sec),
    ps = [...sec.ps],
    pad = Math.round((dur.length - ps.length) / 2),
    found = sec.ps.lastIndexOf(WORD);
  if (found < 0) throw new Error(`${m}: no ${WORD} in ${sec.ps}`);
  const begin = sec.ps.lastIndexOf(" ", found) + 1,
    start = begin + pad,
    end = found + WORD.indexOf("ʔ") + pad,
    shown = (v) =>
      ps
        .slice(begin, found + WORD.length)
        .map((p, i) => `${p}${changed(dur, start, end, v, m)[start + i] * MS}`)
        .join(" ");
  results[m] = Object.fromEntries(VARIANTS.map((v) => [v, shown(v)]));
  console.log(m, results[m]);
  for (const variant of VARIANTS) {
    const { audio } = await E.synthSection(sec, "values", changed(dur, start, end, variant, m));
    writeLevelled(OUT, variant, `min.${m}`, { samples: audio, sampleRate: K.SR });
  }
  items.push({ set: "min", name: String(m), text });
}
fs.writeFileSync(
  path.join(OUT, "listen.json"),
  JSON.stringify({ test: "announce_minutes", title: "The minutes in the announcement", variants: VARIANTS, items }, null, 1),
);
fs.writeFileSync(path.join(HERE, "results.json"), JSON.stringify(results, null, 1) + "\n");
