// The story of web/aozora.html as data: an Aozora Bunko XHTML file cut into sentences, each written as YomiScript by an LLM in
// the instructions the tools give, told the book's ruby. Only the LLM's YomiScript is kept: the accent, the pitch and the sound
// are made in the browser when a sentence is needed. A sentence the LLM writes with another text is asked again.
// usage: node aozora.mjs   -> web/aozora/<id>.json; the answers stay in out/aozora/ (needs the claude CLI)
import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parse } from "@yomiscript/core";
import { originalText } from "yomiscript";
import { askBatch } from "../../eval/koriyama_g2p/ask.mjs";
import { instructions } from "../../eval/llm_phrasing/run.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORK = path.join(HERE, "out/aozora"),
  BATCH = 25,
  TRIES = 5,
  BOOK = { id: "chumon", url: "https://www.aozora.gr.jp/cards/000081/files/43754_17659.html" };

const entities = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const between = (s, a, b) => s.slice(s.indexOf(a), s.indexOf(b, s.indexOf(a)));
/** the text outside the tags */
const withoutTags = (s) =>
  s
    .split("<")
    .map((part, i) => (i ? part.slice(part.indexOf(">") + 1) : part))
    .join("");

/** one line of the main text: { text, ruby: [[start, length, reading], ...] } */
function lineOf(html) {
  const ruby = [];
  let text = "",
    at = 0;
  for (const m of html.matchAll(/<ruby><rb>([^<]*)<\/rb><rp>[^<]*<\/rp><rt>([^<]*)<\/rt><rp>[^<]*<\/rp><\/ruby>/g)) {
    text += entities(withoutTags(html.slice(at, m.index)));
    ruby.push([text.length, m[1].length, m[2]]);
    text += m[1];
    at = m.index + m[0].length;
  }
  return { text: text + entities(withoutTags(html.slice(at))), ruby };
}

/** where the sentences of a line end: after 。！？ and their closing quotes, unless the quote goes on (「…。」と言いました) */
function sentenceEnds(text) {
  const ends = [];
  for (const m of text.matchAll(/[。！？]+[」』）]*/g)) {
    const end = m.index + m[0].length;
    if (end < text.length && !/^(?:と|って|という|、)/.test(text.slice(end))) ends.push(end);
  }
  return [...ends, text.length];
}

/** the line's sentences, each with the ruby that falls in it, at offsets in it */
function sentencesOf({ text, ruby }) {
  let from = 0;
  return sentenceEnds(text).map((end) => {
    const s = { text: text.slice(from, end), ruby: ruby.filter(([at]) => at >= from && at < end).map(([at, n, r]) => [at - from, n, r]) };
    from = end;
    return s;
  });
}

/** the book's paragraphs: { indent, first, sentences }; first: its line starts with a full-width space; the signs (字下げ) are indented */
export function paragraphsOf(html) {
  const main = between(html, '<div class="main_text">', '<div class="bibliographical_information">'),
    out = [];
  let indent = 0;
  for (const raw of main.split(/<br \/>/)) {
    for (const tag of raw.matchAll(/<div class="jisage_(\d+)"|<\/div>/g)) indent = tag[1] ? Number(tag[1]) : 0;
    const line = lineOf(raw.replace(/[\r\n]/g, "")),
      first = line.text.startsWith("　"),
      skip = line.text.length - line.text.trimStart().length,
      body = { text: line.text.slice(skip).trimEnd(), ruby: line.ruby.map(([at, n, r]) => [at - skip, n, r]) };
    if (body.text) out.push({ indent, first, sentences: sentencesOf(body) });
  }
  return out;
}

const rubyPair = (s, [at, n, r]) => `${s.text.slice(at, at + n)}=${r}`;
const rubyNote = (s) => (s.ruby.length ? `  (ruby: ${s.ruby.map((x) => rubyPair(s, x)).join(", ")})` : "");

/** every ruby of the book, once: it gives a word's ruby only the first time, and the LLM sees a part of the story at a time */
function glossary(all) {
  const readings = new Map();
  for (const s of all) for (const [at, n, r] of s.ruby) readings.set(s.text.slice(at, at + n), r);
  return [...readings].map(([word, r]) => `${word}=${r}`).join(", ");
}

