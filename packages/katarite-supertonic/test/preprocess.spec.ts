// Supertonic's text side against the Python SDK (supertonic 1.3.1): the expected values were recorded from its
// UnicodeProcessor._preprocess_text, chunk_text and validate_text. No models needed.
import { describe, expect, it } from "vitest";
import { chunkText, latentSize, preprocess, textIds, unsupported } from "../src/index.ts";

// [input, with lang "ja", without lang]; the SDK normalizes to NFKD, so the expected strings are NFKD too
const PREPROCESSED: [string, string, string][] = [
  ["今日はいい天気ですね", "<ja>今日はいい天気ですね.</ja>", "今日はいい天気ですね."],
  ["ガギグ　パピプ？", "<ja>ガギグ パピプ?</ja>", "ガギグ パピプ?"],
  ["He said “hi” — then   left", '<ja>He said "hi" - then left.</ja>', 'He said "hi" - then left.'],
  ["e.g., A@B [x]|y/z#w", "<ja>for example, A at B x y z w.</ja>", "for example, A at B x y z w."],
  ["''quoted''  ``ticks``", "<ja>'quoted' 'ticks'</ja>", "'quoted' 'ticks'"],
  ["Wow ! Really ? Yes .", "<ja>Wow! Really? Yes.</ja>", "Wow! Really? Yes."],
  ["ｱｲｳ ①②", "<ja>アイウ 12.</ja>", "アイウ 12."],
  ["café naïve", "<ja>café naïve.</ja>", "café naïve."],
  ["I ♥ you © 2026\\", "<ja>I you 2026.</ja>", "I you 2026."],
  ["Smile 🙂 please", "<ja>Smile please.</ja>", "Smile please."],
];

describe("preprocess", () => {
  it.each(PREPROCESSED)("%s", (input, ja, plain) => {
    expect(preprocess(input, "ja")).toBe(ja.normalize("NFKD"));
    expect(preprocess(input)).toBe(plain.normalize("NFKD"));
  });
});

describe("chunkText", () => {
  it("splits by paragraph and sentence, not after abbreviations", () => {
    const text = "Mr. Smith went home. Dr. Who? Yes! It is 9 a.m. now. ".repeat(8) + "\n\nNew paragraph here. Another one.";
    expect(chunkText(text, 100)).toEqual([
      "Mr. Smith went home. Dr. Who? Yes! It is 9 a.m. now. Mr. Smith went home. Dr. Who? Yes! It is 9 a.m.",
      "now. Mr. Smith went home. Dr. Who? Yes! It is 9 a.m. now. Mr. Smith went home. Dr. Who? Yes!",
      "It is 9 a.m. now. Mr. Smith went home. Dr. Who? Yes! It is 9 a.m. now. Mr. Smith went home. Dr. Who?",
      "Yes! It is 9 a.m. now. Mr. Smith went home. Dr. Who? Yes! It is 9 a.m. now. Mr. Smith went home.",
      "Dr. Who? Yes! It is 9 a.m. now.",
      "New paragraph here. Another one.",
    ]);
  });
});

describe("input ids", () => {
  // a small indexer: ASCII and 漢 are known, everything else is not
  const id = (cp: number): number => {
    if (cp < 128) return cp + 1;
    return cp === 0x6f22 ? 500 : -1;
  };
  const indexer = Array.from({ length: 65536 }, (_, cp) => id(cp));
  it("maps each code point", () => {
    const text = "<ja>a漢.</ja>";
    expect(textIds(text, indexer)).toEqual(Array.from(text, (c) => id(c.charCodeAt(0))));
  });
  it("lists the characters the model cannot read", () => expect(unsupported("aɕb漢", indexer)).toEqual(["ɕ"]));
});

describe("latent size (float32 as numpy computes it)", () => {
  const cfg = { sampleRate: 44100, baseChunkSize: 512, chunkCompressFactor: 6, latentDim: 24 };
  it("rounds the latent length up to whole chunks", () => {
    expect(latentSize(1, cfg)).toEqual({ wavLength: 44100, latentLength: 15, maskLength: 15 });
    expect(latentSize(3072 / 44100, cfg)).toEqual({ wavLength: 3072, latentLength: 1, maskLength: 1 });
  });
});
