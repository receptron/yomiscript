// Score the readings: every system's output goes through the Katarite's plan (YomiScript -> Kokoro's phoneme string),
// then is compared with the original Kokoro front end (sets ja, en) or with the gold readings (set hard).
// usage: node score.mjs      writes results/summary.md
import fs from "fs";
import path from "path";
import { parse } from "@yomiscript/core";
import { HERE, SETS } from "./sets.mjs";
import { bare, lev, loose, ps } from "./reading.mjs";

const OUT = path.join(HERE, "results");
const REFS = JSON.parse(fs.readFileSync(path.join(HERE, "refs.json"), "utf8"));
const LLMS = ["claude", "codex"].filter((l) => fs.existsSync(path.join(OUT, `${l}.ja.json`)));

// English: stress marks and Kokoro's reduced-vowel symbols (ɐ ᵊ ᵻ) and flap (T) are phonetic detail, not a different reading
const looseEn = (p) => bare(p).replace(/[ˈˌ]/g, "").replace(/[ɐᵊᵻ]/g, "ə").replace(/T/g, "t");
const per = (got, want) => lev(bare(got), bare(want)) / [...bare(want)].length;

function systems(set) {
  const S = {};
  for (const llm of LLMS) {
    const f = path.join(OUT, `${llm}.${set}.json`);
    if (!fs.existsSync(f)) continue;
    const R = JSON.parse(fs.readFileSync(f, "utf8"));
    S[`${llm} (${R.model ?? "?"})`] = { ys: SETS[set].map((x) => R.output?.[x.name] ?? null), outputTokens: R.outputTokens, seconds: R.seconds };
  }
  return S;
}
const ITEMS = {}; // per set and system: what Kokoro is given and whether the reading is right, for listen.html
function record(set, name, got, ok) {
  ITEMS[set] ??= {};
  ITEMS[set][name] = got.map((ps, i) => ({ ps, ok: ok[i] }));
}
const pct = (n, d) => `${((100 * n) / d).toFixed(1)}% (${n}/${d})`;

// ja, en: how close is the system to the original Kokoro front end
function parityTable(set) {
  const refs = REFS[set],
    want = refs.map((r) => r.ps.join(" "));
  const S = systems(set);
  if (set === "ja") S["pyopenjtalk (= piper-plus front end)"] = { ys: refs.map((r) => r.openjtalk) };
  const rows = [];
  const diffs = [];
  for (const [name, s] of Object.entries(S)) {
    const got = s.ys.map((y) => (y ? ps(y) : null));
    const ok = got.filter((g) => g !== null).length;
    const eq = set === "ja" ? loose : looseEn;
    const same = got.filter((g, i) => g === want[i]).length,
      phon = got.filter((g, i) => g !== null && bare(g) === bare(want[i])).length,
      reading = got.filter((g, i) => g !== null && eq(g) === eq(want[i])).length;
    const errs = got.map((g, i) => (g === null ? 1 : per(g, want[i])));
    record(
      set,
      name,
      got,
      got.map((g, i) => g !== null && eq(g) === eq(want[i])),
    );
    rows.push(
      `| ${name} | ${ok}/${got.length} | ${pct(same, got.length)} | ${pct(phon, got.length)} | ${pct(reading, got.length)} | ${(100 * mean(errs)).toFixed(2)}% |`,
    );
    got.forEach((g, i) => {
      if (g === null || bare(g) !== bare(want[i]))
        diffs.push(`- ${name} \`${refs[i].name}\`: ${SETS[set][i].text}\n  - original: \`${want[i]}\`\n  - system:   \`${g}\``);
    });
  }
  return { rows, diffs };
}
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

