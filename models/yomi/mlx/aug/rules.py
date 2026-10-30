"""Rule-based example sentences for numbers, dates, counter words (助数詞) and abbreviations (written by yomiscript, CC BY 4.0).

Each example is (text, pron_text): text is the training input (digits and Latin letters as they are), pron_text is the sentence with those parts
replaced by their katakana reading. prepare_data.py runs pron_text through pyopenjtalk to add accents and phrase boundaries,
and keeps only the examples whose kana match the rule reading.
The spelling conventions are those of eval/data/hard_set.tsv (pronounced kana, long vowels as 「ー」, は→ワ).
No sentence is copied from the hard set. Abbreviations that appear in the hard set are not used, to avoid contaminating the evaluation.
"""

import random

ONES = ["", "イチ", "ニ", "サン", "ヨン", "ゴ", "ロク", "ナナ", "ハチ", "キュー"]
HUND = {1: "ヒャク", 3: "サンビャク", 6: "ロッピャク", 8: "ハッピャク"}
THOU = {1: "セン", 3: "サンゼン", 8: "ハッセン"}


def under10k(n):
    """Reading of 0<n<10000. Returns (reading, kind of ending). Ending: a digit 1..9 / 'J' 十 / 'H' 百 / 'S' 千"""
    s, last = "", None
    th, h, t, o = n // 1000, n // 100 % 10, n // 10 % 10, n % 10
    if th:
        s += THOU.get(th, ONES[th] + "セン")
        last = "S"
    if h:
        s += HUND.get(h, ONES[h] + "ヒャク")
        last = "H"
    if t:
        s += ("" if t == 1 else ONES[t]) + "ジュー"
        last = "J"
    if o:
        s += ONES[o]
        last = o
    return s, last


def num(n):
    """1 <= n < 10^8"""
    man, rest = divmod(n, 10000)
    s, last = "", None
    if man:
        s, _ = under10k(man)
        s += "マン"
        last = "M"
    if rest:
        r, last = under10k(rest)
        s += r
    return s, last


def _sokuon(base, last):
    """Replace the ending, for readings that take a geminate (促音) with 1, 6, 8, 10 and 100"""
    if last == 1:
        return base[:-2] + "イッ"
    if last == 6:
        return base[:-2] + "ロッ"
    if last == 8:
        return base[:-2] + "ハッ"
    if last == "J":
        return base[:-3] + "ジュッ"
    if last == "H" and base.endswith("ヒャク"):
        return base[:-1] + "ッ"
    return None


def _k_counter(b, last, c):
    """個 回 冊 件 階 歳: counter words starting in the k- and s-rows"""
    k = {"個": "コ", "回": "カイ", "冊": "サツ", "件": "ケン", "階": "カイ", "歳": "サイ"}[c]
    so = _sokuon(b, last)
    if c == "冊" or c == "歳":  # the s-row takes a geminate only with 1, 8 and 10
        if so and last in (1, 8, "J"):
            return so + k
        return b + k
    if c == "階" and last == 3:
        return b + "ガイ"
    if so and last in (1, 6, 8, "J", "H"):
        return so + k
    return b + k


def counter(n, c):
    b, last = num(n)
    if c in ("本", "匹", "杯"):
        h, p, bb = {"本": ("ホン", "ポン", "ボン"), "匹": ("ヒキ", "ピキ", "ビキ"), "杯": ("ハイ", "パイ", "バイ")}[c]
        so = _sokuon(b, last)
        if so and last in (1, 6, 8, "J", "H"):
            return so + p
        if last == 3 or (last == "S" and b.endswith("ゼン")) or last == "M":
            return b + bb
        return b + h
    if c == "分":
        so = _sokuon(b, last)
        if so and last in (1, 6, 8, "J", "H"):
            return so + "プン"
        if last in (3, 4):
            return b + "プン"
        return b + "フン"
    if c in ("個", "回", "冊", "件", "階", "歳"):
        return _k_counter(b, last, c)
    if c == "人":
        if n == 1:
            return "ヒトリ"
        if n == 2:
            return "フタリ"
        if last == 4:
            return b[:-2] + "ヨニン"
        if last == 7:
            return b + "ニン"
        return b + "ニン"
    if c == "円":
        if last == 4:
            return b[:-2] + "ヨエン"
        return b + "エン"
    if c == "年":
        if last == 4:
            return b[:-2] + "ヨネン"
        return b + "ネン"
    simple = {"枚": "マイ", "台": "ダイ", "度": "ド", "キロ": "キロ", "メートル": "メートル", "ページ": "ページ"}
    return b + simple[c]


def day(d):
    sp = {
        1: "ツイタチ",
        2: "フツカ",
        3: "ミッカ",
        4: "ヨッカ",
        5: "イツカ",
        6: "ムイカ",
        7: "ナノカ",
        8: "ヨーカ",
        9: "ココノカ",
        10: "トーカ",
        14: "ジューヨッカ",
        20: "ハツカ",
        24: "ニジューヨッカ",
    }
    if d in sp:
        return sp[d]
    b, last = num(d)
    if last == 7:
        return b[:-2] + "シチニチ"
    if last == 9:
        return b[:-3] + "クニチ"
    return b + "ニチ"


def month(m):
    return {4: "シガツ", 7: "シチガツ", 9: "クガツ"}.get(m, num(m)[0] + "ガツ")


def hour(h):
    return {4: "ヨジ", 7: "シチジ", 9: "クジ"}.get(h, num(h)[0] + "ジ")


