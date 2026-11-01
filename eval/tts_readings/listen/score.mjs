// The listeners' answers (the JSON files the page downloads) against the judge of score.py, and each system's
// accuracy as the listeners heard it.
// A word's human label: "right" when the reading chosen is one of the right readings of targets.tsv, "misread" when
// it is a misreading or "other" (the right readings were offered, so another reading was heard), none when
// "unclear". With several listeners the majority label counts; a tie counts as no label.
// Accuracy per system over every recording of results/items.json: a recording in the listening set takes the
// listeners' verdict; one outside it (judged right, not sampled) or without a label takes the rate of its stratum
// (judged right / judged misread) among that system's labelled recordings (all systems' when it has none). The 95%
// interval resamples the sentences (10,000 times), as results/summary.md does.
// usage: node score.mjs answers/*.json [--out file]   -> ../results/listening.md
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { SET } from "./build.mjs";
import { rng } from "./shuffle.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}%` : "-");
const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;

function listeners(files) {
  return files.map((f) => {
    const j = JSON.parse(fs.readFileSync(f, "utf8"));
    return { name: j.listener, fake: j.fake === true || /^fake/i.test(j.listener), set: j.set, answers: j.answers ?? {} };
  });
}

// one listener's label of word k of a clip: "right", "misread", or null (not answered or unclear)
function label(word, a) {
  if (!a || a.choice === "unclear") return null;
  if (a.choice === "other") return "misread";
  return word.right.includes(a.reading) ? "right" : "misread";
}

// the majority of the labels given, or null when there are none or they tie
function majority(labels) {
  const given = labels.filter(Boolean),
    right = given.filter((l) => l === "right").length;
  if (!given.length || 2 * right === given.length) return null;
  return 2 * right > given.length ? "right" : "misread";
}

// per word of every clip: the judge's verdict, each listener's answer and label, and the majority
function units(set, L) {
  const out = [];
  for (const c of set.clips) {
    c.words.forEach((w, k) => {
      const answers = L.map((l) => l.answers[c.id]?.words?.[k] ?? null),
        labels = answers.map((a) => label(w, a));
      out.push({ clip: c, k, word: w, judge: w.judged.ok ? "right" : "misread", answers, labels, human: majority(labels) });
    });
  }
  return out;
}

function agreeRow(name, U) {
  const L = U.filter((u) => u.human),
    agree = L.filter((u) => u.human === u.judge).length,
    fa = L.filter((u) => u.judge === "misread" && u.human === "right").length,
    miss = L.filter((u) => u.judge === "right" && u.human === "misread").length;
  return `| ${name} | ${U.length} | ${L.length} | ${agree} (${pct(agree, L.length)}) | ${fa} | ${miss} |`;
}

function groupBy(xs, key) {
  const out = new Map();
  for (const x of xs) out.set(key(x), [...(out.get(key(x)) ?? []), x]);
  return [...out].sort(([a], [b]) => String(a).localeCompare(String(b)));
}

// a word judged misread, or judged right in a recording judged misread (another word) or in a control recording
function stratum(u) {
  if (u.judge === "misread") return "words judged misread";
  return u.clip.stratum === "control" ? "words judged right, control recordings" : "words judged right, in recordings with a word judged misread";
}

function agreement(U) {
  const head = "| | words | labelled | judge agrees | judged misread, heard right | judged right, heard misread |\n|---|---|---|---|---|---|";
  const all = [agreeRow("all", U), ...groupBy(U, stratum).map(([k, v]) => agreeRow(k, v))];
  const sys = groupBy(U, (u) => u.clip.system).map(([k, v]) => agreeRow(k, v));
  const words = groupBy(U, (u) => `${u.clip.sentence} ${u.word.word}`).map(([k, v]) => agreeRow(k, v));
  const picked = U.filter((u) => u.human && u.answers.some((a) => a?.choice === "reading")),
    same = picked.filter((u) => u.answers.some((a) => a?.choice === "reading" && a.reading === u.word.judged.reading)).length;
  const exact = `The reading the judge heard is one a listener chose on ${same} of ${picked.length} labelled words (${pct(same, picked.length)}).`;
  return [`${head}\n${all.join("\n")}`, `Per system:\n\n${head}\n${sys.join("\n")}`, exact, `Per word:\n\n${head}\n${words.join("\n")}`].join("\n\n");
}

