// LLM-as-Yomite experiment: ask Claude Code and Codex to write YomiScript with pitch values, then score and export.
// usage: node run.mjs [claude|codex ...] [--set en] [--task text|marked ...]   (default: both LLMs, both tasks)
//   --set en: English items (items_en.json; reference and prompt examples from the Kokoro-based English Yomite)
//   task "text":   plain text -> YomiScript with IPA, marks and <f0:…> values (the LLM is the whole Yomite)
//   task "marked": marked YomiScript -> the same with <f0:…> values (the LLM is only the prosody stage)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { realize } from "@yomiscript/core";
import { call, json } from "./llm.mjs";
const HERE = path.dirname(fileURLToPath(import.meta.url)),
  OUT = path.join(HERE, "results");
let args = process.argv.slice(2);
const si = args.indexOf("--set"),
  SET = si >= 0 ? args[si + 1] : "";
if (si >= 0) args.splice(si, 2);
const ti = args.indexOf("--task");
const DEFAULT_TASKS = SET ? ["text"] : ["text", "marked"]; // the English set has no marked task
const TASKS = ti >= 0 ? args.slice(ti + 1) : DEFAULT_TASKS,
  LLMS = (ti >= 0 ? args.slice(0, ti) : args).filter(Boolean);
const D = JSON.parse(fs.readFileSync(path.join(HERE, SET ? `items_${SET}.json` : "items.json")));
const ref = (x) => x.ys ?? realize(x.marked, { dialect: x.dialect });
const TEMPLATE = fs.readFileSync(path.join(HERE, "prompt.md"), "utf8");
const dialectNote = (x) => (x.dialect?.ja === "osaka" ? " (Japanese accent: Osaka / Keihan-type dialect)" : "");
const TASK_TEXT = {
  text: "For each item, write the YomiScript for the given text in the given language, with pitch values for every mora or syllable.",
  marked:
    "For each item you are given YomiScript with accent marks but no pitch values. Add `<f0:…>` values for every mora or syllable. Keep the IPA, the marks, the boundaries and the language tags exactly as given; you may only add `<f0:…>` values and `◌̥` for devoiced vowels.",
};
function prompt(task) {
  const ex = D.examples
    .map((x) =>
      task === "text" ? `Input (${x.lang}${dialectNote(x)}): ${x.text}\nOutput: ${ref(x)}` : `Input${dialectNote(x)}: ${x.marked}\nOutput: ${ref(x)}`,
    )
    .join("\n\n");
  const it = D.items
    .map((x) => (task === "text" ? `- ${x.name} (${x.lang}${dialectNote(x)}): ${x.text}` : `- ${x.name}${dialectNote(x)}: ${x.marked}`))
    .join("\n");
  return TEMPLATE.replace("{{EXAMPLES}}", ex).replace("{{TASK}}", TASK_TEXT[task]).replace("{{ITEMS}}", it);
}
fs.mkdirSync(OUT, { recursive: true });
for (const llm of LLMS.length ? LLMS : ["claude", "codex"])
  for (const task of TASKS) {
    const tag = (SET ? SET + "." : "") + task,
      p = prompt(task);
    fs.writeFileSync(path.join(OUT, `prompt.${tag}.md`), p);
    process.stdout.write(`${llm} / ${tag} … `);
    const r = call(llm, p),
      out = json(r.text);
    fs.writeFileSync(
      path.join(OUT, `${llm}.${tag}.json`),
      JSON.stringify(
        {
          llm,
          task,
          set: SET || "ja",
          model: r.model,
          seconds: r.seconds,
          date: new Date().toISOString(),
          output: out,
          raw: out ? undefined : r.text,
          stderr: r.stderr || undefined,
        },
        null,
        1,
      ),
    );
    console.log(out ? `${Object.keys(out).length} items, ${r.seconds.toFixed(0)} s, model ${r.model}` : "no JSON in the answer (see raw)");
  }
