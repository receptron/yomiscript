"""Qwen's prosody, per unit of the tools' YomiScript (audio/transplant/prep.json), for transplant.mjs.

Qwen's clone audio (audio/raw/clone) is force-aligned to the YomiScript's units (eval/prosody_ref/align.py, MMS_FA);
its pitch is Praat's (eval/prosody_ref/score.py's features: semitones from the utterance's median). For each mora:

  values  three values, at the start, the middle and the end of its voiced frames, as the Katarite places them
          (D28); none when it has no voiced frame or one is more than an octave from the median (a tracking error).
          A final mora's voiced frames are looked for up to 0.3 s past its letters (D29)
  spans   [start, end] seconds: from its first letter to the next mora's first letter; before a pause, to where its
          sound falls below SILENCE_DB; the last mora, to where its sound does
  pauses  for each pause unit: the time from there to the first letter after it
  gaps    a silence of more than GAP s where the YomiScript has no pause (Qwen paused after a word): the mora ends
          where its sound does, and the silence is given to the space after it (by the space's unit index)

usage: ../prosody_ref/.venv/bin/python measure.py   -> audio/transplant/measured.json
"""

import json
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "prosody_ref"))
from align import letter_spans  # noqa: E402
from score import HOP, OCTAVE, features  # noqa: E402

# IPA onsets of YomiScript's Japanese morae -> OpenJTalk's phonemes (align.py's input); before i, the palatal onsets
# are OpenJTalk's plain row (ɕi = sh i, ɲi = n i, çi = h i)
ONSET = {"ɕ": "sh", "tɕ": "ch", "dʑ": "j", "dz": "z", "ɲ": "ny", "ç": "hy", "ɸ": "f", "ɾ": "r", "ɡ": "g", "j": "y"}
BEFORE_I = {"ny": "n", "hy": "h"}
VOWEL = {"ɯ": "u", "ɨ": "u"}
FINAL_TAIL = 0.3
GAP = 0.08
SILENCE_DB = -30  # below the utterance's RMS: where a mora before a pause ends (CTC letters end before the sound does)


def onset(on, v):
    if not on:
        return []
    pal = on.endswith("ʲ")
    base = on[:-1] if pal else on
    o = ONSET.get(base, base)
    if pal:
        o = o + "y" if not o.endswith("y") else o
    if v == "i":
        o = BEFORE_I.get(o, o)
    return [o]


def phonemes(units):
    """OpenJTalk phonemes for each unit (align.py's morae)"""
    out, last_v = [], "a"
    for t in units:
        if t["mk"] == "N":
            out.append(["N"])
        elif t["mk"] == "Q":
            out.append(["cl"])
        elif t["mk"] == "R":
            out.append([last_v])
        else:
            v = VOWEL.get(t["v"], t["v"])
            last_v = v
            out.append([*onset(t.get("on"), v), v.upper() if t.get("dev") else v])
    return out


def three_values(st, t0, a, b):
    """the pitch at the start, middle and end of the voiced frames of [a, b) seconds, or None"""
    i, j = int(max(0, (a - t0) / HOP)), int(np.ceil((b - t0) / HOP))
    voiced = [k for k in range(i, min(j, len(st))) if not np.isnan(st[k])]
    if not voiced:
        return None
    va, vb = voiced[0], voiced[-1]
    vals = []
    for x in (va, (va + vb) / 2, vb):
        w = st[max(va, int(x) - 2) : min(vb, int(x) + 2) + 1]
        w = w[~np.isnan(w)]
        vals.append(float(np.median(w)) if len(w) else np.nan)
    if any(np.isnan(v) or abs(v) > OCTAVE for v in vals):
        return None
    return [round(v, 2) for v in vals]


def sound_end(y, sr, a, b):
    """the end of the sound that runs on from a (seconds), looked for up to b: the first 10 ms below SILENCE_DB"""
    hop, ref = int(0.01 * sr), np.sqrt(np.mean(y**2))
    t = int(a * sr)
    while t + hop < int(b * sr) and 20 * np.log10(np.sqrt(np.mean(y[t : t + hop] ** 2)) / ref + 1e-12) > SILENCE_DB:
        t += hop
    return t / sr


def measure(p, wav):
    toks = p["toks"]
    unit_k = [k for k, t in enumerate(toks) if t["kind"] == "unit"]
    y, sr = sf.read(wav)
    sp, score = letter_spans(y, sr, phonemes([toks[k] for k in unit_k]))
    st, t0, _ = features(str(wav))
    spans, values, pauses, gaps = [], [], {}, {}
    for i, k in enumerate(unit_k):
        nxt = unit_k[i + 1] if i + 1 < len(unit_k) else None
        between = [] if nxt is None else [q for q in range(k + 1, nxt) if toks[q]["kind"] in ("pause", "space")]
        pause = any(toks[q]["kind"] == "pause" for q in between)
        end = sound_end(y, sr, sp[i][1], len(y) / sr) if nxt is None else sp[i + 1][0]
        if nxt is not None and (pause or between):
            heard = sound_end(y, sr, sp[i][1], sp[i + 1][0])
            if pause or sp[i + 1][0] - heard > GAP:
                end = heard
                if not pause:
                    gaps[between[0]] = round(sp[i + 1][0] - heard, 3)
        spans.append([round(sp[i][0], 3), round(end, 3)])
        values.append(three_values(st, t0, sp[i][0], end + (FINAL_TAIL if nxt is None else 0)))
        if pause:
            q = next(q for q in range(k + 1, nxt) if toks[q]["kind"] == "pause")
            pauses[q] = round(sp[i + 1][0] - end, 3)
    centre = np.median([v for vs in values if vs for v in vs])
    values = [[round(v - centre, 2) for v in vs] if vs else None for vs in values]
    return {"spans": spans, "values": values, "pauses": pauses, "gaps": gaps, "align_score": round(score, 3)}


def main():
    out = {}
    for p in json.loads((HERE / "audio/transplant/prep.json").read_text()):
        m = measure(p, HERE / "audio/raw/clone" / f"{p['name']}.wav")
        out[p["name"]] = m
        none = sum(v is None for v in m["values"])
        print(p["name"], f"align {m['align_score']}", f"{len(m['values']) - none}/{len(m['values'])} morae with values", m["pauses"], m["gaps"])
    (HERE / "audio/transplant/measured.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
