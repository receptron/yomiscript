"""English text -> YomiScript (IPA, stress, syllables, boundaries) using misaki, Kokoro's English G2P.

misaki writes Kokoro's phoneme notation (stress mark before the vowel, single letters for diphthongs: A = eɪ,
I = aɪ, W = aʊ, Y = ɔɪ, O = oʊ, Q = əʊ; ʧ ʤ; T for the American flap ɾ). This converts it to YomiScript IPA: diphthongs and affricates
spelled out, syllables split with '.', stress marks at the start of the syllable, ',' ';' ':' '—' -> ' ‖ ',
sentence end -> ↘ / ↗. No pitch values: those come from the Kokoro predictor (predict.mjs).
usage: python g2p.py [--gb] "text" ...   -> one JSON object per line: {"text", "ys", "kokoro"}
"""
import json, sys

LIG = {"A": "eɪ", "I": "aɪ", "W": "aʊ", "Y": "ɔɪ", "O": "oʊ", "Q": "əʊ", "ʧ": "tʃ", "ʤ": "dʒ", "T": "ɾ"}  # T = American flap
DIPH = ("eɪ", "aɪ", "aʊ", "ɔɪ", "oʊ", "əʊ")
VOWELS = set("aeiouæɑɒɔəɛɜɪʊʌᵊɐᵻɚɝ")
AFFR = ("tʃ", "dʒ")
ONSETS = {
    "pl", "pɹ", "bl", "bɹ", "tɹ", "dɹ", "kl", "kɹ", "ɡl", "ɡɹ", "fl", "fɹ", "θɹ", "ʃɹ", "sp", "st", "sk", "sm",
    "sn", "sl", "sw", "tw", "dw", "kw", "ɡw", "θw", "spl", "spɹ", "stɹ", "skɹ", "skw",
    "pj", "bj", "kj", "ɡj", "mj", "fj", "vj", "hj", "nj", "lj",
}
PAUSE = {",", ";", ":", "—", "–", "…"}


def segments(p):
    """phonemes (YomiScript IPA) -> [(kind, text, stressed)] with kind V (nucleus) or C; stress attaches to the nucleus"""
    out, i, stress = [], 0, ""
    while i < len(p):
        c = p[i]
        if c in "ˈˌ":
            stress = c; i += 1; continue
        two = p[i:i + 2]
        if two in DIPH:
            v, i = two, i + 2
        elif c in VOWELS:
            v, i = c, i + 1
        else:
            s = two if two in AFFR else c
            out.append(("C", s, "")); i += len(s); continue
        while i < len(p) and p[i] in "ː̃":  # length, nasalization
            v += p[i]; i += 1
        out.append(("V", v, stress)); stress = ""
    return out


def syllabify(p):
    seg = segments(p)
    nuc = [k for k, s in enumerate(seg) if s[0] == "V"]
    if not nuc:
        return p
    cuts = []  # index in seg where each syllable after the first starts
    for a, b in zip(nuc, nuc[1:]):
        cl = [seg[k][1] for k in range(a + 1, b)]
        n = 0  # how many consonants of the cluster go to the next syllable (maximal legal onset)
        for m in range(len(cl), 0, -1):
            on = "".join(cl[len(cl) - m:])
            if m == 1 and cl[-1] != "ŋ" or on in ONSETS:
                n = m; break
        cuts.append(b - n)
    syl, start = [], 0
    for c in cuts + [len(seg)]:
        part = seg[start:c]
        st = next((s[2] for s in part if s[0] == "V"), "")
        syl.append(st + "".join(s[1] for s in part)); start = c
    return ".".join(syl)


def to_ipa(ph):
    for a, b in LIG.items():
        ph = ph.replace(a, b)
    return ph


def g2p_line(g, text, lang):
    _, tokens = g(text)
    words, end = [], "↘"
    for t in tokens:
        if t.phonemes is None:
            raise ValueError(f"misaki has no pronunciation for {t.text!r}")
        if t.text in PAUSE or t.phonemes in PAUSE:
            if words and words[-1] != "‖":
                words.append("‖")
        elif t.text in (".", "!", "?"):
            end = "↗" if t.text == "?" else "↘"
        elif t.phonemes.strip() and any(ch.isalpha() for ch in t.phonemes):
            words.append(syllabify(to_ipa(t.phonemes)))
    while words and words[-1] == "‖":
        words.pop()
    return f"{lang} /{' '.join(words)} {end}/"


if __name__ == "__main__":
    from misaki import en
    args = [a for a in sys.argv[1:] if a != "--gb"]
    gb = "--gb" in sys.argv
    g = en.G2P(trf=False, british=gb, fallback=None)
    for text in args or [l.strip() for l in sys.stdin if l.strip()]:
        _, tokens = g(text)
        kokoro = "".join(t.phonemes + t.whitespace for t in tokens if t.phonemes is not None)
        print(json.dumps({"text": text, "ys": g2p_line(g, text, "en-GB" if gb else "en-US"), "kokoro": kokoro}, ensure_ascii=False))
