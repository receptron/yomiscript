// The JSUT sentences ready to score (score.mjs, rules.mjs): the LLM's answer read as the gold reads it (the same
// kana, ヲ=オ ヂ=ジ ヅ=ズ, and the same number of morae), with the gold's morae.
import fs from "fs";
import path from "path";
import { parse } from "@yomiscript/core";
import { norm, ysKana } from "../koriyama_g2p/kana.mjs";
import { goldMorae, ourMorae } from "./morae.mjs";
import { answered, items, RAW } from "./run.mjs";

/** the answer of each sentence: the reused ones and those of the batches */
export function answers() {
  const out = new Map(),
    reused = JSON.parse(fs.readFileSync(path.join(RAW, "reused.json"), "utf8"));
  for (const [name, r] of Object.entries(reused)) out.set(name, { ys: r.ys, llm: "codex" });
  const B = JSON.parse(fs.readFileSync(path.join(RAW, "batches.json"), "utf8"));
  B.forEach((names, b) => {
    const f = answered(b);
    if (!f) return;
    const r = JSON.parse(fs.readFileSync(f, "utf8"));
    for (const n of names) if (typeof r.output?.[n] === "string") out.set(n, { ys: r.output[n], llm: r.llm });
  });
  return out;
}

export const goldKana = (sym) => sym.replace(/[\^$?[\]#_]/g, "");
/** a sentence ready to score: its gold morae and its YomiScript, or why not */
function scorable(x, ans) {
  if (!ans) return { why: "no answer" };
  let u;
  try {
    u = parse(ans.ys);
  } catch {
    return { why: "not parsed" };
  }
  if (!u.texts.length) return { why: "no <t:>" };
  if (norm(ysKana(ans.ys).kana, true) !== norm(goldKana(x.gold), true)) return { why: "read another way" };
  const G = goldMorae(x.gold),
    n = ourMorae(ans.ys).length;
  return n === G.length ? { G, u } : { why: "mora count" };
}

/** the sentences that can be scored ({ x, ys, llm, G, u }), and why the others cannot */
export function scoredSentences() {
  const ans = answers(),
    out = [],
    why = {};
  for (const x of items()) {
    const a = ans.get(x.name),
      s = scorable(x, a);
    if (s.G) out.push({ x, ys: a.ys, llm: a.llm, G: s.G, u: s.u });
    else why[s.why] = (why[s.why] ?? 0) + 1;
  }
  return Object.assign(out, { why, answers: ans });
}
