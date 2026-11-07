// Supply values for entries the isolated-word parser cannot represent, using neutral vowel surrogates.
import fs from "node:fs";
import path from "node:path";
import { parse, jaContour, applyEdits } from "@yomiscript/core";
import { phraseUnits, marksFor } from "@yomiscript/ja-accent";
import { nodePitchModel } from "@yomiscript/ja-accent/node";
function surrogate(m) {
  if (m === "ー") return "ː";
  if (m === "ン") return "ɴ";
  if (m === "ッ") return "ta";
  return table[m] ?? "a";
}
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8")),
  model = await nodePitchModel({ dir: path.join(process.env.HOME, ".cache/yomiscript/ja-pitch/qwen-2") }),
  table = read("work/kana_ipa.json"),
  seen = new Set(
    fs
      .readFileSync("work/word_values.jsonl", "utf8")
      .trim()
      .split("\n")
      .map((l) => {
        const r = JSON.parse(l);
        return JSON.stringify([r.s, r.k]);
      }),
  ),
  output = [];
for (const [s, k, fall] of read("work/word_falls.json")) {
  if (seen.has(JSON.stringify([s, k]))) continue;
  const morae = k.match(/[ァ-ヴー][ァィゥェォャュョヮ]?/g),
    ipa = morae.map(surrogate),
    bare = `ja /${ipa.join(" ")} ↘/`,
    units = phraseUnits(parse(bare).sections[0])[0];
  if (units.length !== morae.length) throw new Error(`Surrogate alignment failed: ${k}`);
  const marked = applyEdits(bare, marksFor(units, fall)),
    section = parse(marked).sections[0],
    contour = jaContour(section, model.contour),
    tokens = section.toks.filter((t) => t.kind === "unit");
  output.push(
    JSON.stringify({ s, k, i: ipa.map((p, j) => (morae[j] === "ッ" ? "t" : p)), v: tokens.map((t) => contour.get(t) ?? [0, 0, 0]), surrogate: true }),
  );
}
fs.appendFileSync("work/word_values.jsonl", `${output.join("\n")}\n`);
console.log(output.length, "surrogate word targets appended");
