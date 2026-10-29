"""Japanese text -> YomiScript, using the original Kokoro front end unchanged.

kokoro.KPipeline(lang_code='j', model=False) runs exactly what the original pipeline runs before the model: misaki's
Cutlet G2P (fugashi + UniDic), line splitting, chunking at 400 characters and truncation at 510 phonemes. For each chunk
it yields the phoneme string `ps` that the original feeds to the model. This script rewrites that string as YomiScript
so that the Katarite (demo/ys_web/web/ys.js) rebuilds exactly the same string:
  - morae: Kokoro notation -> YomiScript IPA (spec §4): ʨ = tɕ, ʥ = dʑ, ʦ = ts, ʣ = dz, β = w, ᵝ = ʷ, ɨ = ɯ (zɨ = dzɯ),
    kʲi = ki (likewise ɡ b p m ɾ v ɸ t d ts); a glottal stop before a consonant is written as a doubled consonant
    (moʔte -> motte; before tɕ / ts: t), otherwise ʔ
  - words stay separated by spaces (the Katarite passes them to Kokoro as spaces)
  - '?' -> ↗ (sentence end, inside the utterance or final); other punctuation the model sees (! : ; … « » etc.) -> <p:…>;
    text the front end left as it is (Latin letters, a phoneme cut off at 510) -> <p:…>
  - the original drops 。 and 、 (UniDic tags them as known words, Cutlet then maps their reading '*' to nothing).
    Where they were, this Yomite writes ↘ and ‖, found by running the same G2P on the pieces of the text between them
    (only if the pieces give exactly the same phonemes). The Katarite renders them as Kokoro's Japanese front end
    does: as nothing but the word space. Japanese ↘ at the end is likewise nothing; ↗ is '?'.
usage: python g2p.py "text" ...   -> one JSON object per chunk: {"index" (of the text), "text", "ys", "kokoro"}
"""
import json, re, sys, warnings
warnings.filterwarnings("ignore")

VOWELS = "aiɯeoɨ"
NASALS = "mnɲŋɴ"
CONS = "kɡsɕzʣʥtdʨʦnɲhçɸbpmjɾβvʔŋɴ"
PALATAL_I = "kɡbpmɾvɸtdʦ"            # Kokoro writes these with ʲ before i; YomiScript does not (spec §4.1)
PUNCT = set('!"(),.:;?—“”…«»[]')    # what Cutlet passes through as punctuation
ONSET = CONS.replace("ʔ", "").replace("ɴ", "")
MORA = re.compile(r"(?:[%s][ʲᵝ]?)?[%s]|ː|ʔ|ɴ|[mnɲŋ](?![%sː])" % (ONSET, VOWELS, VOWELS))


def morae(run):
    """split a Kokoro phoneme run into morae, or None if it is not Japanese phonemes (Latin text, a cut-off tail)"""
    out, i = [], 0
    while i < len(run):
        m = MORA.match(run, i)
        if not m or m.end() == i:
            return None
        out.append(m.group()); i = m.end()
    return out


def to_ipa(run):
    """Kokoro Japanese phonemes -> YomiScript IPA (the inverse of jaKokoro in ys.js)"""
    M = morae(run)
    if M is None:
        return None
    out = []
    for k, m in enumerate(M):
        if m == "ʔ":
            n = M[k + 1] if k + 1 < len(M) else ""
            c = n[:1]
            if c and c not in VOWELS + NASALS + "jβːʔ":       # geminate: double the next consonant
                out.append({"ʨ": "t", "ʦ": "t", "ʥ": "d", "ʣ": "d"}.get(c, c)); continue
            out.append("ʔ"); continue
        if m == "zɨ":
            out.append("dzɯ"); continue
        if len(m) >= 3 and m[1] == "ʲ" and m[2] == "i" and m[0] in PALATAL_I:
            m = m[0] + m[2:]
        for a, b in (("ʨ", "tɕ"), ("ʥ", "dʑ"), ("ʦ", "ts"), ("ʣ", "dz"), ("β", "w"), ("ᵝ", "ʷ"), ("ɨ", "ɯ")):
            m = m.replace(a, b)
        out.append(m)
    return "".join(out)


def word(w):
    """one space-separated piece of a Kokoro ps -> YomiScript (morae as IPA, everything else as <p:…>)"""
    out = []
    P = re.escape("".join(sorted(PUNCT)))
    for run in re.findall(f"[{P}]+|[^{P}]+", w):
        if run[0] in PUNCT:
            out.append(f"<p:{run}>")
        else:
            ipa = to_ipa(run)
            out.append(ipa if ipa is not None else f"<p:{run}>")
    return "".join(out)


def ps_to_yomiscript(ps, marks=None):
    """Kokoro ps -> one YomiScript utterance. marks: {word index: '‖' | '↘'} after which 、 / 。 stood in the text"""
    marks = marks or {}
    words = ps.split(" ")
    end = "↘"
    if words[-1].endswith("?") and len(words[-1]) > 1 and not words[-1].endswith("??"):
        end, words[-1] = "↗", words[-1][:-1]
    out = []
    for i, w in enumerate(words):
        if i < len(words) - 1 and w.endswith("?") and len(w) > 1 and not w.endswith("??"):
            out += [word(w[:-1]), "↗"]
        else:
            out.append(word(w))
            if i in marks and i < len(words) - 1:
                out.append(marks[i])
    return f"ja /{' '.join(out)} {end}/"


def find_marks(g2p, text, ps):
    """word indices of ps after which 、 / 。 stood: G2P on the pieces between them must give exactly ps"""
    pieces = [p for p in re.split(r"(?<=[、。，．])", text) if p]
    if len(pieces) < 2:
        return {}
    marks, words = {}, []
    for p in pieces:
        q = g2p(p)[0]
        if q:
            words += q.split(" ")
            if p[-1] in "、，。．":
                marks[len(words) - 1] = "‖" if p[-1] in "、，" else "↘"
    full = " ".join(words)
    if full == ps:
        return marks
    if len(ps) == 510 and full[:510] == ps:                    # the original cut ps at 510: keep the marks before the cut
        n = len(ps.split(" ")) - 1
        return {i: m for i, m in marks.items() if i < n}
    return {}


def pipeline():
    from kokoro import KPipeline
    return KPipeline(lang_code="j", repo_id="hexgrad/Kokoro-82M", model=False)


if __name__ == "__main__":
    texts = sys.argv[1:] or [l.rstrip("\n") for l in sys.stdin if l.strip()]
    pipe = pipeline()
    for i, text in enumerate(texts):
        for r in pipe(text):
            ys = ps_to_yomiscript(r.phonemes, find_marks(pipe.g2p, r.graphemes, r.phonemes))
            print(json.dumps({"index": i, "text": r.graphemes, "ys": ys, "kokoro": r.phonemes}, ensure_ascii=False))
