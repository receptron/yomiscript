// The conditions of the isolated rerun (README.md) and the calls they are asked in. YomiScript and kana use
// eval/representation's prompts as they are; the SSML profile with one <phoneme> per bunsetsu is eval/representation's
// SSML prompt with only the element granularity changed (BUNSETSU_EDITS) and its Japanese examples merged per
// bunsetsu (bunsetsu.json). The batches: about ten items per call, no two sharing a word of words.tsv.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { buildPrompt } from "../browser_tts/sets.mjs";
import { EXAMPLES, HERE as REPRESENTATION, IPA_RULES, prompt as representationPrompt } from "../representation/formats.mjs";

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const LLMS = ["claude", "codex"];
const BATCH = 10;
const read = (f) => fs.readFileSync(f, "utf8");

// [what prompt_ssml.md says, what the bunsetsu profile says instead]; every other line of the prompt is kept
export const BUNSETSU_EDITS = [
  ["SSML 1.1 in which every word carries its pronunciation in IPA", "SSML 1.1 in which every phrase carries its pronunciation in IPA"],
  [
    "- Every spoken word is a `<phoneme alphabet='ipa' ph='…'>word</phoneme>` of its own: the element's text is the word as written in the input, `ph` its pronunciation.",
    "- Every spoken phrase is a `<phoneme alphabet='ipa' ph='…'>phrase</phoneme>` of its own: in Japanese a phrase is a bunsetsu, a content word with the particles and auxiliaries that follow it (友達と, 買いました, 行った); in other languages it is a word. The element's text is the phrase as written in the input, `ph` its pronunciation.",
  ],
  [
    "  - In SSML each of these words is a `<phoneme>` element of its own; a `ph` value never holds more than one word of the input.",
    "  - In SSML the words of one phrase go into one `<phoneme>` element, separated by spaces inside its `ph`; a word is never split across two elements.",
  ],
];
function edit(text, [from, to]) {
  if (!text.includes(from)) throw new Error(`prompt_ssml.md no longer says: ${from}`);
  return text.replace(from, to);
}

const PHONEME = /<phoneme alphabet='ipa' ph='([^']*)'>([^<]*)<\/phoneme>/g;
// one example's SSML with its consecutive <phoneme> elements merged in groups of the given sizes
function merge(ssml, sizes) {
  const els = [...ssml.matchAll(PHONEME)];
  if (sizes.reduce((a, b) => a + b, 0) !== els.length) throw new Error(`bunsetsu.json does not fit: ${ssml}`);
  let out = ssml.slice(0, els[0].index),
    k = 0;
  for (const n of sizes) {
    const g = els.slice(k, k + n);
    const last = g[n - 1];
    const inside = ssml.slice(g[0].index, last.index + last[0].length).replace(PHONEME, "");
    if (inside) throw new Error(`text between the elements of one bunsetsu: ${inside}`);
    out += `<phoneme alphabet='ipa' ph='${g.map((m) => m[1]).join(" ")}'>${g.map((m) => m[2]).join("")}</phoneme>`;
    k += n;
    out += ssml.slice(last.index + last[0].length, els[k]?.index ?? ssml.length);
  }
  return out;
}
const GROUPS = JSON.parse(read(path.join(HERE, "bunsetsu.json")));
const BUNSETSU_EXAMPLES = EXAMPLES.map((x) => ({ lang: x.lang, text: x.text, ys: GROUPS[x.text] ? merge(x.ssml, GROUPS[x.text]) : x.ssml }));
const BUNSETSU_TEMPLATE = BUNSETSU_EDITS.reduce(edit, read(path.join(REPRESENTATION, "prompt_ssml.md"))).replace("{{IPA}}", IPA_RULES);

/** condition -> the format of eval/representation it is checked and scored as */
export const CONDITIONS = { yomiscript: "yomiscript", kana: "kana", ssml_bunsetsu: "ssml" };
export function prompt(condition, items) {
  return condition === "ssml_bunsetsu" ? buildPrompt(BUNSETSU_TEMPLATE, items, BUNSETSU_EXAMPLES) : representationPrompt(condition, items);
}

function words() {
  const W = {};
  for (const l of read(path.join(HERE, "words.tsv")).split("\n")) {
    if (!l || l.startsWith("#")) continue;
    const [name, list] = l.split("\t");
    W[name] = list.split(",");
  }
  return W;
}
export function random(seed) {
  // mulberry32: the same batches on every run
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** the items in ceil(n / 10) calls, no two in a call sharing a word; the same calls in every condition and run */
export function batches(items) {
  const W = words(),
    rnd = random(20261101);
  const share = (x) => items.filter((y) => y !== x && (W[y.name] ?? []).some((w) => (W[x.name] ?? []).includes(w))).length;
  // the most constrained first (most sentences sharing a word with it), at random among equals
  const order = items.map((x) => [share(x), rnd(), x]).sort((p, q) => q[0] - p[0] || p[1] - q[1]);
  const B = Array.from({ length: Math.ceil(items.length / BATCH) }, () => []);
  for (const [, , x] of order) {
    const fits = B.filter((b) => b.length < BATCH && !b.some((y) => (W[y.name] ?? []).some((w) => (W[x.name] ?? []).includes(w))));
    if (!fits.length) throw new Error(`no call for ${x.name}`);
    fits.reduce((a, b) => (b.length < a.length ? b : a)).push(x);
  }
  // within a call, the hard set's order, as in the one-call prompt
  return B.map((b) => b.sort((p, q) => items.indexOf(p) - items.indexOf(q)));
}
