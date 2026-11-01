// The prompts. Both YomiScript prompts are the shipped instructions (YOMISCRIPT_INSTRUCTIONS of @yomiscript/core) with
// one rule changed or added; the kana prompt is eval/representation's, as it is.
//   accent      the accent marks asked for: the "no accent marks" rule replaced by the Tokyo accent rule, and the
//               two Japanese examples of the instructions marked by the dictionary (OpenJTalk, as the gold)
//   mixed_ys    a rule added for words meant to be said in another language, and an example of it
//   mixed_kana  eval/representation/prompt_kana.md with its examples
import { YOMISCRIPT_INSTRUCTIONS } from "@yomiscript/core";
import { accentMarks } from "@yomiscript/ja-accent";
import { prompt as representationPrompt } from "../representation/formats.mjs";
import { ACCENT_ITEMS, MIXED_ITEMS, analyzer } from "./common.mjs";

export const TASKS = ["accent", "mixed_ys", "mixed_kana"];
const NO_MARKS = "- No pitch values and no accent marks: the synthesizer makes the prosody.";
const ACCENT_RULE = `- Japanese pitch accent (Tokyo): write \`ꜜ\` right after the accent-nucleus mora (the pitch falls after it) and \`ꜛ\` right after the mora where the pitch rises (the first mora of a phrase is low unless it is the nucleus). Put \` | \` between accent phrases and mark every phrase. A flat word has no \`ꜜ\` (桜が \`saꜛkɯɾa ɡa\`); a word whose fall comes after its last mora has \`ꜜ\` there (男が \`oꜛtokoꜜ ɡa\`); 命が \`iꜜnotɕi ɡa\`. Mark the accent each word has in this sentence and meaning. No pitch values: the synthesizer makes them from the marks.`;
const OTHER_RULE = `  - A word or phrase meant to be said in another language (a quoted English phrase, an English title, a name said the English way) goes in braces with its BCP 47 tag, in that language's IPA, inside the Japanese utterance: \`{en-US ˈɡʊd<t:Good> ˈnaɪt<t: night>}\`. A loanword or a word said the Japanese way (テーブル, iPhone \`aiɸoɴ\`) stays Japanese.`;
const MIXED_EXAMPLE = "ja /kaɾe<t:彼> wa<t:は> {en-US ˈɡʊd<t:「Good> ˈnaɪt<t: night」>} to<t:と> itta<t:言った。> ↘/";

// a second Japanese example for the accent prompt (its words are not in the items), marked by the dictionary too
const ACCENT_EXAMPLE = "ja /otoːto<t:弟> ɡa<t:が> sakɯɾa<t:桜> o<t:を> mi<t:見> ni<t:に> itta<t:行った。> ↘/";
const head = "You are acting as a **Yomite**: you write YomiScript for a speech synthesizer. Do not use any tools; answer directly.\n\n";
const tail = (task) =>
  `\n\n## Task\n\n${task}\n\nReturn **only** a JSON object mapping each item name to its YomiScript string, with no other text:\n\`{"<name>": "<YomiScript>", …}\`\n\n## Items\n\n`;
const list = (items) => items.map((x) => `- ${x.name} (ja): ${x.text}`).join("\n");
const exampleLines = (s) => s.split("\n").filter((l) => /^(ja|en-US) \//.test(l));

const allMarked = (ys) =>
  ys
    .slice(ys.indexOf("/") + 1, ys.lastIndexOf("/"))
    .split(/ [|‖] /)
    .every((p) => /[ꜛꜜ]/.test(p));
async function accentPrompt() {
  const a = await analyzer(),
    [rules, ex] = YOMISCRIPT_INSTRUCTIONS.split("\nExamples:\n");
  if (!rules.includes(NO_MARKS)) throw new Error("the instructions changed: the no-marks rule is not there");
  const marked = [...exampleLines(ex).filter((l) => l.startsWith("ja ")), ACCENT_EXAMPLE].map((l) => accentMarks(l, a)).filter(allMarked); // an example with a phrase the dictionary reads another way (一日 ついたち) is left out
  const body = `${rules.replace(NO_MARKS, ACCENT_RULE)}\nExamples:\n${marked.join("\n")}`;
  return head + body + tail("For each item, write the YomiScript of the text, with the accent marks.") + list(ACCENT_ITEMS());
}
function mixedYsPrompt() {
  const [rules, ex] = YOMISCRIPT_INSTRUCTIONS.split("\nExamples:\n"),
    english = "  - English: IPA with";
  if (!rules.includes(english)) throw new Error("the instructions changed: the English rule is not there");
  const withRule = rules.replace(english, OTHER_RULE + "\n" + english);
  const body = `${withRule}\nExamples:\n${[...exampleLines(ex), MIXED_EXAMPLE].join("\n")}`;
  return head + body + tail("For each item, write the YomiScript of the text.") + list(MIXED_ITEMS());
}

export async function prompts() {
  const items = MIXED_ITEMS().map((x) => ({ ...x, lang: "ja" }));
  return { accent: await accentPrompt(), mixed_ys: mixedYsPrompt(), mixed_kana: representationPrompt("kana", items) };
}
