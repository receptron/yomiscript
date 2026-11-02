// The kana pass: the sentences Qwen misread from the plain text (extract.py's work/rejected.json), given again with
// every word that has a kanji written in kana (the Supertonic Katarite's text, rule `kanji`), so that the reading
// is the YomiScript's and the sentence can still be used.
// usage: node kana_items.mjs   -> work/items_kana.json (then generate.py --items work/items_kana.json --out work/audio_kana)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { toText } from "@yomiscript/supertonic";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const rejected = JSON.parse(fs.readFileSync(path.join(HERE, "work/rejected.json"), "utf8")),
  items = JSON.parse(fs.readFileSync(path.join(HERE, "work/items.json"), "utf8"));
const out = [],
  skipped = [];
for (const x of items.filter((y) => y.name in rejected)) {
  try {
    out.push({ ...x, plain: x.text, text: toText(x.ys, new Set(), "kanji") });
  } catch (e) {
    skipped.push(`${x.name} (${e.message})`); // notation the kana table does not have (e.g. çʲa for ça)
  }
}
fs.writeFileSync(path.join(HERE, "work/items_kana.json"), JSON.stringify(out));
console.log(`${out.length} sentences, ${skipped.length} without a kana rendering: ${skipped.join(", ")}`);
