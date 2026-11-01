// The listeners' answers (the JSON files the page downloads) as results: (A) how often the word heard is one with the
// target's gold accent, per condition; (B) the English and naturalness ratings, YomiScript against kana.
// A: an answer is right when the word chosen has the target's gold accent (OpenJTalk's; 紙 for 髪 is right, both
// odaka); "unclear" is wrong. Only clips whose set has a word with another gold accent count (潮 / 塩 are both odaka in
// the gold: that set is scored against the textbook column only). Chance is the share of the set with the target's
// accent. "Heard as marked": the word chosen has the accent the condition's own marks gave the target.
// Intervals: 95%, resampling the minimal sets (A) or the sentences (B) 10,000 times, as clusters; pairwise differences
// use the same draws, with the share of draws at or below 0. Agreement between listeners: Krippendorff's alpha
// (nominal for the words chosen, interval for the ratings).
// usage: node score.mjs answers/*.json [--out file]   -> ../results/listening.md
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { rng } from "../../tts_readings/listen/shuffle.mjs";
import { ACCENT_CONDS, MIXED_CONDS, SET } from "./build.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const N_BOOT = 10000;
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const pct = (x) => (x == null ? "-" : `${(100 * x).toFixed(1)}%`);
const num = (x) => (x == null ? "-" : x.toFixed(2));

function listeners(files) {
  return files.map((f) => {
    const j = JSON.parse(fs.readFileSync(f, "utf8"));
    return { name: j.listener, region: j.region ?? "", fake: j.fake === true || /^fake/i.test(j.listener), set: j.set, answers: j.answers ?? {} };
  });
}

// --- the cluster bootstrap ---

// rows -> per draw (resampling the clusters), the mean of each statistic (a row's value, null when it has none)
function bootstrap(rows, cluster, stats, seed) {
  const names = Object.keys(stats),
    sums = new Map();
  for (const r of rows) {
    const s = sums.get(cluster(r)) ?? Object.fromEntries(names.map((k) => [k, [0, 0]]));
    for (const k of names) {
      const v = stats[k](r);
      if (v != null) [s[k][0], s[k][1]] = [s[k][0] + v, s[k][1] + 1];
    }
    sums.set(cluster(r), s);
  }
  const keys = [...sums.keys()],
    next = rng(seed),
    meanOf = (picked) =>
      Object.fromEntries(
        names.map((k) => {
          const [a, b] = picked.reduce(([x, y], c) => [x + sums.get(c)[k][0], y + sums.get(c)[k][1]], [0, 0]);
          return [k, b ? a / b : null];
        }),
      );
  const draws = Array.from({ length: N_BOOT }, () => meanOf(Array.from(keys, () => keys[Math.floor(next() * keys.length)])));
  return { point: meanOf(keys), draws, clusters: keys.length };
}

// the 95% interval of f over the draws, and the share of draws at or below 0
function interval(draws, f) {
  const v = draws
    .map(f)
    .filter((x) => x != null)
    .sort((a, b) => a - b);
  if (!v.length) return null;
  return { lo: v[Math.floor(0.025 * v.length)], hi: v[Math.floor(0.975 * v.length)], le0: v.filter((x) => x <= 0).length / v.length };
}
const iv = (i, fmt) => (i ? `[${fmt(i.lo)}, ${fmt(i.hi)}]` : "");

// --- agreement ---

// the sum of delta over the ordered pairs of different positions of a list of values
function pairSum(values, delta) {
  let d = 0;
  for (let i = 0; i < values.length; i++) for (let j = 0; j < values.length; j++) if (i !== j) d += delta(values[i], values[j]);
  return d;
}

// Krippendorff's alpha: units are the lists of values given to one item; delta the distance of two values
function alpha(units, delta) {
  const U = units.map((u) => u.filter((x) => x != null)).filter((u) => u.length >= 2),
    all = U.flat(),
    n = all.length;
  if (!U.length) return null;
  const observed = U.reduce((s, u) => s + pairSum(u, delta) / (u.length - 1), 0) / n,
    expected = pairSum(all, delta) / (n * (n - 1));
  return { units: U.length, alpha: expected === 0 ? 1 : 1 - observed / expected };
}
const nominal = (a, b) => +(a !== b),
  intervalDelta = (a, b) => (a - b) ** 2;

// --- A: accent identification ---

const accentType = (nucleus, morae) => {
  if (nucleus === 0) return "heiban (flat)";
  if (nucleus === 1) return "atamadaka (initial)";
  return nucleus === morae ? "odaka (final)" : "nakadaka (medial)";
};

