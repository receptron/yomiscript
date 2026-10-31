// Build audio/listen.json for listen.html: every text of every set, each system's audio file, what Kokoro was given,
// and whether the reading is right (results/items.json from score.mjs).
// usage: node page.mjs   (after audio_*.{mjs,py,sh} and score.mjs)
import fs from "fs";
import path from "path";
import { ambiguousSet, toText } from "@yomiscript/supertonic";
import { HERE, SETS } from "./sets.mjs";

const ITEMS = JSON.parse(fs.readFileSync(path.join(HERE, "results/items.json"), "utf8"));
const REFS = JSON.parse(fs.readFileSync(path.join(HERE, "refs.json"), "utf8"));
export const SYSTEMS = [
  { key: "claude", label: "Claude → YomiScript → Kokoro", scored: "claude" },
  { key: "codex", label: "Codex → YomiScript → Kokoro", scored: "codex" },
  { key: "supertonic_ys_claude_ambiguous", label: "Claude → YomiScript → Supertonic 3 Katarite (text, kana for ambiguous words)", optional: true },
  { key: "supertonic_ys_codex_ambiguous", label: "Codex → YomiScript → Supertonic 3 Katarite (text, kana for ambiguous words)", optional: true },
  { key: "kokoro", label: "Original Kokoro front end → Kokoro", scored: "original Kokoro" },
  { key: "supertonic", label: "Supertonic 3 (raw text)" },
  { key: "supertonic_hints", label: "Supertonic 3, reading hint as kana", optional: true },
  { key: "system", label: "macOS system voice (Web Speech on a Mac)" },
  { key: "audio8_ys_claude_ambiguous", label: "Claude → YomiScript → Audio8 0.1B (text, kana for ambiguous words; JSUT voice)", optional: true },
  { key: "audio8_ys_codex_ambiguous", label: "Codex → YomiScript → Audio8 0.1B (text, kana for ambiguous words; JSUT voice)", optional: true },
  { key: "audio8_ys_claude_kanji", label: "Claude → YomiScript → Audio8 0.1B (kana for every word with kanji; JSUT voice)", optional: true },
  {
    key: "audio8_ys_claude_kanji_kokoro",
    label: "Claude → YomiScript → Audio8 0.1B (kana for every word with kanji; voice cloned from Kokoro)",
    optional: true,
  },
  {
    key: "audio8_ys_claude_kanji_default",
    label: "Claude → YomiScript → Audio8 0.1B (kana for every word with kanji; the model's bundled voice)",
    optional: true,
  },
  { key: "audio8", label: "Audio8 0.1B (raw text; JSUT voice)", optional: true },
];
// what a text engine (Supertonic, Audio8) was given: the original text with kana hints, from the LLM's YomiScript
const AMBIGUOUS = ambiguousSet(JSON.parse(fs.readFileSync(path.join(HERE, "../../packages/supertonic/data/ambiguous.json"), "utf8")));
function kanaGiven(key, set, name) {
  const [llm, rule] = key.split("_ys_")[1].split("_");
  const ys = JSON.parse(fs.readFileSync(path.join(HERE, `results/${llm}.${set}.json`), "utf8")).output?.[name];
  if (!ys) return undefined;
  try {
    return toText(ys, AMBIGUOUS, rule);
  } catch {
    return undefined;
  }
}
const scoredAs = (set, prefix) => Object.entries(ITEMS[set] ?? {}).find(([k]) => k.startsWith(prefix))?.[1];

const out = {};
for (const [set, items] of Object.entries(SETS))
  out[set] = items.map((x, i) => ({
    name: x.name,
    text: x.text,
    category: x.category,
    gold: x.gold,
    reference: set === "hard" ? undefined : REFS[set][i].ps.join(" "),
    systems: SYSTEMS.filter((s) => !s.optional || fs.existsSync(path.join(HERE, `audio/${s.key}/${set}.${x.name}.wav`))).map((s) => {
      const file = `audio/${s.key}/${set}.${x.name}.wav`,
        sc = s.scored && (s.key === "kokoro" && set !== "hard" ? null : scoredAs(set, s.scored)?.[i]);
      let ps = s.key === "kokoro" ? REFS[set][i].ps.join(" ") : sc?.ps;
      if (s.key.includes("_ys_")) ps = kanaGiven(s.key, set, x.name);
      return { key: s.key, file: fs.existsSync(path.join(HERE, file)) ? file : null, ps, ok: sc ? sc.ok : undefined };
    }),
  }));
fs.writeFileSync(path.join(HERE, "audio/listen.json"), JSON.stringify({ systems: SYSTEMS, sets: out }));
console.log("audio/listen.json");
