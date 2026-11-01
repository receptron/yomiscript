// How much context does an LLM need to read a Japanese homograph right? (README.md) Each item of items.tsv is a
// short target sentence, ambiguous on its own, with a preceding paragraph (external text) and a user's message (chat)
// that fix the reading. Three LLMs write YomiScript for the sentence, with and without that context; and, as authors,
// answer the user's message in a few characters, whose answers every LLM then reads with and without the message.
// Several items go in one call (BATCH, no two of the same word); the batches are the same in every condition.
// usage: node run.mjs [run]   -> results/r<run>/<condition>/<llm>/b<k>.json, results/r<run>/authread/<author>/<reader>.<alone|context>/b<k>.json
// A result already there is kept, so a run that stopped continues where it was.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { YOMISCRIPT_INSTRUCTIONS } from "@yomiscript/core";
import { LLMS, ask, pool } from "../author_reading/run.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BATCH = 10;
const MAX_CHARS = 15; // the authors' answers
const RUN = path.join(HERE, "results", `r${process.argv[2] ?? 1}`);

export function items() {
  return fs
    .readFileSync(path.join(HERE, "items.tsv"), "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const [id, word, right, wrong, target, paragraph, user] = l.split("\t");
      return { id, word, right: right.split("|"), wrong: wrong.split("|"), target, paragraph, user };
    });
}

function random(seed) {
  // mulberry32: the same batches on every run
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function batches(all) {
  // the words in a shuffled order, one reading of each first (which one, at random), then the other: BATCH items
  // in a row never hold both readings of a word as long as there are more words than BATCH
  const rnd = random(20261101);
  const shuffle = (a) =>
    a
      .map((x) => [rnd(), x])
      .sort((p, q) => p[0] - q[0])
      .map(([, x]) => x);
  const words = shuffle([...new Set(all.map((s) => s.word))]);
  const pairs = words.map((w) => shuffle(all.filter((s) => s.word === w)));
  const order = [...pairs.map((p) => p[0]), ...pairs.map((p) => p[1])];
  return Array.from({ length: Math.ceil(order.length / BATCH) }, (_, k) => order.slice(k * BATCH, (k + 1) * BATCH));
}

const userMessage = (s) => `${s.user}「${s.word}」という言葉を使って、一言で答えて。`;
const numbered = (list, show) => list.map((x, i) => `[${i + 1}]\n${show(x)}`).join("\n\n");
const reply = (n, fields) => `Return only a JSON object: {"items": [{"n": 1, ${fields}}, ...]}, with one entry for each of the ${n} items, n being its number.`;

const prompt = (head, list, show, ask, fields) =>
  [head, numbered(list, show), ...(ask ? [ask] : []), YOMISCRIPT_INSTRUCTIONS, reply(list.length, fields)].join("\n\n");

const external = (batch, context) =>
  prompt(
    `Below are ${batch.length} short Japanese texts, numbered. They are unrelated to each other: each comes from a different web page, news article or document, and is about to be spoken aloud by a speech synthesizer. ` +
      (context
        ? "For each you are given the paragraph that precedes it in the original, and the sentence to be spoken. Write only the sentence as YomiScript, not the paragraph."
        : "Write each text as YomiScript.") +
      " Do not use any tools.",
    batch,
    (s) => (context ? `Preceding paragraph: ${s.paragraph}\nSentence: ${s.target}` : s.target),
    null,
    context ? '"ys": "<the sentence as YomiScript>"' : '"ys": "<the text as YomiScript>"',
  );

const chat = (list, context) =>
  prompt(
    `Below are ${list.length} separate chats, numbered and unrelated to each other. In each, a chat assistant's answer is about to be spoken aloud by a speech synthesizer. Write each answer as YomiScript. Do not use any tools.`,
    list,
    ({ user, answer }) => (context ? `The user wrote: ${user}\nThe assistant answered: ${answer}` : `The answer: ${answer}`),
    null,
    '"ys": "<the answer as YomiScript>"',
  );

const author = (batch) =>
  prompt(
    `You are the voice of a chat assistant: what you answer is spoken aloud by a speech synthesizer. Below are ${batch.length} messages from different users, numbered and unrelated to each other. Do not use any tools.`,
    batch,
    (s) => `The user wrote: ${userMessage(s)}`,
    `Answer each user in Japanese in at most ${MAX_CHARS} characters, using the word the user asks for. Do not repeat any word of the user's message other than that word, and do not add readings in parentheses. Write each answer as YomiScript so that it is spoken as you mean it.`,
    '"text": "<your answer>", "ys": "<your answer as YomiScript>"',
  );

// for a look at the prompts (node -e)
export const prompts = { external, chat, author };

const complete = (n, keys) => (o) =>
  Array.isArray(o.items) &&
  Array.from({ length: n }, (_, i) => o.items.find((x) => x.n === i + 1)).every((x) => x && keys.every((k) => typeof x[k] === "string"));

export function answers(file, n) {
  // the author's answers of one batch by position (null where missing)
  const out = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")).output : null;
  return Array.from({ length: n }, (_, i) => out?.items?.find((x) => x.n === i + 1)?.text ?? null);
}

async function main() {
  const B = batches(items());
  const t0 = Date.now();
  let calls = 0;
  const tick = () => ++calls % 20 || console.log(`${calls} calls, ${Math.round((Date.now() - t0) / 1000)} s`);
  const job = (llm, prompt, n, file, keys) => [llm, () => ask(llm, prompt, file, complete(n, keys), 3).then(tick)];
  // the batches, by item id, for score.py
  fs.mkdirSync(RUN, { recursive: true });
  fs.writeFileSync(path.join(RUN, "batches.json"), JSON.stringify(B.map((b) => b.map((s) => s.id))));
  const first = [];
  B.forEach((b, k) => {
    for (const llm of LLMS) {
      const f = (cond) => path.join(RUN, cond, llm, `b${k}.json`);
      first.push(job(llm, external(b, false), b.length, f("ext.alone"), ["ys"]));
      first.push(job(llm, external(b, true), b.length, f("ext.context"), ["ys"]));
      const fixed = b.map((s) => ({ user: s.user, answer: s.target }));
      first.push(job(llm, chat(fixed, false), b.length, f("chat.alone"), ["ys"]));
      first.push(job(llm, chat(fixed, true), b.length, f("chat.context"), ["ys"]));
      first.push(job(llm, author(b), b.length, f("author"), ["text", "ys"]));
    }
  });
  await pool(first);
  // every LLM reads every author's answers, with and without the user's message; a missing answer is left out (the
  // others keep their order)
  const second = [];
  B.forEach((b, k) => {
    for (const a of LLMS) {
      const texts = answers(path.join(RUN, "author", a, `b${k}.json`), b.length);
      const list = b.map((s, i) => ({ user: userMessage(s), answer: texts[i] })).filter((x) => x.answer);
      if (!list.length) continue;
      for (const r of LLMS)
        for (const context of [false, true]) {
          const file = path.join(RUN, "authread", a, `${r}.${context ? "context" : "alone"}`, `b${k}.json`);
          second.push(job(r, chat(list, context), list.length, file, ["ys"]));
        }
    }
  });
  await pool(second);
  console.log(`done: ${calls} calls in ${Math.round((Date.now() - t0) / 1000)} s`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
