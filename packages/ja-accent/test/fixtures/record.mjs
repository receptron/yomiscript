// Records what the dictionary lookup (D31) asks the front end for the YomiScripts of analysis.json, into lookup.json,
// so the tests replay it without the dictionary: each sentence's candidates, every connection cost asked for, and
// the rules on each path asked for. Run after `yarn build`, with the dictionary in ~/.cache/yomiscript/ja-dict.
// usage: node record.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { accentMarks } from "@yomiscript/ja-accent";
import { nodeAnalyzer } from "@yomiscript/ja-accent/node";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const base = path.join(process.env.HOME, ".cache/yomiscript/ja-dict");
const real = await nodeAnalyzer({ dir: path.join(base, fs.readdirSync(base)[0]) });
const rec = { candidates: {}, conn: {}, label: {} };
const recording = {
  analyze: (text) => real.analyze(text),
  candidates: (words) => (rec.candidates[JSON.stringify(words)] = real.candidates(words)),
  conn: (r, l) => (rec.conn[`${r},${l}`] = real.conn(r, l)),
  // a path with phrases of the YomiScript's own (D32) is recorded with them
  label: (words, p, accents, chain) => (rec.label[JSON.stringify(chain ? [words, p, chain] : [words, p])] = real.label(words, p, accents, chain)),
};
// YomiScripts with accent phrases of their own (D32), as the tests try them
export const OWN = [
  "ja /kʲoː<t:今日> wa<t:は> haɾete<t:晴れて> | imasɯ<t:います。> ↘/",
  "ja /kʲoː<t:今日> wa<t:は> | haɾete<t:晴れて> imasɯ<t:います。> ↘/",
  "ja /kʲoː<t:今日> wa<t:は> ‖<t:> haɾete<t:晴れて> imasɯ<t:います。> ↘/", // a pause of no text
  // a word named like a property of every JavaScript object; a phrase the dictionary does not read the same way
  "ja /kʲoː<t:今日> wa<t:は> | koɴsɯtoɾakɯta<t:constructor> | desɯ<t:です。> ↘/",
  "ja /kʲoː<t:今日> wa<t:は> | mamima<t:晴れて> | imasɯ<t:います。> ↘/",
  // another language's marks in the utterance
  "ja /kʲoː<t:今日> wa<t:は> | haɾete<t:晴れて> {en həꜛloʊ<t:hello>} imasɯ<t:います。> ↘/",
  // a Japanese section with no phrases of its own, beside one with them and alone
  "ja /kʲoː<t:今日> wa<t:は> | haɾete<t:晴れて> {en ˈhɛloʊ<t:hello>} aɕita<t:明日> wa<t:は> ame<t:雨> desɯ<t:です。> ↘/",
  "ja /kʲoː<t:今日> wa<t:は> haɾete<t:晴れて> {en ˈhɛloʊ<t:hello>} aɕita<t:明日> wa<t:は> ame<t:雨> desɯ<t:です。> ↘/",
  // words that start with an opening quote, with no quote, and in the middle of a sentence
  "ja /kotoɲi<t:「ことに> | ɸɯtta<t:肥った> ↘/",
  "ja /kotoɲi<t:ことに> | ɸɯtta<t:肥った> ↘/",
  "ja /soː<t:「そう> daɾoː<t:だろう。> ↘/",
  "ja /kaɾe<t:彼> wa<t:は> | kotoɲi<t:「ことに> | jasɯi<t:安い」> to<t:と> | iɯ<t:言う。> ↘/",
  "ja /a<t:「> kotoɲi<t:ことに> ↘/",
  // the auxiliary てる / でる after a verb with a fall and after one without
  "ja /motteɾɯ<t:持ってる> ↘/",
  "ja /jondeɾɯ<t:読んでる> ↘/",
  "ja /jondeɾɯ<t:呼んでる> ↘/",
  "ja /motteɾɯ<t:盛ってる> ↘/",
  "ja /hanaɕiteɾɯ<t:話してる> ↘/",
];
const REC = JSON.parse(fs.readFileSync(path.join(HERE, "analysis.json"), "utf8"));
for (const { ys } of REC) {
  accentMarks(ys, recording);
  accentMarks(ys.replace("kʲoː", "kjoː"), recording); // the spelling the tests also try
}
for (const ys of OWN) accentMarks(ys, recording);
fs.writeFileSync(path.join(HERE, "lookup.json"), JSON.stringify(rec));
console.log(Object.keys(rec.candidates).length, "sentences,", Object.keys(rec.conn).length, "costs,", Object.keys(rec.label).length, "paths");