// hard: how often is the reading right (gold), overall and per category
function hardTable() {
  const refs = REFS.hard,
    items = SETS.hard;
  const S = {
    ...systems("hard"),
    "original Kokoro front end (misaki)": { ys: refs.map((r) => r.ys.join(" ")) },
    "pyopenjtalk (= piper-plus front end)": { ys: refs.map((r) => r.openjtalk) },
  };
  const gold = refs.map((r) => r.gold.map(ps));
  const cats = [...new Set(items.map((x) => x.category))];
  const rows = [],
    diffs = [];
  for (const [name, s] of Object.entries(S)) {
    const got = s.ys.map((y) => (y ? ps(y) : null));
    const right = got.map((g, i) => g !== null && gold[i].some((w) => w && loose(w) === loose(g)));
    record("hard", name, got, right);
    const cell = (f) => {
      const idx = items.map((x, i) => i).filter((i) => f(items[i]));
      return pct(idx.filter((i) => right[i]).length, idx.length);
    };
    rows.push(`| ${name} | ${cell(() => true)} | ${cats.map((c) => cell((x) => x.category === c)).join(" | ")} |`);
    got.forEach((g, i) => {
      if (!right[i]) diffs.push(`- ${name} \`${items[i].name}\` ${items[i].text}\n  - gold:   \`${gold[i].join(" / ")}\`\n  - system: \`${g}\``);
    });
  }
  return { head: `| system | all | ${cats.join(" | ")} |\n|---|---|${cats.map(() => "---|").join("")}`, rows, diffs };
}

// D23: does joining the <t:…> values give back the input? (whitespace ignored: a newline in the input has no place in YomiScript)
function textRows() {
  const flat = (x) => x.replace(/\s+/g, "");
  const rows = [];
  for (const set of Object.keys(SETS))
    for (const [name, s] of Object.entries(systems(set))) {
      let annotated = 0,
        exact = 0;
      const bad = [];
      s.ys.forEach((y, i) => {
        const texts = y ? parse(y).texts : [];
        if (texts.length) annotated++;
        if (texts.length && flat(texts.join("")) === flat(SETS[set][i].text)) exact++;
        else if (texts.length) bad.push(SETS[set][i].name);
      });
      rows.push(`| ${name} | ${set} | ${pct(annotated, s.ys.length)} | ${pct(exact, s.ys.length)} | ${bad.slice(0, 6).join(", ")} |`);
    }
  return rows;
}
function cost() {
  const rows = [];
  for (const set of Object.keys(SETS))
    for (const [name, s] of Object.entries(systems(set))) {
      const text = SETS[set].map((x) => x.text).join("").length,
        ys = s.ys.filter(Boolean).join("").length;
      rows.push(`| ${name} | ${set} | ${text} | ${ys} | ${(ys / text).toFixed(1)} | ${s.outputTokens ?? "–"} | ${s.seconds.toFixed(0)} |`);
    }
  return rows;
}

const ja = parityTable("ja"),
  en = parityTable("en"),
  hard = hardTable();
const PHEAD =
  "| system | valid | phoneme string identical | phonemes identical (word spaces ignored) | same reading (spelling and phonetic detail ignored) | phoneme error rate |\n|---|---|---|---|---|---|";
const md = `# LLM as the Yomite for Kokoro: readings compared

Generated by \`score.mjs\` on ${new Date().toISOString().slice(0, 10)}. Every output goes through the Katarite's plan (\`demo/ys_web/web/ys.js\`) to the phoneme string Kokoro is given.

## Japanese parity texts vs the original Kokoro front end (${SETS.ja.length} texts)

${PHEAD}
${ja.rows.join("\n")}

## English parity texts vs the original Kokoro front end (${SETS.en.length} texts)

${PHEAD}
${en.rows.join("\n")}

## Hard set vs gold readings (${SETS.hard.length} sentences; gold is provisional)

Right = the phonemes match one of the gold readings, ignoring word spaces, punctuation and long-vowel spelling.

${hard.head}
${hard.rows.join("\n")}

## Original text (D23): joining the \`<t:…>\` values gives back the input

| system | set | annotated | text identical (whitespace ignored) | differs |
|---|---|---|---|---|
${textRows().join("\n")}

## Output size and time (one call per set)

| system | set | text chars | YomiScript chars | ratio | output tokens | seconds |
|---|---|---|---|---|---|---|
${cost().join("\n")}

## Differences

### Japanese parity
${ja.diffs.join("\n")}

### English parity
${en.diffs.join("\n")}

### Hard set
${hard.diffs.join("\n")}
`;
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "summary.md"), md);
fs.writeFileSync(path.join(OUT, "items.json"), JSON.stringify(ITEMS, null, 1));
console.log(md.split("## Differences")[0]);
