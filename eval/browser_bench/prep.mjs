// The sentences of the browser benchmark: 15 of the LLM's YomiScript readings of the hard set
// (eval/browser_tts/results/codex.hard.json), spread over the range of lengths, with the dictionary accent added as
// the tools add it (@yomiscript/ja-accent, as demo/ys_web/misread.mjs does), plus 3 paragraphs that each join 5 of
// them into one section (the hard-set sentences are short, so these give the real-time factor of longer audio).
// The page speaks the `spoken` field.
// usage: node prep.mjs   (writes sentences.json next to this script; needs the dictionary in ~/.cache/yomiscript/ja-dict)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { accentYomite } from "@yomiscript/ja-accent";
import { nodeAnalyzer } from "@yomiscript/ja-accent/node";
import { plan } from "@yomiscript/kokoro";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const N = 15;
const SRC = JSON.parse(fs.readFileSync(path.join(HERE, "../browser_tts/results/codex.hard.json"), "utf8"));
const text = (ys) => (ys.match(/<t:[^>]*>/g) ?? []).map((t) => t.slice(3, -1)).join("");
const all = Object.entries(SRC.output)
  .map(([name, ys]) => ({ name, text: text(ys), ys }))
  .sort((a, b) => a.text.length - b.text.length || a.name.localeCompare(b.name));
const picked = Array.from({ length: N }, (_, i) => all[Math.round((i * (all.length - 1)) / (N - 1))]);

const base = path.join(process.env.HOME, ".cache/yomiscript/ja-dict");
const accent = accentYomite(await nodeAnalyzer({ dir: path.join(base, fs.readdirSync(base)[0]) }));
const sentences = picked.map((x) => ({ ...x, spoken: accent(x.ys) }));
const inner = (ys) => ys.replace(/^ja \//, "").replace(/\/$/, "");
const paragraphs = [0, 1, 2].map((g) => {
  const part = sentences.filter((_, i) => i % 3 === g);
  const join = (f) => `ja /${part.map((x) => inner(x[f])).join(" ")}/`;
  return { name: `p${g + 1}`, text: part.map((x) => x.text).join(""), ys: join("ys"), spoken: join("spoken") };
});
const out = [...sentences, ...paragraphs].map((x) => ({ ...x, phonemes: plan(x.spoken).reduce((n, s) => n + s.ids.length, 0) }));
const long = out.filter((x) => x.phonemes > 510);
if (long.length) throw new Error(`over Kokoro's 510 phonemes: ${long.map((x) => x.name).join(", ")}`);
fs.writeFileSync(path.join(HERE, "sentences.json"), JSON.stringify({ llm: SRC.model, items: out }, null, 1) + "\n");
console.log(`${out.length} sentences -> sentences.json:`, out.map((x) => `${x.name} ${x.text}`).join(" / "));
