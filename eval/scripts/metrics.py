"""Evaluation metrics: kana CER, accent nucleus, phrase boundary F1.

Prosody symbols are in the jsut-label e2e_symbol format (^ $ ? _ # [ ]).
"""

import re
from difflib import SequenceMatcher

KATA = re.compile(r"[^\u30A1-\u30FAー]")
PROSODY = set("^$?_#[]")


def norm_kana(s):
    return KATA.sub("", s)


_ROWS = {
    "ア": "アカガサザタダナハバパマヤャラワァ",
    "イ": "イキギシジチヂニヒビピミリィ",
    "ウ": "ウクグスズツヅヌフブプムユュルゥヴ",
    "エ": "エケゲセゼテデネヘベペメレェ",
    "オ": "オコゴソゾトドノホボポモヨョロヲォ",
}
_VOW = {c: v for v, cs in _ROWS.items() for c in cs}


def loose_kana(s):
    """Spelling-variant normalization (for the secondary metric): ー -> the preceding vowel, e-row + イ -> e-row + エ, o-row + ウ -> o-row + オ, ヲ -> オ."""
    out = []
    for c in norm_kana(s):
        prev = _VOW.get(out[-1]) if out else None
        if c == "ー" and prev:
            c = prev
        elif c == "イ" and prev == "エ":
            c = "エ"
        elif c == "ウ" and prev == "オ":
            c = "オ"
        out.append(c)
    return "".join(out).replace("ヲ", "オ")


def edit_distance(a, b):
    prev = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        cur = [i]
        for j, y in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x != y)))
        prev = cur
    return prev[-1]


def split_prosody(tokens):
    """Sequence with symbols -> (phoneme list, {(position, symbol)}). Position = the number of phonemes before the symbol."""
    phones, events = [], set()
    for t in tokens:
        if t in PROSODY:
            if t in "^$?":
                continue
            events.add((len(phones), t))
        else:
            phones.append(t.lower())
    return phones, events


def _boundaries(events):
    return {p for p, s in events if s in "#_"}


def _nuclei(events):
    return {p for p, s in events if s == "]"}


def prosody_compare(gold_tokens, pred_tokens):
    """Align the phonemes and compare the prosody events at the positions mapped through the matching blocks."""
    gp, ge = split_prosody(gold_tokens)
    pp, pe = split_prosody(pred_tokens)
    m = {}
    for i, j, n in SequenceMatcher(None, gp, pp, autojunk=False).get_matching_blocks():
        for k in range(n + 1):
            m.setdefault(j + k, i + k)
    pe_g = {(m[p], s) for p, s in pe if p in m}
    sum(1 for p, s in pe if p not in m)
    gb, pb = _boundaries(ge), _boundaries(pe_g)
    gn, pn = _nuclei(ge), _nuclei(pe_g)
    unm_b = sum(1 for p, s in pe if p not in m and s in "#_")
    unm_n = sum(1 for p, s in pe if p not in m and s == "]")
    res = {
        "bnd_tp": len(gb & pb),
        "bnd_fp": len(pb - gb) + unm_b,
        "bnd_fn": len(gb - pb),
        "nuc_tp": len(gn & pn),
        "nuc_fp": len(pn - gn) + unm_n,
        "nuc_fn": len(gn - pn),
        "ph_err": edit_distance(gp, pp),
        "ph_len": len(gp),
    }
    # Per accent phrase: the share of phrases whose boundaries at both ends and nucleus position (including none) match
    cuts = [0] + sorted(gb) + [len(gp)]
    ok = tot = 0
    for a, b in zip(cuts, cuts[1:], strict=False):
        if a == b:
            continue
        tot += 1
        ends_ok = (a == 0 or a in pb) and (b == len(gp) or b in pb) and not any(a < x < b for x in pb)
        if ends_ok and {x for x in gn if a < x <= b} == {x for x in pn if a < x <= b}:
            ok += 1
    res["ap_ok"], res["ap_tot"] = ok, tot
    return res


def f1(tp, fp, fn):
    p = tp / (tp + fp) if tp + fp else 0.0
    r = tp / (tp + fn) if tp + fn else 0.0
    return p, r, (2 * p * r / (p + r) if p + r else 0.0)
