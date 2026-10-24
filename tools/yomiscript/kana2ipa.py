#!/usr/bin/env python3
"""YomiScript 参照変換器: Yomi/JSUT式カナ韻律ラベル -> YomiScript(IPA形)。

入力記号: ^ 文頭, $ 文末(平叙), ? 文末(疑問), [ 上昇, ] 下降(アクセント核の直後),
          # アクセント句境界, _ ポーズ(呼気段落境界)
出力記号: ꜛ 上昇, ꜜ アクセント核, | アクセント句境界, ‖ 呼気段落境界/ポーズ,
          文末 ↘(平叙) / ↗(疑問)。文頭は記号なし。
使い方: python kana2ipa.py '^キョ]ーワ#ヨ]イ#テ[ンキデス$' [--devoice] [--mora]
"""
import sys

V = {"ア": "a", "イ": "i", "ウ": "ɯ", "エ": "e", "オ": "o"}
_rows = {
    "カキクケコ": ["ka", "ki", "kɯ", "ke", "ko"], "ガギグゲゴ": ["ɡa", "ɡi", "ɡɯ", "ɡe", "ɡo"],
    "サシスセソ": ["sa", "ɕi", "sɯ", "se", "so"], "ザジズゼゾ": ["dza", "dʑi", "dzɯ", "dze", "dzo"],
    "タチツテト": ["ta", "tɕi", "tsɯ", "te", "to"], "ダヂヅデド": ["da", "dʑi", "dzɯ", "de", "do"],
    "ナニヌネノ": ["na", "ɲi", "nɯ", "ne", "no"], "ハヒフヘホ": ["ha", "çi", "ɸɯ", "he", "ho"],
    "バビブベボ": ["ba", "bi", "bɯ", "be", "bo"], "パピプペポ": ["pa", "pi", "pɯ", "pe", "po"],
    "マミムメモ": ["ma", "mi", "mɯ", "me", "mo"], "ラリルレロ": ["ɾa", "ɾi", "ɾɯ", "ɾe", "ɾo"],
}
MORA = dict(V)
for k, vs in _rows.items():
    MORA.update(zip(k, vs))
MORA.update({"ヤ": "ja", "ユ": "jɯ", "ヨ": "jo", "ワ": "wa", "ヲ": "o", "ヴ": "vɯ",
             "ァ": "a", "ィ": "i", "ゥ": "ɯ", "ェ": "e", "ォ": "o"})
# 拗音・外来音 (2文字)
_yo = {"キ": "k", "ギ": "ɡ", "シ": "ɕ", "ジ": "dʑ", "チ": "tɕ", "ヂ": "dʑ", "ニ": "ɲ",
       "ヒ": "ç", "ビ": "b", "ピ": "p", "ミ": "m", "リ": "ɾ"}
_pal = {"キ", "ギ", "ビ", "ピ", "ミ", "リ"}
for c, onset in _yo.items():
    j = "ʲ" if c in _pal else ""
    for s, v in (("ャ", "a"), ("ュ", "ɯ"), ("ョ", "o"), ("ェ", "e")):
        MORA[c + s] = onset + j + v
MORA.update({"ティ": "ti", "ディ": "di", "トゥ": "tɯ", "ドゥ": "dɯ", "ファ": "ɸa", "フィ": "ɸi",
             "フェ": "ɸe", "フォ": "ɸo", "ウィ": "wi", "ウェ": "we", "ウォ": "wo", "ツァ": "tsa",
             "ツィ": "tsi", "ツェ": "tse", "ツォ": "tso", "ヴァ": "va", "ヴィ": "vi", "ヴェ": "ve",
             "ヴォ": "vo", "スィ": "si", "ズィ": "dzi", "テュ": "tʲɯ", "デュ": "dʲɯ", "フュ": "ɸʲɯ"})
VOICELESS = set("kstɕçɸphʔ")
PROSODY = {"[": "ꜛ", "]": "ꜜ", "#": " | ", "_": " ‖ ", "$": " ↘", "?": " ↗", "^": ""}
VOWELS = "aiɯeo"


def tokenize(s):
    """カナラベル -> [(kind, value)]  kind: mora / Q / N / R(長音) / P(韻律)"""
    s = s.translate(str.maketrans({chr(c): chr(c + 0x60) for c in range(0x3041, 0x3097)}))
    out, i = [], 0
    while i < len(s):
        two, c = s[i:i + 2], s[i]
        if two in MORA and len(two) == 2:
            out.append(("mora", MORA[two])); i += 2; continue
        if c in PROSODY: out.append(("P", c))
        elif c == "ッ": out.append(("Q", c))
        elif c == "ン": out.append(("N", c))
        elif c == "ー": out.append(("R", c))
        elif c in MORA: out.append(("mora", MORA[c]))
        elif c in "、。，．,. ": out.append(("P", "_"))
        else: raise ValueError(f"unknown symbol {c!r} in {s!r}")
        i += 1
    return out


def _next_seg(toks, i):
    for k, v in toks[i + 1:]:
        if k == "mora": return v
        if k == "N": return "N"
        if k == "P" and v in "#[]": continue
        return None
    return None


def _n_allophone(nxt):
    if nxt is None or nxt == "N": return "ɴ"
    if nxt[0] in "pbm": return "m"
    if nxt.startswith(("tɕ", "dʑ", "ɲ")): return "ɲ"
    if nxt[0] in "tdnɾ" or nxt.startswith("dz"): return "n"
    if nxt[0] in "kɡ": return "ŋ"
    return "ɴ"  # 母音・半母音・s/h/ɸ の前 (実際は鼻母音)


def convert(label, devoice=False, mora_sep=False):
    toks = tokenize(label)
    segs = []  # (ipa, is_mora)
    last_v = None
    for i, (k, v) in enumerate(toks):
        nxt = _next_seg(toks, i)
        if k == "mora":
            ipa = v; last_v = v[-1]
        elif k == "N":
            ipa = _n_allophone(nxt); last_v = None
        elif k == "Q":
            if nxt and nxt != "N" and nxt[0] not in VOWELS + "jw":
                ipa = "t" if nxt.startswith("ts") or nxt.startswith("tɕ") else nxt[0]
            else:
                ipa = "ʔ"
            last_v = None
        elif k == "R":
            ipa = "ː" if last_v else "ː"
        else:
            segs.append((PROSODY[v], False)); continue
        segs.append((ipa, True))
    if devoice:  # 無声子音に挟まれた i/ɯ、文末「ス」の ɯ を無声化 (簡易規則・任意)
        moras = [j for j, (_, m) in enumerate(segs) if m]
        for n, j in enumerate(moras):
            s = segs[j][0]
            if len(s) >= 2 and s[-1] in "iɯ" and s[-2] in VOICELESS | {"ɕ"}:
                nxt = segs[moras[n + 1]][0] if n + 1 < len(moras) else None
                end = nxt is None and s in ("sɯ",)
                if end or (nxt and nxt[0] in VOICELESS and nxt != "ː"):
                    segs[j] = (s + "\u0325", True)
    sep = "." if mora_sep else ""
    out = ""
    prev_mora = False
    for ipa, is_m in segs:
        if is_m and prev_mora and ipa != "ː":
            out += sep
        out += ipa
        prev_mora = is_m
    return "/" + " ".join(out.split()).strip() + "/"


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    for a in args or [l.strip() for l in sys.stdin if l.strip()]:
        print(convert(a, devoice="--devoice" in sys.argv, mora_sep="--mora" in sys.argv))
