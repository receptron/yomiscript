// Part B: code-switching. Whether the LLM's YomiScript puts the words meant in English into an English section (and
// the loanwords not), what Kokoro is given, and whether Whisper hears the English words as English.
// mixedReport() -> markdown; writes results/mixed_items.json
import { isJa, parse } from "@yomiscript/core";
import { LLMS, MIXED_ITEMS, readJson, writeJson } from "./common.mjs";

const norm = (s) =>
  s
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const has = (text, target) => ` ${norm(text)} `.includes(` ${norm(target)} `);
// the words as the text writes them: Latin letters as words, katakana as a substring
const written = (heard, target) => (/[A-Za-z]/.test(target) ? has(heard, target) : heard.includes(target));
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(0)}%` : "-");

/** the text each non-Japanese section of a YomiScript reads (its <t:…>) */
function otherText(ys) {
  try {
    const u = parse(ys);
    return u.sections
      .filter((s) => !isJa(s.lang))
      .map((s) => [...new Set(s.toks.filter((t) => t.span !== undefined).map((t) => u.texts[t.span]))].join(""))
      .join(" | ");
  } catch {
    return null;
  }
}
function wordAcc(heard, target) {
  // share of the target's words heard, in order (a longest common subsequence over words)
  const a = norm(target).split(" "),
    b = norm(heard).split(" ").filter(Boolean),
    L = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) L[i][j] = a[i - 1] === b[j - 1] ? L[i - 1][j - 1] + 1 : Math.max(L[i - 1][j], L[i][j - 1]);
  return L[a.length][b.length] / a.length;
}

function condition(x, cond, u, asr) {
  const other = cond.startsWith("ys_") ? otherText(u.ys) : "",
    segs = Object.keys(asr).filter((k) => k.startsWith(`${cond}/${x.name}.en`)),
    segText = segs.map((k) => asr[k]).join(" "),
    heard = asr[`${cond}/${x.name}.wav`] ?? null;
  return {
    ps: u.ps,
    tagged: other ? has(other, x.target) : false,
    heard,
    latin: heard !== null && written(heard, x.target),
    segText: segs.length ? segText : null,
    segAcc: segs.length ? wordAcc(segText, x.target) : null,
  };
}
function perItem() {
  const used = readJson("results/mixed_ys.json").used,
    asr = readJson("results/asr.json"),
    conds = ["ys", "kana"].flatMap((kind) => LLMS.map((l) => `${kind}_${l}`));
  return MIXED_ITEMS().map((x) => {
    const c = {};
    for (const cond of conds) if (used[cond]?.[x.name]) c[cond] = condition(x, cond, used[cond][x.name], asr);
    return { ...x, c };
  });
}

function table(I) {
  const en = I.filter((x) => x.intent === "en"),
    ja = I.filter((x) => x.intent === "ja");
  const rows = [
    `| condition | English words in an \`en\` section (of ${en.length}) | loanwords put in an \`en\` section (of ${ja.length}) | Whisper (ja) writes the English words in Latin letters (of ${en.length}) | Whisper (ja) writes the loanword as the text does (of ${ja.length}) | Whisper (en) on the English words alone (the YomiScript's \`en\` section; the stretch of the kana audio): words heard |`,
    "|---|---|---|---|---|---|",
  ];
  for (const kind of ["ys", "kana"])
    for (const l of LLMS) {
      const k = `${kind}_${l}`,
        E = en.filter((x) => x.c[k]),
        J = ja.filter((x) => x.c[k]),
        seg = E.filter((x) => x.c[k].segAcc !== null);
      const words = pct(
        seg.reduce((n, x) => n + x.c[k].segAcc, 0),
        seg.length,
      );
      const segCell = seg.length ? `${words}; all words in ${seg.filter((x) => x.c[k].segAcc === 1).length} of ${seg.length}` : "-";
      rows.push(
        `| ${kind === "ys" ? "YomiScript" : "kana"} ${l} | ${E.filter((x) => x.c[k].tagged).length} | ${J.filter((x) => x.c[k].tagged).length} | ${E.filter((x) => x.c[k].latin).length} | ${J.filter((x) => x.c[k].latin).length} | ${segCell} |`,
      );
    }
  return rows.join("\n");
}
function examples(I) {
  const out = [];
  for (const name of ["en_01", "en_09", "en_11", "ja_05"]) {
    const x = I.find((y) => y.name === name);
    out.push(`- ${x.name} (${x.intent}) ${x.text}`);
    for (const k of ["ys_claude", "kana_claude"]) {
      const c = x.c[k];
      const given = c ? c.ps.map(([l, p]) => "[" + l + "] `" + p + "`").join(" ") : "";
      if (c) out.push(`  - ${k}: Kokoro gets ${given}; Whisper (ja): ${c.heard}`);
    }
  }
  return out.join("\n");
}

export function mixedReport() {
  const I = perItem();
  writeJson("results/mixed_items.json", I);
  return [
    `### B. Code-switching (${I.length} sentences: ${I.filter((x) => x.intent === "en").length} with English meant as English, ${I.filter((x) => x.intent === "ja").length} loanword controls)`,
    "",
    table(I),
    "",
    "What Kokoro is given and what Whisper heard (Claude's answers):",
    "",
    examples(I),
  ].join("\n");
}