# Abbreviations (those in the hard set are excluded: SAP SIP NHK AI USB NASA JR GPU API IoT SNS UNESCO)
ACRONYMS = {
    "PC": "ピーシー",
    "CPU": "シーピーユー",
    "DVD": "ディーブイディー",
    "CD": "シーディー",
    "OS": "オーエス",
    "IT": "アイティー",
    "ATM": "エーティーエム",
    "PDF": "ピーディーエフ",
    "URL": "ユーアールエル",
    "SF": "エスエフ",
    "TV": "ティーブイ",
    "BGM": "ビージーエム",
    "LED": "エルイーディー",
    "GPS": "ジーピーエス",
    "EU": "イーユー",
    "WHO": "ダブリューエイチオー",
    "FAX": "ファックス",
    "SSD": "エスエスディー",
    "HTML": "エイチティーエムエル",
    "VR": "ブイアール",
    "DNA": "ディーエヌエー",
    "CM": "シーエム",
    "OB": "オービー",
    "PR": "ピーアール",
    "LAN": "ラン",
    "RAM": "ラム",
    "JAXA": "ジャクサ",
    "NATO": "ナトー",
    "ASEAN": "アセアン",
    "FIFA": "フィファ",
    "IC": "アイシー",
    "SE": "エスイー",
    "QR": "キューアール",
    "ID": "アイディー",
    "OK": "オーケー",
    "NG": "エヌジー",
}
ACR_T = [
    ("{A}について調べている。", ""),
    ("昨日、{A}の話をした。", ""),
    ("資料に{A}と書いてある。", ""),
    ("ここで{A}の説明をする。", ""),
    ("{A}という言葉をよく聞く。", ""),
    ("先生が{A}について話した。", ""),
]

NOUN = {
    "本": ["鉛筆", "傘", "ペン", "木"],
    "匹": ["魚", "犬", "金魚"],
    "杯": ["コーヒー", "ご飯", "水"],
    "個": ["卵", "箱", "石"],
    "回": ["練習", "会議"],
    "冊": ["本", "ノート"],
    "件": ["メール", "相談"],
    "枚": ["紙", "切手", "写真"],
    "台": ["車", "パソコン"],
    "人": ["学生", "客"],
}
T_COUNT = ["{N}の{X}がある。", "{X}を{N}用意した。", "全部で{N}の{X}を数えた。", "{X}が{N}ほど残っている。"]


def gen(seed=0, n_per=1):
    R = random.Random(seed)
    out = []

    def add(text, pron):
        out.append((text, pron))

    nums = list(range(1, 21)) + [30, 40, 50, 60, 70, 80, 90, 100, 300, 600, 800, 1000, 3000, 8000]
    for c, xs in NOUN.items():
        for n in nums:
            for _ in range(n_per):
                x, t = R.choice(xs), R.choice(T_COUNT)
                d = str(n) if R.random() < 0.7 else str(n).translate(str.maketrans("0123456789", "０１２３４５６７８９"))
                add(t.format(N=d + c, X=x), t.format(N=counter(n, c), X=x))
    for c in ["分", "歳", "階", "年", "度", "キロ", "メートル", "ページ"]:
        for n in range(1, 61) if c in ("分", "歳") else nums:
            t = R.choice(["およそ{N}かかった。", "それは{N}だと聞いた。", "ちょうど{N}になった。"])
            add(t.format(N=f"{n}{c}"), t.format(N=counter(n, c)))
    for _ in range(600):  # amounts of money, large numbers
        n = R.choice([R.randint(1, 99) * 10 ** R.randint(0, 5), R.randint(1, 99999999)])
        t = R.choice(["料金は{N}でした。", "合計で{N}かかった。", "{N}を支払った。"])
        d = f"{n:,}" if R.random() < 0.3 and n >= 1000 else str(n)
        add(t.format(N=d + "円"), t.format(N=counter(n, "円")))
    for m in range(1, 13):  # dates
        for d in range(1, 32):
            if d > [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]:
                continue
            t = R.choice(["{D}に引っ越しをする。", "{D}は雨だった。", "締め切りは{D}です。", "{D}から休みに入る。"])
            add(t.format(D=f"{m}月{d}日"), t.format(D=month(m) + day(d)))
    for _ in range(300):
        y, m, d = R.randint(1990, 2035), R.randint(1, 12), R.randint(1, 28)
        t = R.choice(["{D}に設立された。", "{D}の記録を見る。"])
        add(t.format(D=f"{y}年{m}月{d}日"), t.format(D=counter(y, "年") + month(m) + day(d)))
    for h in range(1, 13):  # times of day
        for mi in [0, 5, 10, 15, 20, 30, 45]:
            t = R.choice(["{T}に駅前で会おう。", "朝{T}に起きた。", "{T}から授業が始まる。"])
            tt = f"{h}時" + (f"{mi}分" if mi else "")
            add(t.format(T=tt), t.format(T=hour(h) + (counter(mi, "分") if mi else "")))
    for a, r in ACRONYMS.items():
        for t, _ in R.sample(ACR_T, 3):
            add(t.format(A=a), t.format(A=r))
    return out


if __name__ == "__main__":
    for x in gen()[:5] + gen()[-5:]:
        print(x)
    for n, c in [(3, "本"), (6, "本"), (10, "本"), (100, "本"), (8, "分"), (4, "分"), (14, "人"), (3000, "本"), (1, "冊"), (6, "冊")]:
        print(n, c, counter(n, c))
    print(len(gen()), day(17), day(19), day(29), num(12000), num(1500))