// one row per answer of an A clip: right against the gold and the textbook, chance, heard as marked
function accentRows(set, L) {
  const rows = [];
  for (const c of set.clips.filter((x) => x.part === "A")) {
    const me = c.members.find((m) => m.name === c.item),
      byWord = Object.fromEntries(c.members.map((m) => [m.word, m])),
      informative = c.members.some((m) => m.gold !== me.gold),
      informativeTb = c.members.some((m) => m.textbook !== me.textbook);
    L.forEach((l, li) => {
      const a = l.answers[c.id];
      if (!a?.choice) return;
      const chosen = byWord[a.choice] ?? null;
      rows.push({
        clip: c,
        li,
        choice: a.choice,
        unclear: chosen ? 0 : 1,
        right: informative ? +(chosen?.gold === me.gold) : null,
        rightTb: informativeTb ? +(chosen?.textbook === me.textbook) : null,
        chance: informative ? c.members.filter((m) => m.gold === me.gold).length / c.members.length : null,
        asMarked: c.marked == null ? null : +(chosen?.gold === c.marked),
        type: accentType(me.gold, c.heard.length - 1),
        naturalness: a.naturalness >= 1 && a.naturalness <= 5 ? a.naturalness : null,
      });
    });
  }
  return rows;
}

function perCondStats(conds, field, condOf) {
  return Object.fromEntries(conds.map((k) => [k, (r) => (condOf(r) === k ? r[field] : null)]));
}

function accentTable(rows) {
  const condOf = (r) => r.clip.cond,
    cl = (r) => r.clip.set,
    B = {
      right: bootstrap(rows, cl, perCondStats(ACCENT_CONDS, "right", condOf), "listen A right"),
      tb: bootstrap(rows, cl, perCondStats(ACCENT_CONDS, "rightTb", condOf), "listen A textbook"),
      marked: bootstrap(rows, cl, perCondStats(ACCENT_CONDS, "asMarked", condOf), "listen A marked"),
    };
  const head = [
    "| condition | answers | unclear | right vs gold [95% interval] | chance | right vs textbook [95% interval] | heard as its marks say |",
    "|---|---|---|---|---|---|---|",
  ];
  const lines = ACCENT_CONDS.map((k) => {
    const R = rows.filter((r) => condOf(r) === k),
      scored = R.filter((r) => r.right != null),
      p = (b) =>
        `${pct(b.point[k])} ${iv(
          interval(b.draws, (d) => d[k]),
          pct,
        )}`;
    return `| ${k} | ${R.length} | ${pct(mean(R.map((r) => r.unclear)))} | ${p(B.right)} | ${pct(mean(scored.map((r) => r.chance)))} | ${p(B.tb)} | ${k === "kokoro" ? "(no marks)" : pct(B.marked.point[k])} |`;
  });
  return { table: [...head, ...lines].join("\n"), B };
}

function pairwise(B, conds, fmt) {
  const rows = ["| difference | estimate [95% interval] | draws <= 0 |", "|---|---|---|"];
  for (let i = 0; i < conds.length; i++) {
    for (let j = i + 1; j < conds.length; j++) {
      const [a, b] = [conds[j], conds[i]],
        f = (d) => (d[a] == null || d[b] == null ? null : d[a] - d[b]),
        point = f(B.point),
        I = interval(B.draws, f);
      rows.push(`| ${a} - ${b} | ${point == null ? "-" : fmt(point)} ${iv(I, fmt)} | ${I ? pct(I.le0) : "-"} |`);
    }
  }
  return rows.join("\n");
}
const signedPct = (x) => `${x >= 0 ? "+" : ""}${(100 * x).toFixed(1)}`;
const signed = (x) => `${x >= 0 ? "+" : ""}${x.toFixed(2)}`;

function crossTable(rows, rowKey, cell) {
  const keys = [...new Set(rows.map(rowKey))].sort(),
    out = [`| | ${ACCENT_CONDS.join(" | ")} |`, `|---|${ACCENT_CONDS.map(() => "---|").join("")}`];
  for (const key of keys) {
    const R = rows.filter((r) => rowKey(r) === key);
    out.push(`| ${key} | ${ACCENT_CONDS.map((c) => cell(R.filter((r) => r.clip.cond === c))).join(" | ")} |`);
  }
  return out.join("\n");
}
const rightCell = (R) => {
  const S = R.filter((r) => r.right != null);
  return S.length ? `${pct(mean(S.map((r) => r.right)))} (${S.length})` : "-";
};

