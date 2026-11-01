"""The pitch of every Japanese mora of the accent audio: results/f0.json
{condition: {item: {"median": [...], "end": [...]}}}, semitones relative to 100 Hz, null where nothing is voiced.

Praat's pitch (parselmouth, autocorrelation, 5 ms steps, 100-600 Hz for the jf_alpha voice). "median": over all the
voiced frames of the mora; "end": over the voiced frames of its second half. The end is the measure scored: Tokyo
speech, and the Japanese pitch model of the rules (D29, fitted to JSUT), reach the peak of an accented mora at its end
or just after it, so the whole-mora median of an accented first mora still rises. The mora times are the
Katarite's own (Kokoro's predicted durations, in the .json next to each wav), so no alignment is needed.

usage: ../prosody_ref/.venv/bin/python f0.py
"""

import json
from pathlib import Path

import numpy as np
import parselmouth

HERE = Path(__file__).parent


def mora_pitch(wav, morae):
    p = parselmouth.Sound(str(wav)).to_pitch_ac(time_step=0.005, pitch_floor=100, pitch_ceiling=600)
    t, f = p.xs(), p.selected_array["frequency"]
    out = {"median": [], "end": []}
    for m in morae:
        a, b = m["start"], m["end"]
        out["median"].append(semitones(f[(t >= a) & (t < b) & (f > 0)]))
        out["end"].append(semitones(f[(t >= (a + b) / 2) & (t < b) & (f > 0)]))
    return out


def semitones(v):
    return round(float(12 * np.log2(np.median(v) / 100)), 2) if len(v) else None


def main():
    res = {}
    for j in sorted((HERE / "audio/accent").glob("*/*.json")):
        morae = json.loads(j.read_text())["morae"]
        res.setdefault(j.parent.name, {})[j.stem] = mora_pitch(j.with_suffix(".wav"), morae)
    (HERE / "results/f0.json").write_text(json.dumps(res))
    print(f"{sum(len(v) for v in res.values())} files")


if __name__ == "__main__":
    main()
