// Generate dictionary value teachers entirely from cached local resources.
import fs from "node:fs";
import path from "node:path";
import { parse, jaContour } from "@yomiscript/core";
import { accentMarks, phraseUnits, pitchRows } from "@yomiscript/ja-accent";
import { nodeAnalyzer, nodePitchModel } from "@yomiscript/ja-accent/node";
const cache = path.join(process.env.HOME, ".cache/yomiscript");
const dir = path.join(cache, "ja-dict");
const analyzer = await nodeAnalyzer({ dir: path.join(dir, fs.readdirSync(dir)[0]) });
const model = await nodePitchModel({ dir: path.join(cache, "ja-pitch/qwen-2") });
const table = JSON.parse(fs.readFileSync("work/kana_ipa.json", "utf8"));
const requests = JSON.parse(fs.readFileSync("work/inflection_requests.json", "utf8"));
const out = fs.openSync("work/inflection_values.jsonl", "w");
let made = 0,
  skipped = 0;
function ipa(kana) {
  const ms = kana.match(/[ァ-ヴー][ァィゥェォャュョヮ]?/g) ?? [];
  if (ms.join("") !== kana) return null;
  return ms
    .map((m, i) => {
      if (m === "ー") return "ː";
      if (m === "ン") return "ɴ";
      if (m === "ッ") return table[ms[i + 1]]?.[0] ?? "?";
      return table[m] ?? "?";
    })
    .join("");
}
function row(surface, kana, frame, index) {
  const sound = ipa(kana);
  if (!sound || sound.includes("?")) return null;
  const prefix = ["", "hoɴ<t:本> o<t:を> ", "moː<t:もう> "][frame];
  const bare = `ja /${prefix}${sound}<t:${surface}> ↘/`;
  const parsed = parse(bare),
    section = parsed.sections[0];
  const { morae } = pitchRows(
    section,
    parsed.texts,
    phraseUnits(section).map(() => null),
  );
  const marked = parse(accentMarks(bare, analyzer)).sections[0];
  const contour = jaContour(marked, model.contour);
  const units = marked.toks.filter((t) => t.kind === "unit");
  if (units.length !== morae.length || !morae.length) return null;
  return {
    name: `SYN_${index}_${frame}`,
    morae: morae.map((m, i) => ({ ipa: m.ipa, span: m.span, word: m.word, bound: i ? "" : "start", ppos: i })),
    y: units.map((t) => contour.get(t) ?? [0, 0, 0]),
  };
}
for (const [index, [surface, kana]] of requests.entries()) {
  for (let frame = 0; frame < 3; frame++) {
    try {
      const r = row(surface, kana, frame, index);
      if (r) {
        fs.writeSync(out, JSON.stringify(r) + "\n");
        made++;
      } else skipped++;
    } catch {
      skipped++;
    }
  }
  if (index % 5000 === 0) console.log(index, made, skipped);
}
fs.closeSync(out);
fs.writeFileSync("work/inflection_generation.json", JSON.stringify({ made, skipped }));
console.log({ made, skipped });
