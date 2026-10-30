// Supertonic 3's text side, as its Python SDK does it (supertonic 1.3.1, core.py UnicodeProcessor and utils.py
// chunk_text): normalize the text, wrap it in language tags, and turn each character into the model's input id.
// Lengths count code points, as Python's len() does.

/** the languages Supertonic 3 speaks, and "na" for text in an unknown language */
export const SUPERTONIC_LANGUAGES = [
  "en",
  "ko",
  "ja",
  "ar",
  "bg",
  "cs",
  "da",
  "de",
  "el",
  "es",
  "et",
  "fi",
  "fr",
  "hi",
  "hr",
  "hu",
  "id",
  "it",
  "lt",
  "lv",
  "nl",
  "pl",
  "pt",
  "ro",
  "ru",
  "sk",
  "sl",
  "sv",
  "tr",
  "uk",
  "vi",
] as const;
export const UNKNOWN_LANGUAGE = "na";

// the SDK's emoji ranges (its _EMOJI_PATTERN), removed character by character
const EMOJI_RANGES: [number, number][] = [
  [0x1f600, 0x1f64f],
  [0x1f300, 0x1f5ff],
  [0x1f680, 0x1f6ff],
  [0x1f700, 0x1f77f],
  [0x1f780, 0x1f7ff],
  [0x1f800, 0x1f8ff],
  [0x1f900, 0x1f9ff],
  [0x1fa00, 0x1fa6f],
  [0x1fa70, 0x1faff],
  [0x2600, 0x26ff],
  [0x2700, 0x27bf],
  [0x1f1e6, 0x1f1ff],
];
const isEmoji = (c: string): boolean => {
  const cp = c.codePointAt(0) ?? 0;
  return EMOJI_RANGES.some(([lo, hi]) => cp >= lo && cp <= hi);
};
// in this order, as the SDK applies them
const SYMBOLS: [string, string][] = [
  ["–", "-"],
  ["‑", "-"],
  ["—", "-"],
  ["¯", " "],
  ["_", " "],
  ["“", '"'],
  ["”", '"'],
  ["‘", "'"],
  ["’", "'"],
  ["´", "'"],
  ["`", "'"],
  ["[", " "],
  ["]", " "],
  ["|", " "],
  ["/", " "],
  ["#", " "],
  ["→", " "],
  ["←", " "],
];
const EXPRESSIONS: [string, string][] = [
  ["@", " at "],
  ["e.g.,", "for example, "],
  ["i.e.,", "that is, "],
];
const SPACE_BEFORE: [RegExp, string][] = [
  [/ ,/g, ","],
  [/ \./g, "."],
  [/ !/g, "!"],
  [/ \?/g, "?"],
  [/ ;/g, ";"],
  [/ :/g, ":"],
  [/ '/g, "'"],
];
const ENDING = /[.!?;:,'")\]}…。」』】〉》›»]$/;

/** the SDK's normalization, then <lang>…</lang> when a language is given */
export function preprocess(text: string, lang?: string): string {
  text = Array.from(text.normalize("NFKD"))
    .filter((c) => !isEmoji(c))
    .join("");
  for (const [a, b] of SYMBOLS) text = text.replaceAll(a, b);
  text = text.replace(/[♥☆♡©\\]/g, "");
  for (const [a, b] of EXPRESSIONS) text = text.replaceAll(a, b);
  for (const [re, b] of SPACE_BEFORE) text = text.replace(re, b);
  text = text
    .replace(/(["'`])\1+/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  if (!ENDING.test(text)) text += ".";
  return lang === undefined ? text : `<${lang}>${text}</${lang}>`;
}

/** unicode_indexer.json: the model's id for each UTF-16 code unit value, -1 where the model has none */
export type Indexer = readonly number[];

/** the characters of text the model cannot read (empty when it can read all of it) */
export function unsupported(text: string, indexer: Indexer): string[] {
  const bad = new Set<string>();
  for (const ch of new Set(Array.from(text)))
    for (const c of Array.from(preprocess(ch))) {
      const cp = c.codePointAt(0) ?? 0;
      if (cp >= indexer.length || indexer[cp] === -1) bad.add(ch);
    }
  return [...bad].sort();
}

/** the input ids of one preprocessed text */
export function textIds(preprocessed: string, indexer: Indexer): number[] {
  return Array.from(preprocessed, (c) => {
    const id = indexer[c.codePointAt(0) ?? 0];
    if (id === undefined || id < 0) throw new Error(`Supertonic has no input for ${JSON.stringify(c)}`);
    return id;
  });
}

// sentence ends, except after common abbreviations and single capital letters (the SDK's regex, as a scan)
const ABBREVIATIONS = [
  "Mr.",
  "Mrs.",
  "Ms.",
  "Dr.",
  "Prof.",
  "Sr.",
  "Jr.",
  "Ph.D.",
  "etc.",
  "e.g.",
  "i.e.",
  "vs.",
  "Inc.",
  "Ltd.",
  "Co.",
  "Corp.",
  "St.",
  "Ave.",
  "Blvd.",
];
const isSpace = (c: string | undefined): boolean => c !== undefined && /\s/.test(c);
function sentenceEnd(before: string): boolean {
  if (!".!?".includes(before.at(-1) ?? " ")) return false;
  return !ABBREVIATIONS.some((a) => before.endsWith(a)) && !/\b[A-Z]\.$/.test(before);
}
/** the paragraph split at the whitespace after each sentence end */
export function sentences(paragraph: string): string[] {
  const out: string[] = [];
  let from = 0;
  for (let i = 0; i < paragraph.length; i++) {
    if (!isSpace(paragraph[i]) || isSpace(paragraph[i - 1]) || !sentenceEnd(paragraph.slice(0, i))) continue;
    out.push(paragraph.slice(from, i));
    let j = i;
    while (isSpace(paragraph[j])) j++;
    from = j; // the rest of this run of spaces is skipped: the character before it is a space
  }
  out.push(paragraph.slice(from));
  return out;
}
const cpLength = (s: string): number => Array.from(s).length;

function sentenceChunks(paragraph: string, maxLen: number, chunks: string[]): void {
  // sentences joined with a space while the chunk stays within maxLen
  let cur = "";
  for (const s of sentences(paragraph).map((x) => x.trim())) {
    if (!s) continue;
    if (cpLength(cur) + cpLength(s) + 1 <= maxLen) cur += (cur ? " " : "") + s;
    else {
      if (cur) chunks.push(cur.trim());
      cur = s;
    }
  }
  if (cur.trim()) chunks.push(cur.trim());
}
/** long text in chunks of at most maxLen characters, by paragraph and then by sentence (the SDK's chunk_text) */
export function chunkText(text: string, maxLen = 300): string[] {
  const chunks: string[] = [];
  for (const paragraph of text
    .trim()
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean))
    sentenceChunks(paragraph, maxLen, chunks);
  return chunks;
}
