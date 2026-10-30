// For the Python eval scripts: a JSON array of YomiScript strings on stdin -> a JSON array of {text} or {error}, the
// text the Supertonic Katarite gives the engine (packages/katarite-supertonic, built: yarn build).
// usage: echo '["ja /kʲoː<t:今日> wa<t:は> ↘/"]' | node render_text.mjs [ambiguous|kanji]
import fs from "fs";
import { AMBIGUOUS_URL, ambiguousSet, toText } from "@mulmovoice/katarite-supertonic";

const rule = process.argv[2] ?? "ambiguous";
const ambiguous = ambiguousSet(JSON.parse(fs.readFileSync(AMBIGUOUS_URL, "utf8")));
let input = "";
for await (const chunk of process.stdin) input += chunk;
const out = JSON.parse(input).map((ys) => {
  try {
    return { text: toText(ys, ambiguous, rule) };
  } catch (e) {
    return { error: e.message };
  }
});
process.stdout.write(JSON.stringify(out));
