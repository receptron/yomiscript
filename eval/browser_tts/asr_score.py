"""Intelligibility from the Whisper transcripts (results/asr.json): results/asr_summary.md.

Japanese: the transcript is read with pyopenjtalk and compared, in katakana, with what the system was meant to say
(kana error rate). English: word error rate against the text. Whisper and pyopenjtalk make their own mistakes,
the same for every system, so the numbers compare systems; they are not absolute error rates.

  katarite   Kokoro vs the text engines (Supertonic, Audio8) given the same LLM YomiScript; the reference is that YomiScript's reading (its text with
             kana for every word with kanji, read with pyopenjtalk like the transcripts)
  hard       every system on the hard set; the reference is the gold reading
  en         every system on the English texts; the reference is the text

usage: python asr_score.py     (python with pyopenjtalk)
"""

import json
import re
import subprocess
from pathlib import Path

import pyopenjtalk

HERE = Path(__file__).parent
RENDER = HERE / "render_text.mjs"
ROWS = {  # katakana by the vowel they end in, for ー
    "ア": "アカサタナハマヤラワガザダバパァャ",
    "イ": "イキシチニヒミリギジヂビピィ",
    "ウ": "ウクスツヌフムユルグズヅブプゥュヴ",
    "エ": "エケセテネヘメレゲゼデベペェ",
    "オ": "オコソトノホモヨロヲゴゾドボポォョ",
}
VOWEL_OF = {c: v for v, row in ROWS.items() for c in row}


def katakana(s):
    return "".join(chr(ord(c) + 0x60) if "ぁ" <= c <= "ゖ" else c for c in s)


def norm(k):
    # pronunciation-equivalent spellings: ー, エイ / エー, オウ / オー, ヲ, ヂ, ヅ; no punctuation or spaces
    k = re.sub(r"[^ァ-ー]", "", katakana(k)).replace("ヲ", "オ").replace("ヂ", "ジ").replace("ヅ", "ズ")
    out = ""
    for c in k:
        out += VOWEL_OF.get(out[-1], "ー") if c == "ー" and out else c
    return out.replace("エイ", "エエ").replace("オウ", "オオ")


def heard(text):
    return norm(pyopenjtalk.g2p(text, kana=True))


def lev(a, b):
    p = list(range(len(b) + 1))
    for i in range(1, len(a) + 1):
        c = [i]
        for j in range(1, len(b) + 1):
            c.append(min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] != b[j - 1])))
        p = c
    return p[len(b)]


def rate(pairs):
    pairs = [(g, w) for g, w in pairs if w]
    return 100 * sum(lev(g, w) for g, w in pairs) / max(1, sum(len(w) for _, w in pairs)), len(pairs)


def words(s):
    return re.sub(r"[^a-z0-9' ]", " ", s.lower()).split()


def main():
    sets = json.loads(
        subprocess.run(
            ["node", "-e", 'import("./sets.mjs").then(m=>console.log(JSON.stringify(m.SETS)))'], cwd=HERE, capture_output=True, text=True, check=True
        ).stdout
    )
    asr = json.loads((HERE / "results/asr.json").read_text())
    got = lambda sys, set_, name: asr.get(f"audio/{sys}/{set_}.{name}.wav")  # noqa: E731
    md = ["# Intelligibility (Whisper large-v3-turbo transcripts)", "", __doc__.split("usage:")[0].strip(), ""]
    md += [
        "## Katarite: Kokoro vs the text engines, same YomiScript (kana error rate vs that YomiScript)",
        "",
        "| Yomite | Katarite | ja parity | hard set |",
        "|---|---|---|---|",
    ]
    for llm in ("codex", "claude"):
        out = {s: json.loads((HERE / f"results/{llm}.{s}.json").read_text())["output"] for s in ("ja", "hard")}
        ref = {}
        for s in ("ja", "hard"):
            names = [x["name"] for x in sets[s] if out[s].get(x["name"])]
            kana = json.loads(
                subprocess.run(["node", str(RENDER), "kanji"], input=json.dumps([out[s][n] for n in names]), capture_output=True, text=True, check=True).stdout
            )
            ref[s] = {n: heard(k["text"]) for n, k in zip(names, kana, strict=True) if "text" in k}
        pair = [
            ("Kokoro", llm),
            ("Supertonic 3, kana for ambiguous words", f"supertonic_ys_{llm}_ambiguous"),
            ("Audio8 0.1B, kana for ambiguous words", f"audio8_ys_{llm}_ambiguous"),
        ]
        pair = [(kat, x) for kat, x in pair if (HERE / "audio" / x).is_dir()]
        for kat, sysname in pair:
            cells = []
            for s in ("ja", "hard"):
                both = [n for n in ref[s] if all(got(x, s, n) is not None for _, x in pair)]  # texts both Katarites spoke
                r, n = rate([(heard(got(sysname, s, name)), ref[s][name]) for name in both])
                cells.append(f"{r:.1f}% ({n})")
            md.append(f"| {llm} | {kat} | {' | '.join(cells)} |")
    md += ["", "## Hard set: every system vs the gold reading (kana error rate)", "", "| system | all | homographs |", "|---|---|---|"]
    systems = [
        "codex",
        "claude",
        "supertonic_ys_codex_ambiguous",
        "supertonic_ys_claude_ambiguous",
        "kokoro",
        "supertonic",
        "supertonic_hints",
        "system",
        "audio8_ys_codex_ambiguous",
        "audio8_ys_claude_ambiguous",
        "audio8_ys_claude_kanji",
        "audio8",
    ]
    for sysname in [x for x in systems if (HERE / "audio" / x).is_dir()]:
        cells = []
        for only in (None, "homograph"):
            items = [x for x in sets["hard"] if only in (None, x["category"]) and got(sysname, "hard", x["name"]) is not None]
            r, n = rate([(heard(got(sysname, "hard", x["name"])), norm(x["gold"][0])) for x in items])
            cells.append(f"{r:.1f}% ({n})")
        md.append(f"| {sysname} | {' | '.join(cells)} |")
    md += ["", "## English: word error rate vs the text", "", "| system | WER |", "|---|---|"]
    for sysname in ("codex", "claude", "supertonic_ys_codex_ambiguous", "supertonic_ys_claude_ambiguous", "kokoro", "supertonic", "system"):
        pairs = [(words(got(sysname, "en", x["name"]) or ""), words(x["text"])) for x in sets["en"] if got(sysname, "en", x["name"]) is not None]
        e = sum(lev(g, w) for g, w in pairs) / max(1, sum(len(w) for _, w in pairs))
        md.append(f"| {sysname} | {100 * e:.1f}% ({len(pairs)}) |")
    (HERE / "results/asr_summary.md").write_text("\n".join(md) + "\n")
    print("\n".join(md))


if __name__ == "__main__":
    main()
