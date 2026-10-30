// What Kokoro is given for a YomiScript, and when two of them are the same reading: shared by score.mjs and the trials.
import { K } from "../../demo/ys_web/node.mjs";

export function ps(ys) {
  try {
    return K.plan(ys)
      .map((s) => s.ps)
      .join(" ");
  } catch {
    return null;
  }
}
export const bare = (p) => p.replace(/[\s?.,!;:—…"“”()]/g, ""); // phonemes only: no word spaces or punctuation
// not reading differences: the spelling of long vowels (イイ / イー, エイ / エー, オウ / オー), Kokoro's ɨ for a devoiced ɯ,
// which allophone a moraic nasal is written with (ɴ before a word space, n before n), and h / n before i or ʲ written
// without their palatal allophone (hi = çi, hʲa = ça, ni = ɲi). The last two do change what Kokoro is given; see README.
export const loose = (p) =>
  bare(p)
    .replace(/ɨ/g, "ɯ")
    .replace(/hʲ/g, "ç")
    .replace(/hi/g, "çi")
    .replace(/nʲ/g, "ɲ")
    .replace(/n(?=i)/g, "ɲ")
    .replace(/[mnŋɲɴ](?![aiɯeoɨːʲ])/g, "N")
    .replace(/([aiɯeo])\1/g, "$1ː")
    .replace(/ei/g, "eː")
    .replace(/oɯ/g, "oː");
export function lev(a, b) {
  a = [...a];
  b = [...b];
  let p = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const c = [i];
    for (let j = 1; j <= b.length; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    p = c;
  }
  return p[b.length];
}
