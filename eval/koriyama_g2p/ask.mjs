// One call of an LLM on one batch of sentences, saved as a raw record (shared by run.mjs and eval/koriyama_matched).
// A record already on disk is kept, so a run that stopped continues where it was. An answer without JSON is asked
// once more, as eval/representation does. A call with no answer at all (a quota or service error) saves nothing, so
// a later run asks again.
import fs from "fs";
import path from "path";
import { callAsync, json } from "../llm_yomite/llm.mjs";

// a usage-limit notice in place of an answer (Claude Code prints it as its result): not saved either
const LIMIT = /hit your .*limit|usage limit|quota reached/i;

/** ask `llm` the prompt `p` for `items` and write the record to `file`; `meta` ({ llm, format, batch }) heads the record */
export async function askBatch({ file, llm, p, items, meta }) {
  if (fs.existsSync(file)) return;
  const tries = [],
    label = `${meta.llm} ${meta.format} b${meta.batch}`;
  let r, out;
  for (let i = 0; i < 2 && !out; i++) {
    r = await callAsync(llm, p);
    out = json(r.text);
    tries.push({ seconds: r.seconds, json: !!out });
  }
  if (!r.text?.trim() || (!out && LIMIT.test(r.text))) {
    console.log(`${label}: no answer (${(r.stderr || r.text || "").trim().split("\n")[0].slice(0, 120)})`);
    return;
  }
  const rec = { ...meta, names: items.map((x) => x.name), model: r.model, seconds: r.seconds, outputTokens: r.outputTokens, tries };
  Object.assign(rec, { date: new Date().toISOString(), output: out, raw: r.text, ...(r.stderr ? { stderr: r.stderr } : {}) });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(rec, null, 1));
  const got = out ? items.filter((x) => typeof out[x.name] === "string").length : 0;
  const what = out ? `${got}/${items.length} items` : "no JSON";
  console.log(`${label}: ${what}, ${r.seconds.toFixed(0)} s, ${r.outputTokens ?? "?"} tokens`);
}