function accentAgreement(rows, L) {
  if (L.length < 2) return "One listener: no agreement between listeners to measure.";
  const lines = ["| clips | listeners | items with 2+ answers | Krippendorff's alpha (nominal: the word chosen, or unclear) |", "|---|---|---|---|"];
  for (const cond of ["all", ...ACCENT_CONDS]) {
    const R = rows.filter((r) => cond === "all" || r.clip.cond === cond),
      byClip = [...new Set(R.map((r) => r.clip.id))].map((id) => R.filter((r) => r.clip.id === id).map((r) => r.choice)),
      a = alpha(byClip, nominal);
    lines.push(`| ${cond} | ${L.length} | ${a?.units ?? 0} | ${a ? a.alpha.toFixed(3) : "-"} |`);
  }
  return lines.join("\n");
}

function accentReport(set, L) {
  const rows = accentRows(set, L),
    { table, B } = accentTable(rows),
    nat = crossTable(
      rows.map((r) => ({ ...r, all: "all clips" })),
      (r) => r.all,
      (R) => {
        const v = R.map((r) => r.naturalness).filter((x) => x != null);
        return v.length ? `${num(mean(v))} (${v.length})` : "-";
      },
    );
  return [
    `Each answer of each listener counts (clusters: ${B.right.clusters} minimal sets).\n\n${table}`,
    `Pairwise differences in "right vs gold" (percentage points; the later condition minus the earlier):\n\n${pairwise(B.right, ACCENT_CONDS, signedPct)}`,
    `Right vs gold per accent type of the target (answers):\n\n${crossTable(rows, (r) => r.type, rightCell)}`,
    `Right vs gold per minimal set (answers):\n\n${crossTable(rows, (r) => r.clip.set, rightCell)}`,
    `Agreement between listeners:\n\n${accentAgreement(rows, L)}`,
    `Naturalness of the cut words (optional, 1-5; mean and ratings):\n\n${nat}`,
  ].join("\n\n");
}

// --- B: English ratings ---

