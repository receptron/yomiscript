"""Mora times in any Japanese speech, by forced alignment (torchaudio's MMS_FA, a CTC model over romanized letters).

Morae are given as OpenJTalk phonemes (`ky`, `o`; `N`; `cl`; a long vowel is its vowel again). Each phoneme is spelt
in the model's letters (`ky` -> k y, `N` -> n, `cl` -> the next consonant's first letter, devoiced `I` `U` -> i u),
the letters are aligned, and a mora runs from its first letter's start to the next mora's first letter's start (the
last one to its last letter's end); `letter_spans` gives each mora's own letters only, so a pause after it is not in it.
"""

import numpy as np
import torch
import torchaudio

_model = {}
SPELL = {"N": "n", "I": "i", "U": "u", "E": "e", "A": "a", "O": "o", "ch": "ch", "ts": "ts", "sh": "sh", "j": "j", "f": "f", "v": "b"}


def model():
    if not _model:
        b = torchaudio.pipelines.MMS_FA
        _model["m"] = b.get_model(with_star=False).eval()
        _model["d"] = b.get_dict(star=None)
        _model["sr"] = b.sample_rate
    return _model["m"], _model["d"], _model["sr"]


def letters(morae):
    # (letter ids, the mora of each letter)
    _, d, _ = model()
    flat = [(i, p) for i, m in enumerate(morae) for p in m]
    ids, owner = [], []
    for k, (i, p) in enumerate(flat):
        if p == "cl":
            nxt = next((q for _, q in flat[k + 1 :] if q not in "aiueoAIUEO"), "t")
            s = SPELL.get(nxt, nxt)[0] if nxt != "cl" else "t"
        else:
            s = SPELL.get(p, p.lower())
        for c in s:
            ids.append(d[c])
            owner.append(i)
    return ids, owner


def letter_spans(y, sr, morae):
    """[(start of its first letter, end of its last letter)] in seconds for each mora, and the mean log-probability of
    the alignment (a confidence)"""
    m, _, msr = model()
    w = torch.tensor(y, dtype=torch.float32)[None]
    if sr != msr:
        w = torchaudio.functional.resample(w, sr, msr)
    with torch.inference_mode():
        em, _ = m(w)
    em = torch.log_softmax(em, dim=-1)
    ids, owner = letters(morae)
    ali, scores = torchaudio.functional.forced_align(em, torch.tensor([ids], dtype=torch.int32), blank=0)
    spans = torchaudio.functional.merge_tokens(ali[0], scores[0].exp())
    sec = w.shape[1] / msr / em.shape[1]
    first, last = {}, {}
    for s, o in zip(spans, owner, strict=False):
        first.setdefault(o, s.start * sec)
        last[o] = s.end * sec
    return [(first[i], last[i]) for i in range(len(morae))], float(np.mean([s.score for s in spans]))


def mora_times(y, sr, morae):
    """[(start, end)] in seconds for each mora, and the mean log-probability of the alignment (a confidence)"""
    sp, score = letter_spans(y, sr, morae)
    n = len(morae)
    return [(sp[i][0], sp[i + 1][0] if i + 1 < n else sp[i][1]) for i in range(n)], score
