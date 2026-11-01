// The time of each unit of a planned Kokoro section, from Kokoro's predicted durations: shared by ours.mjs and
// eval/ipa_value/synth.mjs, which align pitch with the morae.
import * as K from "@yomiscript/kokoro";

/** Map from a token's index in sec.toks to its { start, end } in seconds, starting at offset */
export function unitSpans(sec, dur, offset = 0) {
  const step = K.SAMPLES_PER_STEP / K.SR,
    at = new Map();
  let t = offset;
  sec.uid.forEach((k, i) => {
    const d = dur[i] * step;
    if (k >= 0) {
      const x = at.get(k);
      if (x) x.end = t + d;
      else at.set(k, { start: t, end: t + d });
    }
    t += d;
  });
  return at;
}
