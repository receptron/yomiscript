// Part A: the accent of each target word as each condition marks it, against the gold (OpenJTalk / NAIST-JDIC through
// @yomiscript/ja-accent, on the original text), and whether the pitch of the audio moves where the gold says it does.
// accentReport() -> markdown; writes results/accent_items.json
import fs from "fs";
import path from "path";
import { accentMarks } from "@yomiscript/ja-accent";
import { ACCENT_ITEMS, HERE, LLMS, analyzer, levels, llmFile, locate, morae, nucleus, readJson, targetKeys, writeJson } from "./common.mjs";

const RUNS = [1, 2, 3];
const CONDS = ["kokoro", "kana_dict", "dict", ...LLMS];
const BIG = 1; // semitones: a move at least this large counts as clearly realized
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(0)}%` : "-");
const mean = (v) => v.reduce((a, b) => a + b, 0) / v.length;

/** the target's accent in a YomiScript: { nucleus, levels (word + next mora) } or { missing } */
function accentOf(ys, x, keys) {
  if (!ys) return { missing: "no output" };
  let M;
  try {
    M = morae(ys);
  } catch {
    return { missing: "does not parse" };
  }
  const i = locate(M, keys, x.word);
  if (i < 0) return { missing: "read another way" };
  return { i, nucleus: nucleus(M, i, keys.length), levels: levels(M).slice(i, i + keys.length + 1) };
}
function llmRuns(llm) {
  return RUNS.map((r) => {
    const f = llmFile("accent", llm, r);
    return fs.existsSync(path.join(HERE, f)) ? (readJson(f).output ?? {}) : {};
  });
}

/** directed pitch moves on the target: for each neighbouring pair whose gold levels differ, the F0 change in the
 * gold's direction (positive = as expected) */
function moves(w, levels) {
  if (!w) return null;
  const out = [];
  for (let j = 0; j + 1 < levels.length; j++) {
    const [a, b] = [levels[j], levels[j + 1]];
    if (!a || !b || a === b || w[j] == null || w[j + 1] == null) continue;
    out.push(Number(((w[j + 1] - w[j]) * (b === "H" ? 1 : -1)).toFixed(2)));
  }
  return out;
}
/** the F0 of the target word and the mora after it, per measure; null when the audio's morae are not the YomiScript's */
function window(f0, ys, at, n) {
  if (!f0 || at?.i === undefined || f0.end.length !== morae(ys).length) return null;
  return { end: f0.end.slice(at.i, at.i + n + 1), median: f0.median.slice(at.i, at.i + n + 1) };
}

function perItem(a) {
  const used = readJson("results/accent_ys.json").used,
    f0 = readJson("results/f0.json"),
    base = readJson("results/base.json"),
    runs = Object.fromEntries(LLMS.map((l) => [l, llmRuns(l)]));
  return ACCENT_ITEMS().map((x) => {
    const keys = targetKeys(x, base[x.name]),
      gold = accentOf(accentMarks(base[x.name].ys, a), x, keys),
      llm = Object.fromEntries(LLMS.map((l) => [l, runs[l].map((o) => accentOf(o[x.name], x, keys))])),
      cond = {};
    for (const c of CONDS) {
      const ys = used[c]?.[x.name]?.ys,
        at = ys ? accentOf(ys, x, keys) : null;
      cond[c] = { nucleus: at?.nucleus, f0: ys ? window(f0[c]?.[x.name], ys, at, keys.length) : null };
    }
    return { ...x, morae: keys.length, gold: gold.nucleus, goldLevels: gold.levels, llm, cond };
  });
}

function accuracyTable(I) {
  const rows = ["| LLM | right vs gold, runs 1 / 2 / 3 | mean | right vs textbook (mean) | read another way | no output |", "|---|---|---|---|---|---|"];
  for (const l of LLMS) {
    const per = RUNS.map((_, r) => I.filter((x) => x.llm[l][r].nucleus === x.gold).length),
      tb = mean(RUNS.map((_, r) => I.filter((x) => x.llm[l][r].nucleus === x.textbook).length)),
      other = I.reduce((n, x) => n + x.llm[l].filter((o) => o.missing === "read another way").length, 0),
      none = I.reduce((n, x) => n + x.llm[l].filter((o) => o.missing && o.missing !== "read another way").length, 0);
    rows.push(`| ${l} | ${per.join(" / ")} of ${I.length} | ${pct(mean(per), I.length)} | ${pct(tb, I.length)} | ${other} | ${none} |`);
  }
  const kd = I.filter((x) => x.cond.kana_dict.nucleus === x.gold).length;
  rows.push(
    `| kana through OpenJTalk (kana_dict) | ${kd} of ${I.length} | ${pct(kd, I.length)} | ${pct(I.filter((x) => x.cond.kana_dict.nucleus === x.textbook).length, I.length)} | | |`,
  );
  return rows.join("\n");
}
const movesOf = (x, c, key) => moves(x.cond[c].f0?.[key], x.goldLevels);
function f0Table(I, key) {
  const rows = [
    `| condition | items measured | expected moves | right direction | right and >= ${BIG} st | median move in the expected direction (st) | items with every move right |`,
    "|---|---|---|---|---|---|---|",
  ];
  for (const c of CONDS) {
    const M = I.map((x) => movesOf(x, c, key)).filter((m) => m && m.length),
      all = M.flat().sort((a, b) => a - b);
    const med = all.length ? all[Math.floor(all.length / 2)].toFixed(2) : "-";
    rows.push(
      `| ${c} | ${M.length} | ${all.length} | ${pct(all.filter((d) => d > 0).length, all.length)} | ${pct(all.filter((d) => d >= BIG).length, all.length)} | ${med} | ${M.filter((m) => m.every((d) => d > 0)).length} |`,
    );
  }
  return rows.join("\n");
}
function f0WhenMarkedRight(I, key) {
  // the rendering alone: only the items where the condition's marks give the gold's accent on the target
  return CONDS.filter((c) => c !== "kokoro")
    .map((c) => {
      const all = I.filter((x) => x.cond[c].nucleus === x.gold).flatMap((x) => movesOf(x, c, key) ?? []);
      return `${c} ${pct(all.filter((d) => d > 0).length, all.length)} of ${all.length}`;
    })
    .join(", ");
}
/** the minimal pairs: two words of a set with the same number of morae and different gold accents. At each mora
 * where their gold shapes (H = 1, L = 0, relative to the word's first mora) differ, the difference of their F0
 * shapes should have the same sign: the audio tells the two words apart the way the accents do */
const lv = (x, j) => (x.goldLevels[j] === "H" ? 1 : 0);
const isPair = (a, b) => a.set === b.set && a.morae === b.morae && a.goldLevels.join() !== b.goldLevels.join();
function pairPoints(a, b, wa, wb) {
  const out = [];
  for (let j = 1; j < a.goldLevels.length; j++) {
    const e = lv(a, j) - lv(a, 0) - (lv(b, j) - lv(b, 0));
    if (e && [wa[0], wa[j], wb[0], wb[j]].every((v) => v != null)) out.push((wa[j] - wa[0] - (wb[j] - wb[0])) * Math.sign(e));
  }
  return out;
}
function pairContrasts(I, c, key) {
  const out = [];
  for (const [i, a] of I.entries())
    for (const b of I.slice(i + 1)) {
      const [wa, wb] = [a.cond[c].f0?.[key], b.cond[c].f0?.[key]];
      if (isPair(a, b) && wa && wb) out.push(...pairPoints(a, b, wa, wb));
    }
  return out;
}
function contrastTable(I) {
  const rows = ["| condition | pairs' points compared | right direction | median difference in the expected direction (st) |", "|---|---|---|---|"];
  for (const c of CONDS) {
    const d = pairContrasts(I, c, "end").sort((a, b) => a - b);
    rows.push(`| ${c} | ${d.length} | ${pct(d.filter((v) => v > 0).length, d.length)} | ${d.length ? d[Math.floor(d.length / 2)].toFixed(2) : "-"} |`);
  }
  return rows.join("\n");
}
function disagreements(I) {
  const D = I.filter((x) => x.gold !== x.textbook);
  if (!D.length) return "none";
  return D.map(
    (x) => `${x.word} (${x.name}: OpenJTalk ${x.gold}, textbook ${x.textbook}; LLMs run 1: ${LLMS.map((l) => x.llm[l][0].nucleus ?? "-").join(" / ")})`,
  ).join("; ");
}

export async function accentReport() {
  const I = perItem(await analyzer());
  writeJson("results/accent_items.json", I);
  const sets = new Set(I.map((x) => x.set)).size;
  return [
    `### A. Pitch accent (${I.length} words in ${sets} minimal sets)`,
    "",
    "Accent of the target word: the mora after which the pitch falls (0 = flat), as the gold (OpenJTalk / NAIST-JDIC on the original sentence) has it.",
    "",
    accuracyTable(I),
    "",
    `Gold and the textbook accent disagree on: ${disagreements(I)}.`,
    "",
    "Pitch of the audio on the target word and the mora after it, at the end of each mora (the median of the voiced frames of its second half): each neighbouring pair whose gold H / L differ is an expected move (a rise or a fall).",
    "",
    f0Table(I, "end"),
    "",
    `Only where the condition's marks give the gold accent on the target: ${f0WhenMarkedRight(I, "end")} of the expected moves in the right direction.`,
    "",
    "The same with each mora's median over all its voiced frames (shown because it reads the accented first mora as rising; see README.md):",
    "",
    f0Table(I, "median"),
    "",
    "Minimal pairs (same set, same number of morae, different gold accent): does the difference between the two words' pitch shapes (end of each mora, relative to the word's first mora) go the way their accents differ? Kokoro's own pitch has the same phonemes for both words, so it can only differ by the sentence around them.",
    "",
    contrastTable(I),
  ].join("\n");
}