// every recording of items.json as {system, sentence, run, words: [judged right?], id: the clip id when listened}
function population(set) {
  const items = JSON.parse(fs.readFileSync(path.join(ROOT, "results/items.json"), "utf8")),
    ids = new Map(set.clips.map((c) => [`${c.system} ${c.run} ${c.sentence}`, c.id])),
    out = [];
  for (const [sentence, item] of Object.entries(items)) {
    for (const [system, runs] of Object.entries(item.systems)) {
      runs.forEach((w, r) => out.push({ system, sentence, run: r + 1, words: w.map(([ok]) => ok), id: ids.get(`${system} ${r + 1} ${sentence}`) }));
    }
  }
  return out;
}

// a recording's label from its words' labels: misread when any word is, right when all are, else none
function sentenceLabel(labels) {
  if (labels.includes("misread")) return "misread";
  return labels.every((x) => x === "right") ? "right" : null;
}

// an answer as a category: the reading chosen, "other" or "unclear" (null when not answered)
function category(a) {
  if (!a) return null;
  return a.choice === "reading" ? a.reading : a.choice;
}

// an answer as the report shows it
function shown(a) {
  if (a?.choice === "other") return `other: ${a.text}`;
  if (a?.reading === "-") return "(left out)";
  return category(a) ?? "(no answer)";
}

// per unit of the population (a recording, or a word of one): its system, sentence, judged stratum and human value
function cases(pop, U, level) {
  const byWord = new Map(U.map((u) => [`${u.clip.id} ${u.k}`, u.human]));
  if (level === "word") {
    return pop.flatMap((p) =>
      p.words.map((ok, k) => ({ system: p.system, sentence: p.sentence, judged: ok, human: p.id ? (byWord.get(`${p.id} ${k}`) ?? null) : null })),
    );
  }
  return pop.map((p) => {
    const h = p.id ? p.words.map((_, k) => byWord.get(`${p.id} ${k}`) ?? null) : [null];
    return { system: p.system, sentence: p.sentence, judged: p.words.every(Boolean), human: sentenceLabel(h) };
  });
}

// the estimated share read right of one system's cases, given all systems' cases (for the pooled rates)
function estimate(mine, all) {
  const rate = (xs, judged) => {
    const L = xs.filter((x) => x.judged === judged && x.human);
    return L.length ? L.filter((x) => x.human === "right").length / L.length : null;
  };
  const r = { true: rate(mine, true) ?? rate(all, true) ?? 1, false: rate(mine, false) ?? rate(all, false) ?? 0 };
  return mean(mine.map((x) => (x.human ? +(x.human === "right") : r[x.judged])));
}

function accuracy(C, n = 10000) {
  const sentences = [...new Set(C.map((c) => c.sentence))],
    bySentence = new Map(sentences.map((s) => [s, C.filter((c) => c.sentence === s)])),
    next = rng("listening bootstrap"),
    systems = [...new Set(C.map((c) => c.system))].sort();
  const draws = Array.from({ length: n }, () =>
    Array.from(sentences, () => sentences[Math.floor(next() * sentences.length)]).flatMap((s) => bySentence.get(s)),
  );
  return systems.map((s) => {
    const mine = C.filter((c) => c.system === s),
      boot = draws
        .map((d) =>
          estimate(
            d.filter((c) => c.system === s),
            d,
          ),
        )
        .sort((a, b) => a - b);
    const judged = mean(mine.map((c) => +c.judged)),
      labelled = mine.filter((c) => c.human).length;
    const iv = `[${(100 * boot[Math.floor(0.025 * n)]).toFixed(1)}, ${(100 * boot[Math.floor(0.975 * n)]).toFixed(1)}]`;
    return `| ${s} | ${mine.length} | ${labelled} | ${(100 * judged).toFixed(1)}% | ${(100 * estimate(mine, C)).toFixed(1)}% ${iv} |`;
  });
}

function accuracies(set, U) {
  const pop = population(set),
    head = "| system | cases | labelled by listeners | judge | listeners [95% interval] |\n|---|---|---|---|---|";
  const sentences = accuracy(cases(pop, U, "sentence")),
    words = accuracy(cases(pop, U, "word"));
  return `Sentences with every judged word read right (as results/summary.md, all ${new Set(pop.map((p) => p.sentence)).size} sentences):\n\n${head}\n${sentences.join("\n")}\n\nTarget words read right:\n\n${head}\n${words.join("\n")}`;
}

// Cohen's kappa of two raters' categories on the items both rated
function cohen(a, b) {
  const both = a.map((x, i) => [x, b[i]]).filter(([x, y]) => x != null && y != null);
  if (!both.length) return null;
  const cats = [...new Set(both.flat())],
    po = mean(both.map(([x, y]) => +(x === y))),
    pe = cats.reduce((s, c) => s + mean(both.map(([x]) => +(x === c))) * mean(both.map(([, y]) => +(y === c))), 0);
  return { n: both.length, kappa: pe === 1 ? 1 : (po - pe) / (1 - pe) };
}

