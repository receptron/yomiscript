// A blind listening test for the trial, rep 2, three ways:
//   kokoro  the `none` run's YomiScript (no marks), Kokoro's own pitch
//   rules   the rules on the marked phrases, Kokoro's pitch elsewhere
//   halved  the same values halved
// The marks come from the second pass (`twopass`: addmarks, the same reading as kokoro), from one pass (`onepass`:
// every, the reading and the marks written together, so the reading may differ, as a prompt-only change would give),
// or from the dictionary (`dict`: dict_marks.mjs on the same reading as kokoro).
// usage: node listen.mjs [twopass|onepass|dict]   -> audio/[onepass/]<variant>/<set>.<name>.wav and listen.json there;
//        open listen.html (twopass) or listen.html?test=onepass, served from here
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { realize } from "@yomiscript/core";
import { engine, K } from "../../../../demo/ys_web/node.mjs";
import { SETS } from "../../sets.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REP = 2;
const TEST = process.argv[2] ?? "twopass";
const MARKS = { twopass: "addmarks", onepass: "every", dict: "dict" }[TEST];
const OUT = path.join(HERE, "audio", TEST === "twopass" ? "" : TEST);
const PICK = {
  hard: ["h001", "h004", "h007", "h011", "h012", "h017", "h020", "h021", "h024", "h025", "h026", "h031"],
  ja: ["plain", "comma", "ka_question", "geminate", "two_sentences", "kanji_names"],
};
const E = await engine("fp32");
const halve = (ys) =>
  ys.replace(
    /<f0:([^>]*)>/g,
    (_, v) =>
      `<f0:${v
        .split(",")
        .map((x) => Math.round(50 * Number(x)) / 100)
        .join(",")}>`,
  );
const runFile = (k, set) =>
  k === "dict" ? path.join(HERE, "runs", "dict", `claude.${set}.${REP}.json`) : path.join(HERE, "runs", "claude", `${k}.${set}.${REP}.json`);
const run = (k, set) => JSON.parse(fs.readFileSync(runFile(k, set), "utf8")).output;
const items = [];
for (const [set, names] of Object.entries(PICK)) {
  const marked = run(MARKS, set),
    plain = run("none", set);
  for (const name of names) {
    const ys = marked[name],
      rules = realize(ys, { markedOnly: true });
    const v = { kokoro: [plain[name], "engine"], rules: [rules, "values"], halved: [halve(rules), "values"] };
    for (const [key, [y, mode]] of Object.entries(v)) {
      const dir = path.join(OUT, key);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${set}.${name}.wav`), Buffer.from(K.wav((await E.synth(y, mode)).audio)));
    }
    const text = SETS[set].find((x) => x.name === name).text;
    items.push({ set, name, text, marks: ys.replace(/<t:[^>]*>/g, "") });
    console.log(set, name);
  }
}
fs.writeFileSync(path.join(OUT, "listen.json"), JSON.stringify({ variants: ["kokoro", "rules", "halved"], items }, null, 1));