const prompt = (items, words) =>
  [
    "These are consecutive sentences of a Japanese story written in 1924, about to be read aloud by a speech synthesizer. Write each as YomiScript. Do not use any tools.",
    `The ruby given after a sentence is the book's own reading of those words: follow it. The book gives a ruby only where a word first appears, so read the word the same way everywhere, unless the sense clearly differs: ${words}. Read the old spellings as the story means them. Words in Latin letters on a sign are read as Japanese katakana words. The text of each <t:…> must give back the sentence exactly, with every quote and punctuation mark. Use exactly the symbols of the rows below: ɲi for に everywhere, also inside a word (何か is naɲika, とにかく is toɲikakɯ), never ni; çi for ひ, never hi.`,
    items.map((x) => `${x.name}: ${x.text}${rubyNote(x)}`).join("\n"),
    instructions("phrase"),
    'Return only a JSON object: {"<name>": "<the sentence as YomiScript>", ...}, one entry for each sentence.',
  ].join("\n\n");

// spellings the instructions' rows do not have, which the Katarite speaks as other sounds than ɲi and çi
const OFF_THE_ROWS = /ni|hi/;

/** a sentence's answer, or null when it does not parse, does not give back the text or has a spelling off the rows */
function accepted(ys, text) {
  try {
    parse(ys);
    const sounds = ys.replaceAll(/<t:[^>]*>/g, "");
    return originalText(ys) === text && !OFF_THE_ROWS.test(sounds) ? ys : null;
  } catch {
    return null;
  }
}

/** the LLM's YomiScript of every item, by name; those still missing after TRIES are reported by the caller */
async function written(items) {
  const got = new Map(),
    words = glossary(items);
  for (let attempt = 0; attempt < TRIES; attempt++) {
    const left = items.filter((x) => !got.has(x.name));
    for (let i = 0; i < left.length; i += BATCH) {
      const part = left.slice(i, i + BATCH),
        file = path.join(WORK, `try${attempt}_b${i / BATCH}.json`);
      await askBatch({ file, llm: "claude", p: prompt(part, words), items: part, meta: { llm: "claude", format: "aozora", batch: i / BATCH } });
      const output = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")).output : null;
      for (const x of part) {
        const ys = output && accepted(output[x.name], x.text);
        if (ys) got.set(x.name, ys);
      }
    }
    console.log(`try ${attempt}: ${got.size} of ${items.length}`);
  }
  return got;
}

/** the book's credit lines, as the file gives them */
function creditOf(html) {
  return between(html, '<div class="bibliographical_information">', '<div class="notation_notes">')
    .split(/<br \/>/)
    .map((l) => withoutTags(l).trim())
    .filter((l) => l && !l.startsWith("このファイルは") && l !== "青空文庫作成ファイル：");
}

async function main() {
  fs.mkdirSync(WORK, { recursive: true });
  const source = path.join(WORK, `${BOOK.id}.html`);
  if (!fs.existsSync(source)) fs.writeFileSync(source, Buffer.from(await (await fetch(BOOK.url)).arrayBuffer()));
  const html = new TextDecoder("shift_jis").decode(fs.readFileSync(source)),
    paragraphs = paragraphsOf(html),
    all = paragraphs.flatMap((p) => p.sentences);
  all.forEach((s, i) => (s.name = `s${i + 1}`));
  console.log(`${paragraphs.length} paragraphs, ${all.length} sentences, longest ${Math.max(...all.map((s) => s.text.length))} characters`);
  const got = await written(all),
    missing = all.filter((s) => !got.has(s.name));
  if (missing.length) throw new Error(`no YomiScript for: ${missing.map((s) => s.name).join(" ")}`);
  for (const s of all) {
    s.ys = got.get(s.name);
    delete s.name;
  }
  const story = { title: "注文の多い料理店", author: "宮沢賢治", source: BOOK.url, credit: creditOf(html), paragraphs },
    version = createHash("sha256").update(JSON.stringify(story)).digest("hex").slice(0, 12),
    out = path.join(HERE, `web/aozora/${BOOK.id}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify({ version, ...story })}\n`);
  console.log(out, fs.statSync(out).size, "bytes", version);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
