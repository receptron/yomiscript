// The rows a model learns the accent read from Qwen (abs.mjs) from: for each sentence Qwen read from the text, its
// morae in the tools' accent phrases (D31), with what is known before any listening (the mora, its word, where it
// stands in the word and the phrase, the boundary before it, D31's nucleus; and the index of its word, for
// qwen_hidden.py's vectors), and for each phrase of two or more morae
// the nucleus abs.mjs read (0 flat, k: falls after the k-th mora) as the target.
// usage: node nucleus_rows.mjs [tag]   (after abs.mjs)   -> work/nucleus_rows.json; with a tag (_phrased) from
//        work/abs<tag>.json to work/nucleus_rows<tag>.json
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parse } from "@yomiscript/core";
import { pitchRows } from "@yomiscript/ja-accent";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** the morae of one sentence, each with its features, and its phrases with D31's and abs's nuclei */
export function sentenceRows(ys, d31, abs) {
  const U = parse(ys.replace(/[ꜛꜜ]/g, "")),
    { morae, phrases } = pitchRows(U.sections[0], U.texts, d31);
  return { morae, phrases: phrases.map((p, g) => ({ ...p, abs: abs[g] })) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const tag = process.argv[2] ?? "",
    read = JSON.parse(fs.readFileSync(path.join(HERE, `work/abs${tag}.json`), "utf8"));
  const out = Object.entries(read).map(([name, r]) => ({
    name,
    test: name.startsWith("BASIC5000_") && Number(name.split("_")[1]) % 2 === 1, // the Wikipedia sentences all train
    ...sentenceRows(r.ys, r.d31, r.abs),
  }));
  fs.writeFileSync(path.join(HERE, `work/nucleus_rows${tag}.json`), JSON.stringify(out));
  console.log(`${out.length} sentences, ${out.filter((s) => s.test).length} in the test half`);
}