// the words of a text as compared: lower case Latin letters, apostrophes dropped (I'll and Ill are the same)
const words = (text) =>
  text
    .toLowerCase()
    .replace(/['’]/g, "")
    .match(/[a-z]+/g) ?? [];

function mixedRows(set, L) {
  const rows = [];
  for (const c of set.clips.filter((x) => x.part === "B")) {
    L.forEach((l, li) => {
      const a = l.answers[c.id];
      if (!a || (!a.english && !a.naturalness)) return;
      const typed = words(a.heard ?? ""),
        target = words(c.target),
        found = typed.length ? target.filter((w) => typed.includes(w)).length / target.length : null;
      rows.push({ clip: c, li, english: a.english || null, naturalness: a.naturalness || null, found, first: a.first ?? null });
    });
  }
  // first exposure: the earlier of a listener's two conditions of a sentence
  for (const r of rows) {
    const other = rows.find((o) => o.li === r.li && o.clip.item === r.clip.item && o !== r);
    r.firstHeard = !other || r.first == null || other.first == null || r.first < other.first;
  }
  return rows;
}

function ratingTable(rows) {
  const condOf = (r) => r.clip.cond,
    cl = (r) => r.clip.item;
  const B = {
    english: bootstrap(rows, cl, perCondStats(MIXED_CONDS, "english", condOf), "listen B english"),
    naturalness: bootstrap(rows, cl, perCondStats(MIXED_CONDS, "naturalness", condOf), "listen B naturalness"),
  };
  const lines = ["| condition | ratings | sounds like English, mean 1-5 [95% interval] | naturalness, mean 1-5 [95% interval] |", "|---|---|---|---|"];
  for (const k of MIXED_CONDS) {
    const p = (b) =>
      `${num(b.point[k])} ${iv(
        interval(b.draws, (d) => d[k]),
        num,
      )}`;
    lines.push(`| ${k} | ${rows.filter((r) => condOf(r) === k).length} | ${p(B.english)} | ${p(B.naturalness)} |`);
  }
  return { table: lines.join("\n"), clusters: B.english.clusters };
}

// per listener and sentence rated in both conditions: YomiScript minus kana
function pairedTable(rows) {
  const [ys, kana] = MIXED_CONDS,
    pairs = [];
  for (const r of rows.filter((x) => x.clip.cond === ys)) {
    const k = rows.find((o) => o.li === r.li && o.clip.item === r.clip.item && o.clip.cond === kana);
    if (k) pairs.push({ item: r.clip.item, english: r.english - k.english, naturalness: r.naturalness - k.naturalness });
  }
  const B = bootstrap(pairs, (p) => p.item, { english: (p) => p.english, naturalness: (p) => p.naturalness }, "listen B paired"),
    lines = [`| rating | pairs | ${ys} - ${kana} [95% interval] | draws <= 0 | ${ys} higher / same / lower |`, "|---|---|---|---|---|"];
  for (const k of ["english", "naturalness"]) {
    const v = pairs.map((p) => p[k]).filter((x) => !Number.isNaN(x)),
      I = interval(B.draws, (d) => d[k]);
    const counts = `${v.filter((x) => x > 0).length} / ${v.filter((x) => x === 0).length} / ${v.filter((x) => x < 0).length}`;
    lines.push(`| ${k} | ${v.length} | ${B.point[k] == null ? "-" : signed(B.point[k])} ${iv(I, signed)} | ${I ? pct(I.le0) : "-"} | ${counts} |`);
  }
  return lines.join("\n");
}

function heardTable(rows) {
  const lines = ["| condition | answers with English typed | target words typed (mean) | the same, first hearing of the sentence only |", "|---|---|---|---|"];
  for (const k of MIXED_CONDS) {
    const R = rows.filter((r) => r.clip.cond === k && r.found != null),
      F = R.filter((r) => r.firstHeard);
    lines.push(`| ${k} | ${R.length} | ${pct(mean(R.map((r) => r.found)))} | ${pct(mean(F.map((r) => r.found)))} (${F.length}) |`);
  }
  return lines.join("\n");
}

function mixedAgreement(rows, L) {
  if (L.length < 2) return "One listener: no agreement between listeners to measure.";
  const ids = [...new Set(rows.map((r) => r.clip.id))],
    lines = ["| rating | items with 2+ ratings | Krippendorff's alpha (interval) |", "|---|---|---|"];
  for (const k of ["english", "naturalness"]) {
    const a = alpha(
      ids.map((id) => rows.filter((r) => r.clip.id === id).map((r) => r[k])),
      intervalDelta,
    );
    lines.push(`| ${k} | ${a?.units ?? 0} | ${a ? a.alpha.toFixed(3) : "-"} |`);
  }
  return lines.join("\n");
}

function mixedReport(set, L) {
  const rows = mixedRows(set, L),
    { table, clusters } = ratingTable(rows);
  return [
    `Each rating of each listener counts (clusters: ${clusters} sentences).\n\n${table}`,
    `Paired by listener and sentence:\n\n${pairedTable(rows)}`,
    `What the listeners typed as the English they heard (optional; the share of the target's words, over the answers with something typed). A sentence is heard in both conditions, so the second hearing may be helped by the first:\n\n${heardTable(rows)}`,
    `Agreement between listeners:\n\n${mixedAgreement(rows, L)}`,
  ].join("\n\n");
}

export function report(set, L) {
  const fake = L.some((l) => l.fake) ? "**FAKE ANSWERS: this report was made from generated answers to test the pipeline. It is not a result.**\n\n" : "";
  const wrongSet = L.filter((l) => l.set !== set.seed).map((l) => l.name),
    warn = wrongSet.length ? `Warning: answers made for another set: ${wrongSet.join(", ")}.\n\n` : "";
  const who = L.map((l) => (l.region ? `${l.name} (${l.region})` : l.name)).join(", "),
    count = (p) => set.clips.filter((c) => c.part === p && L.some((l) => l.answers[c.id])).length,
    total = (p) => set.clips.filter((c) => c.part === p).length;
  const intro = `Listeners: ${who}. Clips answered by at least one: A ${count("A")} of ${total("A")}, B ${count("B")} of ${total("B")} (set "${set.seed}", ${set.made}).`;
  return [
    `# Listening test (eval/ipa_value)\n\n${fake}${warn}${intro}`,
    `## A. Which word of the minimal set the cut word sounds like\n\n${accentReport(set, L)}`,
    `## B. Does the English sound like English\n\n${mixedReport(set, L)}`,
  ]
    .join("\n\n")
    .concat("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2),
    at = args.indexOf("--out"),
    out = at >= 0 ? args.splice(at, 2)[1] : path.join(ROOT, "results/listening.md");
  if (!args.length) throw new Error("usage: node score.mjs answers.json [...] [--out file]");
  const set = JSON.parse(fs.readFileSync(SET, "utf8"));
  fs.writeFileSync(out, report(set, listeners(args)));
  console.log(`${args.length} listener(s) -> ${path.resolve(out)}`);
}
