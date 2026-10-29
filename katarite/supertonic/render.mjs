// CLI for kana.js: a JSON array of YomiScript strings on stdin -> a JSON array of {text} or {error} on stdout.
//   node render.mjs                all kana (toKana)
//   node render.mjs ambiguous      the original text, with kana for ambiguous words, numbers and symbols (toText)
//   node render.mjs kanji          the original text, with kana for every word with kanji, numbers or symbols
import fs from "fs";
import { toKana, toText } from "./kana.js";

const rule = process.argv[2];
const ambiguous = new Set(Object.keys(JSON.parse(fs.readFileSync(new URL("./ambiguous.json", import.meta.url), "utf8"))));
let input = "";
for await (const chunk of process.stdin) input += chunk;
const out = JSON.parse(input).map((ys) => {
  try {
    return { text: rule ? toText(ys, ambiguous, rule) : toKana(ys) };
  } catch (e) {
    return { error: e.message };
  }
});
process.stdout.write(JSON.stringify(out));
