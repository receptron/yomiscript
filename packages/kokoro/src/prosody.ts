// Kokoro's prosody prediction, used on the Yomite side: runs Kokoro's duration + F0 predictor (enc + f0n) on a
// YomiScript and writes the predicted pitch back as <f0:…> values (semitones relative to the section's mean),
// up to three points per unit (start, middle, end). Units that already carry values, and unvoiced units, are left alone.
import { applyEdits, f0Mark, type Edit } from "@yomiscript/core";
import type { Engine } from "./engine.ts";
import { plan } from "./plan.ts";

export class KokoroProsody {
  private E: Engine;
  // shares the Katarite engine's ONNX sessions and voices
  constructor(E: Engine) {
    this.E = E;
  }
  async realize(ys: string): Promise<string> {
    const P = plan(ys),
      E: Edit[] = [];
    for (const sec of P) {
      const { f0, dur } = await this.E.predict(sec);
      const fu: number[] = [];
      dur.forEach((d, l) => {
        for (let r = 0; r < d * 2; r++) fu.push(sec.uid[l]);
      });
      const fr: number[][] = sec.U.map(() => []);
      for (let i = 0; i < Math.min(fu.length, f0.length); i++) if (fu[i] >= 0 && f0[i] > 60) fr[fu[i]].push(12 * Math.log2(f0[i]));
      const all = sec.toks.flatMap((t, k) => (t.kind === "unit" ? fr[k] : []));
      if (!all.length) continue;
      const m = all.reduce((s, v) => s + v, 0) / all.length;
      sec.toks.forEach((t, k) => {
        const F = fr[k];
        if (t.kind !== "unit" || t.f0 || !F.length) return;
        const c = F.length >= 3 ? [F[0], F[F.length >> 1], F[F.length - 1]] : [F.reduce((s, v) => s + v, 0) / F.length];
        E.push({ at: t.end ?? 0, ins: f0Mark(c.map((v) => v - m)) });
      });
    }
    return applyEdits(P.src, E);
  }
}
