"""The hard set scored on its target words, not on whole sentences (results/items.json -> results/targets.md).

score.mjs counts a sentence of the hard set as right only when its whole phoneme string has the gold reading, so a
notation slip elsewhere in the sentence (h005: 経済 written keːzai) counts against the homograph the sentence is about.
Here only the words of eval/tts_readings/targets.tsv are scored (69 words in 62 sentences; the other sentences have
no word whose reading is in question, h005 among them).

For each word, the sentence's first gold reading is written once with each of the word's readings (right or a listed
misreading, everything else the same), as the TTS judge does (eval/tts_readings/score.py, minimal_pairs). The system's
phoneme string and each candidate are romanized (romanized, spelt) and the word is read the way of the candidate at
the smallest edit distance; a tie goes to the right reading, as in the judge's validation (nearest). The rest of the
sentence is the same in every candidate, so a slip elsewhere adds the same distance to all of them.

A word is listed as a close call when its best right and best misread candidates are equally far, or when the
romanized reading of the chosen candidate does not occur in the phoneme string: a reading that is neither of those
listed, or a spelling the romanization does not bring together (the README lists how each was resolved by hand).

usage: ../prosody_ref/.venv/bin/python target_score.py   -> results/targets.md
"""

import importlib.util
import json
import re
from pathlib import Path

HERE = Path(__file__).parent
_spec = importlib.util.spec_from_file_location("tts_score", HERE.parent / "tts_readings/score.py")
tts = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(tts)

CATS = tts.CATS


def letters(kana):
    # a katakana reading in the aligner's letters, as romanized() writes Kokoro's phonemes; the moraic nasal as n
    _, d, _ = tts.model()
    inv = {v: k for k, v in d.items()}
    return nasal("".join(inv[i] for i in tts.spelt(kana))) if kana else ""


def nasal(s):
    # Kokoro writes the moraic nasal as m before b, p and m; spelt() writes it as n
    return re.sub(r"m(?=[bpm])", "n", s)


def word_verdicts(x, ps):
    # per target word: (right?, close call?, the candidate chosen, margin)
    out = []
    spoken = nasal(tts.romanized(ps))
    for (word, right, wrong), D in zip(x["targets"], tts.nearest(tts.minimal_pairs(x), ps), strict=True):
        best = D[0]
        r = min(dist for dist, bad, _ in D if not bad)
        w = min(dist for dist, bad, _ in D if bad)
        # the reading whose candidate sentence is the closest one (minimal_pairs writes it into the first gold)
        reading = next(k for k in (wrong if best[1] else right) if x["gold"][0].replace(right[0], k, 1) == best[2])
        contained = letters(reading) in spoken
        out.append({"word": word, "right": not best[1], "close": w == r or not contained, "reading": reading, "margin": w - r})
    return out


def score(H, known, order):
    # system -> sentence -> word verdicts; and the sentence-level verdict of score.mjs
    W, S = {}, {}
    for system, items in known.items():
        W[system] = {n: word_verdicts(x, items[order.index(n)]["ps"]) for n, x in H.items()}
        S[system] = [it["ok"] for it in items]
    return W, S


def pct(a, b):
    return f"{a}/{b} ({a / b:.1%})"


def table(H, W, S, order):
    head = f"| system | target words right ({sum(len(x['targets']) for x in H.values())}) | sentences, all target words right ({len(H)}) |"
    head += " sentence-level (score.mjs), same sentences | sentence-level, all 70 | " + " | ".join(f"words: {v}" for v in CATS.values()) + " |"
    rows = [head, "|---" * (5 + len(CATS)) + "|"]
    for system, per in W.items():
        words = [v for n in H for v in per[n]]
        sent = sum(all(v["right"] for v in per[n]) for n in H)
        old = sum(S[system][order.index(n)] for n in H)
        cats = []
        for k in CATS:
            ws = [v for n in H if H[n]["category"] == k for v in per[n]]
            cats.append(pct(sum(v["right"] for v in ws), len(ws)))
        cells = [pct(sum(v["right"] for v in words), len(words)), pct(sent, len(H)), pct(old, len(H)), pct(sum(S[system]), len(S[system]))]
        rows.append(f"| {system} | " + " | ".join(cells + cats) + " |")
    return "\n".join(rows)


def details(H, W, S, order):
    # every word read wrong, every close call, and every sentence where the two scorings disagree
    rows = ["| sentence | text | system | word | verdict | reading found | margin | close call | sentence-level |", "|---" * 9 + "|"]
    for n, x in H.items():
        for system, per in W.items():
            ok = S[system][order.index(n)]
            for v in per[n]:
                if not v["right"] or v["close"] or ok != all(u["right"] for u in per[n]):
                    verdict = "right" if v["right"] else "misread"
                    cells = [
                        n,
                        x["text"],
                        system,
                        v["word"],
                        verdict,
                        v["reading"] or "-",
                        str(v["margin"]),
                        "yes" if v["close"] else "",
                        "right" if ok else "wrong",
                    ]
                    rows.append("| " + " | ".join(cells) + " |")
    return "\n".join(rows)


def main():
    H = tts.hard_set()
    known = json.loads((HERE / "results/items.json").read_text())["hard"]
    order = [line.split("\t")[0] for line in (HERE.parent / "data/hard_set.tsv").read_text().splitlines() if line and not line.startswith("#")]
    W, S = score(H, known, order)
    text = "Target words of eval/tts_readings/targets.tsv, read from the phoneme string Kokoro is given\n\n" + table(H, W, S, order)
    text += "\n\nWords read wrong, close calls (best right and best misread equally far, or the reading not found as such), "
    text += "and words in sentences where the target-word and the sentence-level verdicts differ:\n\n" + details(H, W, S, order) + "\n"
    (HERE / "results/targets.md").write_text(text)
    print(text)


if __name__ == "__main__":
    main()
