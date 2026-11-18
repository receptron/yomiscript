// Evaluation-only teachers from the maintainer's confirmed accents, never training data.
import fs from "node:fs";
import path from "node:path";
import { applyEdits, jaContour, parse } from "@yomiscript/core";
import { accentMarks, marksFor, phraseUnits } from "@yomiscript/ja-accent";
import { nodeAnalyzer, nodePitchModel } from "@yomiscript/ja-accent/node";
const rows = JSON.parse(fs.readFileSync("work/rows_all.json", "utf8")).checks,
  cache = path.join(process.env.HOME, ".cache/yomiscript"),
  dir = path.join(cache, "ja-dict"),
  analyzer = await nodeAnalyzer({ dir: path.join(dir, fs.readdirSync(dir)[0]) }),
  model = await nodePitchModel({ dir: path.join(cache, "ja-pitch/qwen-2") }),
  confirmed = [[0], [3], [], [], [0], [0], [], [0], [0], [], [0], [0], [], [0], [0], [1]],
  output = {};
function values(marked) {
  const section = parse(marked).sections[0],
    contour = jaContour(section, model.contour);
  return section.toks.filter((t) => t.kind === "unit").map((t) => contour.get(t) ?? [0, 0, 0]);
}
function withSpans(row) {
  const starts = new Set(row.dict.starts),
    chunks = [];
  row.morae.forEach((m, i) => {
    let separator = i && row.morae[i - 1].span !== m.span ? " " : "";
    if (i && starts.has(i)) separator = " | ";
    chunks.push(`${separator}${m.ipa}`);
    if (i === row.morae.length - 1 || row.morae[i + 1].span !== m.span) chunks.push(`<t:${m.word}>`);
  });
  return `ja /${chunks.join("")} ↘/`;
}
rows.forEach((row, i) => {
  const bare = withSpans(row),
    groups = phraseUnits(parse(bare).sections[0]);
  const dictionaryMarked = accentMarks(bare, analyzer),
    units = parse(dictionaryMarked).sections[0].toks.filter((t) => t.kind === "unit"),
    contextFalls = units.flatMap((t, j) => (t.fall ? [j] : [])),
    [start, end] = { 1: [3, units.length], 11: [0, 3], 12: [0, 3], 13: [0, 4], 14: [0, 4] }[i] ?? [0, units.length],
    targetFalls = confirmed[i].filter((f) => f >= start && f < end),
    falls = [...contextFalls.filter((f) => f < start || f >= end), ...targetFalls].sort((a, b) => a - b);
  let at = 0;
  const edits = groups.flatMap((group) => {
    const fall = falls.find((f) => f >= at && f < at + group.length),
      k = fall === undefined ? 0 : fall - at + 1;
    at += group.length;
    return marksFor(group, k);
  });
  output[row.name] = { gold: values(applyEdits(bare, edits)), dict: values(dictionaryMarked), bare, confirmed_falls: targetFalls };
});
fs.writeFileSync("work/check_values.json", JSON.stringify(output));
