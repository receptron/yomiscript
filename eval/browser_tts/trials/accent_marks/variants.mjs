// The sentences and the three ways of the blind listening tests (rep 2), shared by listen.mjs and eval/prosody_ref:
//   kokoro  the `none` run's YomiScript (no marks), Kokoro's own pitch
//   rules   the rules on the marked phrases, Kokoro's pitch elsewhere
//   halved  the same values halved
// The marks come from the second pass (`twopass`: addmarks, the same reading as kokoro), from one pass (`onepass`:
// every, the reading and the marks written together, so the reading may differ, as a prompt-only change would give),
// or from the dictionary (`dict`: dict_marks.mjs on the same reading as kokoro).
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { realize } from "@yomiscript/core";
import { SETS } from "../../sets.mjs";

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REP = 2;
export const TESTS = ["twopass", "onepass", "dict"];
export const PICK = {
  hard: ["h001", "h004", "h007", "h011", "h012", "h017", "h020", "h021", "h024", "h025", "h026", "h031"],
  ja: ["plain", "comma", "ka_question", "geminate", "two_sentences", "kanji_names"],
};
const MARKS = { twopass: "addmarks", onepass: "every", dict: "dict" };
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

/** each picked sentence of a test: its text, the marked YomiScript, and each variant as [YomiScript, pitch mode] */
export function* sentences(test) {
  for (const [set, names] of Object.entries(PICK)) {
    const marked = run(MARKS[test], set),
      plain = run("none", set);
    for (const name of names) {
      const ys = marked[name],
        rules = realize(ys, { markedOnly: true });
      const variants = { kokoro: [plain[name], "engine"], rules: [rules, "values"], halved: [halve(rules), "values"] };
      yield { set, name, text: SETS[set].find((x) => x.name === name).text, marks: ys, variants };
    }
  }
}
