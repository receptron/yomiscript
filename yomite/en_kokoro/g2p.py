"""English text -> YomiScript, using the original Kokoro front end unchanged.

kokoro.KPipeline with model=False runs exactly what the original pipeline runs before the model: misaki G2P with the
espeak-ng fallback for unknown words, line splitting and chunking at 510 phonemes. For each chunk it yields the phoneme
string `ps` that the original feeds to the model. This script rewrites that string, character for character, as
YomiScript, so the Katarite can rebuild exactly the same string:
  - phoneme runs: Kokoro notation -> YomiScript IPA (A = eɪ, I = aɪ, W = aʊ, Y = ɔɪ, O = oʊ, Q = əʊ, ʧ = tʃ, ʤ = dʒ,
    T = ɾ), split into syllables with '.', stress marks at the start of the syllable
  - ', ' -> ' ‖ ';  a sentence end inside the chunk ('. ' / '? ') -> ' ↘ ' / ' ↗ ';  the final '.' / '?' -> '↘/' / '↗/'
  - any other punctuation the model sees (! ; : — … " “ ” ( ) etc.) -> <p:…>, kept where it was (attached or spaced)
usage: python g2p.py [--gb] "text" ...   -> one JSON object per chunk: {"index" (of the text), "text", "ys", "kokoro"}
espeak-ng: loaded from Homebrew if the espeakng-loader wheel cannot find its data (see eval/kokoro_parity/ref_kokoro.py);
set ESPEAK_LIB / ESPEAK_DATA to override.
"""
import json, os, sys, warnings
warnings.filterwarnings("ignore")

LIG = {"A": "eɪ", "I": "aɪ", "W": "aʊ", "Y": "ɔɪ", "O": "oʊ", "Q": "əʊ", "ʧ": "tʃ", "ʤ": "dʒ", "T": "ɾ"}
DIPH = ("eɪ", "aɪ", "aʊ", "ɔɪ", "oʊ", "əʊ")
VOWELS = set("aeiouæɑɒɔəɛɜɪʊʌᵊɐᵻɚɝ")
AFFR = ("tʃ", "dʒ")
ONSETS = {
    "pl", "pɹ", "bl", "bɹ", "tɹ", "dɹ", "kl", "kɹ", "ɡl", "ɡɹ", "fl", "fɹ", "θɹ", "ʃɹ", "sp", "st", "sk", "sm",
    "sn", "sl", "sw", "tw", "dw", "kw", "ɡw", "θw", "spl", "spɹ", "stɹ", "skɹ", "skw",
    "pj", "bj", "kj", "ɡj", "mj", "fj", "vj", "hj", "nj", "lj",
}
# characters of Kokoro's phoneme strings that are pronunciation (everything else in a ps is punctuation)
PHON = set("abcdefhijklmnopqrstuvwxyzæçðøŋœɐɑɒɔɕəɚɛɜɟɡɣɤɥɨɪɯɰɲɳɴɸɹɻɽɾʁʂʃʈʊʋʌʎʒʔʝʣʤʥʦʧʨʰʲˈˌːβθχᵊᵝᵻAIOQSTWỸ")


def segments(p):
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
        while i < len(p) and p[i] in "ː̃":
            v += p[i]; i += 1
        out.append(("V", v, stress)); stress = ""
    if stress:  # a stress mark with no vowel after it: keep it in place
        out.append(("C", stress, ""))
    return out


def syllabify(p):
    seg = segments(p)
    nuc = [k for k, s in enumerate(seg) if s[0] == "V"]
    if not nuc:
        return "".join(s[2] + s[1] for s in seg)
    cuts = []
    for a, b in zip(nuc, nuc[1:]):
        cl = [seg[k][1] for k in range(a + 1, b)]
        n = 0
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


def word(w):
    """one space-separated piece of a Kokoro ps -> YomiScript (phoneme runs syllabified, punctuation as <p:…>)"""
    out, run, punct = [], "", ""
    def flush():
        nonlocal run, punct
        if run: out.append(syllabify(to_ipa(run))); run = ""
        if punct: out.append(f"<p:{punct}>"); punct = ""
    for ch in w:
        if ch in PHON:
            if punct: flush()
            run += ch
        else:
            if run: flush()
            punct += ch
    flush()
    return "".join(out)


def ps_to_yomiscript(ps, lang):
    """Kokoro phoneme string (as fed to the model) -> one YomiScript utterance that the Katarite turns back into ps"""
    words = ps.split(" ")
    end = "↘"
    last = words[-1]
    if last.endswith("?") and not last.endswith("??"):
        end, words[-1] = "↗", last[:-1]
    elif last.endswith(".") and not last.endswith(".."):
        end, words[-1] = "↘", last[:-1]
    out = []
    for i, w in enumerate(words):
        inner = i < len(words) - 1
        if inner and w.endswith(",") and not w.endswith(",,") and len(w) > 1:
            out += [word(w[:-1]), "‖"]
        elif inner and w.endswith(".") and not w.endswith("..") and len(w) > 1:
            out += [word(w[:-1]), "↘"]
        elif inner and w.endswith("?") and not w.endswith("??") and len(w) > 1:
            out += [word(w[:-1]), "↗"]
        else:
            out.append(word(w))
    body = " ".join(x for x in out)
    return f"{lang} /{body} {end}/"


def pipeline(gb=False):
    import espeakng_loader
    lib = os.environ.get("ESPEAK_LIB", "/opt/homebrew/lib/libespeak-ng.dylib")
    if os.path.exists(lib):  # the espeakng-loader wheel ignores its data path on macOS here; same espeak-ng 1.52.0
        espeakng_loader.get_library_path = lambda: lib
        espeakng_loader.get_data_path = lambda: os.environ.get("ESPEAK_DATA", "/opt/homebrew/share/espeak-ng-data")
    from kokoro import KPipeline
    return KPipeline(lang_code="b" if gb else "a", repo_id="hexgrad/Kokoro-82M", model=False)


if __name__ == "__main__":
    gb = "--gb" in sys.argv
    texts = [a for a in sys.argv[1:] if a != "--gb"] or [l.rstrip("\n") for l in sys.stdin if l.strip()]
    pipe = pipeline(gb)
    lang = "en-GB" if gb else "en-US"
    for i, text in enumerate(texts):
        for r in pipe(text):
            print(json.dumps({"index": i, "text": r.graphemes, "ys": ps_to_yomiscript(r.phonemes, lang), "kokoro": r.phonemes}, ensure_ascii=False))
