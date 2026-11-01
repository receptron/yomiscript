// Where the English words are in the kana audio, so that Whisper can hear them alone as it hears the YomiScript's
// English sections. The same LLM's YomiScript gives the Japanese before and after its English sections; when the
// kana reading has the same morae there (three quarters of them spelled the same), the morae between them are the English words said in katakana.
// usage: node segments.mjs   -> results/kana_segments.json { "kana_<llm>/<item>": [start, end] (seconds) }
import fs from "fs";
import path from "path";
import { isJa, parse } from "@yomiscript/core";
import { AUDIO, LLMS, MIXED_ITEMS, morae, readJson, writeJson } from "./common.mjs";

/** the morae of the Japanese sections before the first and after the last other-language section */
function context(ys) {
  const secs = parse(ys).sections,
    first = secs.findIndex((s) => !isJa(s.lang)),
    last = secs.length - 1 - [...secs].reverse().findIndex((s) => !isJa(s.lang));
  if (first < 0) return null;
  const M = morae(ys),
    sec = (m) => Number(m.phrase.split(".")[0]);
  return { before: M.filter((m) => sec(m) < first).map((m) => m.key), after: M.filter((m) => sec(m) > last).map((m) => m.key) };
}
function segment(ys, kanaYs, times) {
  const c = context(ys),
    K = morae(kanaYs).map((m) => m.key);
  if (!c || K.length !== times.length) return null;
  const [b, a] = [c.before.length, c.after.length];
  // the same morae, allowing a few spelled another way (いう iɯ / jɯː, 先生 seːseː / seɴseː)
  const same = (x, y) => x.length === y.length && x.filter((k, i) => k === y[i]).length >= 0.75 * x.length;
  if (b + a >= K.length || !same(K.slice(0, b), c.before) || !same(K.slice(K.length - a), c.after)) return null;
  return [times[b].start, times[K.length - a - 1].end];
}

const used = readJson("results/mixed_ys.json").used,
  out = {},
  missed = [];
for (const x of MIXED_ITEMS().filter((y) => y.intent === "en"))
  for (const l of LLMS) {
    const ys = used[`ys_${l}`]?.[x.name]?.ys,
      kana = used[`kana_${l}`]?.[x.name]?.ys,
      meta = path.join(AUDIO, "mixed", `kana_${l}`, `${x.name}.json`);
    const s = ys && kana && fs.existsSync(meta) ? segment(ys, kana, JSON.parse(fs.readFileSync(meta, "utf8")).morae) : null;
    if (s) out[`kana_${l}/${x.name}`] = s;
    else missed.push(`kana_${l}/${x.name}`);
  }
writeJson("results/kana_segments.json", out);
console.log(`${Object.keys(out).length} segments; not found: ${missed.join(", ") || "none"}`);
