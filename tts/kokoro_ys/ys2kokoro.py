"""Deterministic YomiScript -> Kokoro phoneme string. Language comes ONLY from ^lang| tag (no tag = ja)."""

import re

VOICE = {"ja": "jf_alpha", "en-US": "af_heart", "en-GB": "bf_emma", "en": "af_heart", "fr": "ff_siwis", "zh": "zf_xiaoxiao"}
KLANG = {"ja": "ja", "en-US": "en-us", "en-GB": "en-gb", "en": "en-us", "fr": "fr-fr", "zh": "cmn"}


def parse(ys):
    m = re.match(r"^\^(?:(en-US|en-GB|en|fr|zh)\|)?(.*)([$?])$", ys)
    return (m.group(1) or "ja"), m.group(2), m.group(3)


def ends(e):
    return "?" if e == "?" else "."


# --- ja: katakana mora -> IPA (Kokoro/misaki ja style); pitch [ ] dropped
V = {"ア": "a", "イ": "i", "ウ": "ɯ", "エ": "e", "オ": "o"}
ROWS = {
    "カ": "k",
    "サ": "s",
    "タ": "t",
    "ナ": "n",
    "ハ": "h",
    "マ": "m",
    "ヤ": "j",
    "ラ": "ɾ",
    "ワ": "w",
    "ガ": "ɡ",
    "ザ": "z",
    "ダ": "d",
    "バ": "b",
    "パ": "p",
}
KANA = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤ_ユ_ヨラリルレロワ___ヲガギグゲゴザジズゼゾダヂヅデドバビブベボパピプペポ"
T = {}
vs = "aiɯeo"
for i, ch in enumerate(KANA):
    if ch == "_":
        continue
    if i < 5:
        T[ch] = vs[i]
        continue
    c = list(ROWS.values())[i // 5 - 1] if i < 55 else None
    row = ["", "k", "s", "t", "n", "h", "m", "j", "ɾ", "w", "ɡ", "z", "d", "b", "p"][i // 5]
    T[ch] = row + vs[i % 5]
T.update({"シ": "ɕi", "チ": "ʨi", "ツ": "ʦɯ", "フ": "ɸɯ", "ヒ": "çi", "ジ": "ʥi", "ヂ": "ʥi", "ヅ": "zɯ", "ヲ": "o", "ニ": "ɲi", "ン": "ɴ", "ヴ": "vɯ"})
SM = {"ャ": "a", "ュ": "ɯ", "ョ": "o"}
SV = {"ァ": "a", "ィ": "i", "ゥ": "ɯ", "ェ": "e", "ォ": "o"}


def ja(body):
    out = []
    s = body.replace("[", "").replace("]", "")
    i = 0
    while i < len(s):
        c = s[i]
        if c == "#":
            out.append(" ")
            i += 1
            continue
        if c == "_":
            out.append(", ")
            i += 1
            continue
        if c == "ー":
            out.append("ː")
            i += 1
            continue
        if c == "ッ":
            out.append("Q")
            i += 1
            continue
        p = T.get(c, "")
        if i + 1 < len(s) and s[i + 1] in SM:
            v = SM[s[i + 1]]
            base = p[:-1]
            if base in ("ɕ", "ʨ", "ʥ", "ɲ", "ç"):
                p = base + v
            else:
                p = base + "j" + v
            i += 1
        elif i + 1 < len(s) and s[i + 1] in SV:
            p = p[:-1] + SV[s[i + 1]]
            i += 1
        out.append(p)
        i += 1
    r = "".join(out)
    r = re.sub(r"Q(ʨ|ʦ)", lambda m: "t" + m.group(1), r)
    r = re.sub(r"Q(.)", lambda m: m.group(1) + m.group(1), r).replace("Q", "")
    return r


# --- en: YomiScript broad IPA -> misaki symbols
def en(body, gb):
    s = body.replace(".", "").replace("#", ",").replace("_", ",")
    rep = [
        ("tʃ", "ʧ"),
        ("dʒ", "ʤ"),
        ("eɪ", "A"),
        ("aɪ", "I"),
        ("aʊ", "W"),
        ("ɔɪ", "Y"),
        ("oʊ", "O"),
        ("əʊ", "Q"),
        ("ɝ", "ɜɹ"),
        ("r", "ɹ"),
        ("ɫ", "l"),
        ("l̩", "ᵊl"),
        ("x", "k"),
    ]
    if not gb:
        rep.append(("ɚ", "əɹ"))
    for a, b in rep:
        s = s.replace(a, b)
    return re.sub(r"\s*,\s*", ", ", s)


# --- fr: IPA kept; syllable dots/liaison ties removed (liaison consonant kept)
def fr(body):
    return re.sub(r"\s*,\s*", ", ", body.replace(".", "").replace("‿", "").replace("#", ",").replace("_", ","))


# --- zh: pinyin+tone -> IPA + Kokoro tone arrows (realised tone after '>')
INI = [
    ("zh", "ʈʂ"),
    ("ch", "ʈʂʰ"),
    ("sh", "ʂ"),
    ("b", "p"),
    ("p", "pʰ"),
    ("m", "m"),
    ("f", "f"),
    ("d", "t"),
    ("t", "tʰ"),
    ("n", "n"),
    ("l", "l"),
    ("g", "k"),
    ("k", "kʰ"),
    ("h", "x"),
    ("j", "ʨ"),
    ("q", "ʨʰ"),
    ("x", "ɕ"),
    ("r", "ɻ"),
    ("z", "ʦ"),
    ("c", "ʦʰ"),
    ("s", "s"),
    ("y", ""),
    ("w", ""),
]
FIN = {
    "a": "a",
    "o": "wo",
    "e": "ɤ",
    "ai": "aI",
    "ei": "eI",
    "ao": "aʊ",
    "ou": "oʊ",
    "an": "an",
    "en": "ən",
    "ang": "aŋ",
    "eng": "əŋ",
    "ong": "ʊŋ",
    "er": "ɚ",
    "i": "i",
    "ia": "ja",
    "ie": "je",
    "iao": "jaʊ",
    "iu": "joʊ",
    "ian": "jɛn",
    "in": "in",
    "iang": "jaŋ",
    "ing": "iŋ",
    "iong": "jʊŋ",
    "u": "u",
    "ua": "wa",
    "uo": "wo",
    "uai": "waI",
    "ui": "weI",
    "uan": "wan",
    "un": "wən",
    "uang": "waŋ",
    "v": "y",
    "ue": "ɥe",
    "ve": "ɥe",
    "uan_j": "ɥɛn",
    "un_j": "yn",
}
TONE = {"1": "→", "2": "↗", "3": "↓", "4": "↘", "5": ""}


def zsyl(syl):
    m = re.match(r"([a-zü]+)(\d)(?:>(\d))?", syl)
    py, t1, t2 = m.groups()
    t = t2 or t1
    ini, ip = "", ""
    for a, b in INI:
        if py.startswith(a):
            ini, ip = a, b
            break
    f = py[len(ini) :]
    if ini == "y":
        f = {"u": "v", "ue": "ve", "uan": "uan_j", "un": "un_j", "i": "i", "in": "in", "ing": "ing"}.get(f, "i" + f if not f.startswith("i") else f)
    if ini == "w":
        f = {"u": "u"}.get(f, "u" + f)
    if ini in ("j", "q", "x") and f.startswith("u"):
        f = {"u": "v", "ue": "ve", "uan": "uan_j", "un": "un_j"}[f]
    if f == "i" and ini in ("z", "c", "s"):
        fi = "ɹ"
    elif f == "i" and ini in ("zh", "ch", "sh", "r"):
        fi = "ɻ"
    else:
        fi = FIN.get(f, f)
    return ip + fi + TONE[t]


def zh(body):
    out = []
    for w in body.split(" "):
        if w in ("#", "_"):
            out.append(",")
            continue
        out.append("".join(zsyl(x) for x in w.split(".")))
    return re.sub(r"\s*,\s*", ", ", " ".join(out))


def convert(ys):
    lang, body, e = parse(ys)
    if lang == "ja":
        p = ja(body)
    elif lang.startswith("en"):
        p = en(body, lang == "en-GB")
    elif lang == "fr":
        p = fr(body)
    else:
        p = zh(body)
    return lang, p + ends(e)
