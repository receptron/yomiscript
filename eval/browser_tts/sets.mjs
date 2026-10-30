// The texts of the comparison, read from where they already live (no copies):
//   ja / en  the Kokoro parity texts (eval/kokoro_parity), compared with the original Kokoro front end
//   hard     the hand-made hard set (eval/data/hard_set.tsv), compared with its gold readings
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export const HERE = path.dirname(fileURLToPath(import.meta.url));
const EVAL = path.join(HERE, "..");
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(EVAL, f), "utf8"));

function hardSet() {
  return fs
    .readFileSync(path.join(EVAL, "data/hard_set.tsv"), "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const [name, category, text, gold] = l.split("\t");
      return { name, category, text, gold: gold.split("|"), lang: "ja" };
    });
}
/** a prompt template ({{EXAMPLES}}, {{ITEMS}}) filled with examples.json and the items */
export function buildPrompt(template, items, examples = readJson("browser_tts/examples.json")) {
  const ex = examples.map((x) => `Input (${x.lang}): ${x.text}\nOutput: ${x.ys}`).join("\n\n");
  const it = items.map((x) => `- ${x.name} (${x.lang}): ${x.text}`).join("\n");
  return template.replace("{{EXAMPLES}}", ex).replace("{{ITEMS}}", it);
}
export const SETS = {
  ja: readJson("kokoro_parity/texts_ja.json").map((x) => ({ ...x, lang: "ja" })),
  en: readJson("kokoro_parity/texts.json").map((x) => ({ ...x, lang: "en-US" })),
  hard: hardSet(),
};
