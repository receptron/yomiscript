"""Does an automatic naturalness score agree with our blind listening tests in Japanese?

Every clip of the blind tests listened to on 2026-11-02 (eval/qwen3_tts, eval/qwen_prosody) is scored by UTMOS22
strong (SpeechMOS v1.2.0; a MOS predictor learnt mostly on English, BVCC), and its scores are compared with the
listener's answers, within each sentence:

  best       a system picked as the most natural against each other system of that sentence: does it score higher?
  unnatural  a system ticked as unnatural against each one not ticked: does it score lower?

Each comparison is one pair; agreement is the share of pairs the score orders as the listener did (chance: 50%).

usage: ../prosody_ref/.venv/bin/python score.py   -> results/scores.json, results/summary.md
"""

import json
from pathlib import Path

import librosa
import torch

HERE = Path(__file__).resolve().parent
EVAL = HERE.parent
HUB = Path.home() / ".cache/torch/hub/tarepan_SpeechMOS_v1.2.0"
# (answers, the folder whose listen.json and <variant>/<id>.wav were listened to)
TESTS = [
    ("qwen3_tts/results/listening.json", "qwen3_tts/audio/blind"),
    ("qwen3_tts/results/listening_transplant.json", "qwen3_tts/audio/transplant"),
    ("qwen3_tts/results/listening_transplant2.json", "qwen3_tts/audio/transplant2"),
    ("qwen3_tts/results/listening_pitch_ab.json", "qwen3_tts/audio/pitch_ab"),
    ("qwen_prosody/results/listening_refit.json", "qwen_prosody/audio/listen"),
    ("qwen_prosody/results/listening_refit2.json", "qwen_prosody/audio/listen"),
    ("qwen_prosody/results/listening_abs.json", "qwen_prosody/audio/abs"),
    ("qwen_prosody/results/listening_abs2.json", "qwen_prosody/audio/abs"),
]


def scorer():
    model = torch.hub.load(str(HUB), "utmos22_strong", source="local", trust_repo=True)
    cache = {}

    def score(wav):
        if wav not in cache:
            y, sr = librosa.load(wav, sr=16000)
            with torch.inference_mode():
                cache[wav] = float(model(torch.tensor(y)[None], sr).item())
        return cache[wav]

    return score


def pairs(answers, variants, mos):
    """(best pairs, unnatural pairs): (agrees, the pair) for every comparison the answers make"""
    best, unnat = [], []
    for item, a in answers.items():
        s = {v: mos(item, v) for v in variants}
        if a.get("better") in variants:
            best += [(s[a["better"]] > s[v], a["better"], v) for v in variants if v != a["better"]]
        bad = set(a.get("unnatural") or [])
        if a.get("better") == "neither":  # the older page's "both unnatural"
            bad = set(variants)
        for x in bad & set(variants):
            unnat += [(s[x] < s[v], x, v) for v in variants if v not in bad]
    return best, unnat


def main():
    score = scorer()
    out, summary = {}, []
    all_best, all_unnat = [], []
    for answers_file, folder in TESTS:
        test = json.loads((EVAL / answers_file).read_text())
        variants = json.loads((EVAL / folder / "listen.json").read_text())["variants"]
        mos = lambda item, v, folder=folder: score(str(EVAL / folder / v / f"{item}.wav"))  # noqa: E731
        best, unnat = pairs(test["answers"], variants, mos)
        out[answers_file] = {
            "mos": {item: {v: round(mos(item, v), 3) for v in variants} for item in test["answers"]},
            "mean": {v: round(sum(mos(i, v) for i in test["answers"]) / len(test["answers"]), 3) for v in variants},
        }
        all_best += best
        all_unnat += unnat
        rate = lambda P: f"{sum(p[0] for p in P)} of {len(P)}" if P else "-"  # noqa: E731
        summary.append(f"| {answers_file} | {', '.join(f'{v} {m}' for v, m in out[answers_file]['mean'].items())} | {rate(best)} | {rate(unnat)} |")
        print(summary[-1], flush=True)
    total = lambda P: f"{sum(p[0] for p in P)} of {len(P)} ({sum(p[0] for p in P) / len(P):.0%})"  # noqa: E731
    (HERE / "results").mkdir(exist_ok=True)
    (HERE / "results/scores.json").write_text(json.dumps(out, indent=1))
    head = "| test | mean UTMOS per system | best: scored higher | unnatural: scored lower |\n|---|---|---|---|\n"
    (HERE / "results/summary.md").write_text(head + "\n".join(summary) + f"\n| all | | {total(all_best)} | {total(all_unnat)} |\n")
    print(f"all: best {total(all_best)}; unnatural {total(all_unnat)}")


if __name__ == "__main__":
    main()
