// Seeded shuffling, shared by build.mjs (the clip ids and the control sample) and the listening page (the order of
// the clips and of the readings, per listener). No Node or browser globals: both import this file.

// a 32-bit hash of a string (FNV-1a)
export function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

// a generator of numbers in [0, 1) from a string seed (mulberry32)
export function rng(seed) {
  let a = hash(String(seed));
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// a copy of the list in an order fixed by the seed (Fisher-Yates)
export function shuffled(list, seed) {
  const next = rng(seed),
    out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