// Fleiss' kappa on the items every rater rated (rows: items, columns: raters)
function fleiss(rows) {
  const full = rows.filter((r) => r.every((x) => x != null));
  if (!full.length) return null;
  const m = full[0].length,
    cats = [...new Set(full.flat())];
  const p = cats.map((c) => mean(full.map((r) => r.filter((x) => x === c).length / m)));
  const P = mean(full.map((r) => (cats.reduce((s, c) => s + r.filter((x) => x === c).length ** 2, 0) - m) / (m * (m - 1))));
  const pe = p.reduce((s, x) => s + x * x, 0);
  return { n: full.length, kappa: pe === 1 ? 1 : (P - pe) / (1 - pe) };
}

function interRater(L, U) {
  if (L.length < 2) return "One listener: no agreement between listeners to measure.";
  const kinds = { "reading chosen (each reading, other, unclear)": U.map((u) => u.answers.map(category)), "right / misread": U.map((u) => u.labels) };
  const rows = ["| measure | listeners | words | kappa |", "|---|---|---|---|"];
  for (const [kind, M] of Object.entries(kinds)) {
    for (let i = 0; i < L.length; i++) {
      for (let j = i + 1; j < L.length; j++) {
        const k = cohen(
          M.map((r) => r[i]),
          M.map((r) => r[j]),
        );
        if (k) rows.push(`| Cohen, ${kind} | ${L[i].name}, ${L[j].name} | ${k.n} | ${k.kappa.toFixed(3)} |`);
      }
    }
    const f = fleiss(M);
    if (f) rows.push(`| Fleiss, ${kind} | all ${L.length} | ${f.n} | ${f.kappa.toFixed(3)} |`);
  }
  return rows.join("\n");
}

function naturalness(set, L) {
  const rows = ["| system | ratings | mean (1-5) |", "|---|---|---|"];
  for (const [s, clips] of groupBy(set.clips, (c) => c.system)) {
    const v = clips.flatMap((c) => L.map((l) => l.answers[c.id]?.naturalness).filter((x) => x >= 1 && x <= 5));
    rows.push(`| ${s} | ${v.length} | ${v.length ? mean(v).toFixed(2) : "-"} |`);
  }
  return rows.join("\n");
}

function disagreements(U, L) {
  const rows = ["| clip | sentence | word | system | run | judge heard | listeners |", "|---|---|---|---|---|---|---|"];
  for (const u of U.filter((x) => x.human && x.human !== x.judge)) {
    const heard = L.map((l, i) => `${l.name}: ${shown(u.answers[i])}`).join("; ");
    rows.push(
      `| ${u.clip.id} | ${u.clip.sentence} ${u.clip.text} | ${u.word.word} | ${u.clip.system} | r${u.clip.run} | ${u.word.judged.reading} | ${heard} |`,
    );
  }
  const unclear = U.filter((u) => u.answers.some((a) => a?.choice === "unclear")).length;
  return `${rows.length - 2} words; ${unclear} words had an "unclear" answer.\n\n${rows.join("\n")}`;
}

function report(set, L) {
  const U = units(set, L),
    answered = set.clips.filter((c) => L.some((l) => l.answers[c.id]?.words?.some(Boolean))).length;
  const fake = L.some((l) => l.fake) ? "**FAKE ANSWERS: this report was made from generated answers to test the pipeline. It is not a result.**\n\n" : "";
  const wrongSet = L.filter((l) => l.set !== set.seed).map((l) => l.name);
  const warn = wrongSet.length ? `Warning: answers made for another set: ${wrongSet.join(", ")}.\n\n` : "";
  const intro = `Listeners: ${L.map((l) => l.name).join(", ")}. Clips answered by at least one: ${answered} of ${set.clips.length} (set "${set.seed}", ${set.made}).`;
  const parts = [
    `# Listening check of the judge (eval/tts_readings)\n\n${fake}${warn}${intro}`,
    `## The judge against the listeners (per word)\n\n${agreement(U)}`,
    `## Accuracy per system as heard\n\n${accuracies(set, U)}`,
    `## Agreement between listeners\n\n${interRater(L, U)}`,
    `## Naturalness (optional ratings)\n\n${naturalness(set, L)}`,
    `## Words where the listeners and the judge differ\n\n${disagreements(U, L)}`,
  ];
  return parts.join("\n\n") + "\n";
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
