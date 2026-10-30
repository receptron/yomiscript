# The HEPBURN table of misaki (github.com/hexgrad/misaki, misaki/cutlet.py; Apache License 2.0), copied unchanged.
# misaki adapted it from cutlet (github.com/polm/cutlet), whose license follows.
#
# MIT License
#
# Copyright (c) 2020 Paul O'Leary McCann
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in all
# copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
# SOFTWARE.
HEPBURN = {
    chr(12353): "a",  # ぁ
    chr(12354): "a",  # あ
    chr(12355): "i",  # ぃ
    chr(12356): "i",  # い
    chr(12357): "ɯ",  # ぅ
    chr(12358): "ɯ",  # う
    chr(12359): "e",  # ぇ
    chr(12360): "e",  # え
    chr(12361): "o",  # ぉ
    chr(12362): "o",  # お
    chr(12363): "ka",  # か
    chr(12364): "ɡa",  # が
    chr(12365): "kʲi",  # き
    chr(12366): "ɡʲi",  # ぎ
    chr(12367): "kɯ",  # く
    chr(12368): "ɡɯ",  # ぐ
    chr(12369): "ke",  # け
    chr(12370): "ɡe",  # げ
    chr(12371): "ko",  # こ
    chr(12372): "ɡo",  # ご
    chr(12373): "sa",  # さ
    chr(12374): "ʣa",  # ざ
    chr(12375): "ɕi",  # し
    chr(12376): "ʥi",  # じ
    chr(12377): "sɨ",  # す
    chr(12378): "zɨ",  # ず
    chr(12379): "se",  # せ
    chr(12380): "ʣe",  # ぜ
    chr(12381): "so",  # そ
    chr(12382): "ʣo",  # ぞ
    chr(12383): "ta",  # た
    chr(12384): "da",  # だ
    chr(12385): "ʨi",  # ち
    chr(12386): "ʥi",  # ぢ
    # chr(12387):'#', #っ
    chr(12388): "ʦɨ",  # つ
    chr(12389): "zɨ",  # づ
    chr(12390): "te",  # て
    chr(12391): "de",  # で
    chr(12392): "to",  # と
    chr(12393): "do",  # ど
    chr(12394): "na",  # な
    chr(12395): "ɲi",  # に
    chr(12396): "nɯ",  # ぬ
    chr(12397): "ne",  # ね
    chr(12398): "no",  # の
    chr(12399): "ha",  # は
    chr(12400): "ba",  # ば
    chr(12401): "pa",  # ぱ
    chr(12402): "çi",  # ひ
    chr(12403): "bʲi",  # び
    chr(12404): "pʲi",  # ぴ
    chr(12405): "ɸɯ",  # ふ
    chr(12406): "bɯ",  # ぶ
    chr(12407): "pɯ",  # ぷ
    chr(12408): "he",  # へ
    chr(12409): "be",  # べ
    chr(12410): "pe",  # ぺ
    chr(12411): "ho",  # ほ
    chr(12412): "bo",  # ぼ
    chr(12413): "po",  # ぽ
    chr(12414): "ma",  # ま
    chr(12415): "mʲi",  # み
    chr(12416): "mɯ",  # む
    chr(12417): "me",  # め
    chr(12418): "mo",  # も
    chr(12419): "ja",  # ゃ
    chr(12420): "ja",  # や
    chr(12421): "jɯ",  # ゅ
    chr(12422): "jɯ",  # ゆ
    chr(12423): "jo",  # ょ
    chr(12424): "jo",  # よ
    chr(12425): "ɾa",  # ら
    chr(12426): "ɾʲi",  # り
    chr(12427): "ɾɯ",  # る
    chr(12428): "ɾe",  # れ
    chr(12429): "ɾo",  # ろ
    chr(12430): "βa",  # ゎ
    chr(12431): "βa",  # わ
    chr(12432): "i",  # ゐ
    chr(12433): "e",  # ゑ
    chr(12434): "o",  # を
    # chr(12435):'#', #ん
    chr(12436): "vɯ",  # ゔ
    chr(12437): "ka",  # ゕ
    chr(12438): "ke",  # ゖ
}
assert len(HEPBURN) == 84 and all(i in {12387, 12435} or chr(i) in HEPBURN for i in range(12353, 12439))

HEPBURN.update(
    {
        chr(12535): "va",  # ヷ
        chr(12536): "vʲi",  # ヸ
        chr(12537): "ve",  # ヹ
        chr(12538): "vo",  # ヺ
    }
)
assert len(HEPBURN) == 88 and all(chr(i) in HEPBURN for i in range(12535, 12539))

HEPBURN.update(
    {
        chr(12356) + chr(12359): "je",  # いぇ
        chr(12358) + chr(12355): "βi",  # うぃ
        chr(12358) + chr(12359): "βe",  # うぇ
        chr(12358) + chr(12361): "βo",  # うぉ
        chr(12365) + chr(12359): "kʲe",  # きぇ
        chr(12365) + chr(12419): "kʲa",  # きゃ
        chr(12365) + chr(12421): "kʲɨ",  # きゅ
        chr(12365) + chr(12423): "kʲo",  # きょ
        chr(12366) + chr(12419): "ɡʲa",  # ぎゃ
        chr(12366) + chr(12421): "ɡʲɨ",  # ぎゅ
        chr(12366) + chr(12423): "ɡʲo",  # ぎょ
        chr(12367) + chr(12353): "kᵝa",  # くぁ
        chr(12367) + chr(12355): "kᵝi",  # くぃ
        chr(12367) + chr(12359): "kᵝe",  # くぇ
        chr(12367) + chr(12361): "kᵝo",  # くぉ
        chr(12368) + chr(12353): "ɡᵝa",  # ぐぁ
        chr(12368) + chr(12355): "ɡᵝi",  # ぐぃ
        chr(12368) + chr(12359): "ɡᵝe",  # ぐぇ
        chr(12368) + chr(12361): "ɡᵝo",  # ぐぉ
        chr(12375) + chr(12359): "ɕe",  # しぇ
        chr(12375) + chr(12419): "ɕa",  # しゃ
        chr(12375) + chr(12421): "ɕɨ",  # しゅ
        chr(12375) + chr(12423): "ɕo",  # しょ
        chr(12376) + chr(12359): "ʥe",  # じぇ
        chr(12376) + chr(12419): "ʥa",  # じゃ
        chr(12376) + chr(12421): "ʥɨ",  # じゅ
        chr(12376) + chr(12423): "ʥo",  # じょ
        chr(12385) + chr(12359): "ʨe",  # ちぇ
        chr(12385) + chr(12419): "ʨa",  # ちゃ
        chr(12385) + chr(12421): "ʨɨ",  # ちゅ
        chr(12385) + chr(12423): "ʨo",  # ちょ
        chr(12386) + chr(12419): "ʥa",  # ぢゃ
        chr(12386) + chr(12421): "ʥɨ",  # ぢゅ
        chr(12386) + chr(12423): "ʥo",  # ぢょ
        chr(12388) + chr(12353): "ʦa",  # つぁ
        chr(12388) + chr(12355): "ʦʲi",  # つぃ
        chr(12388) + chr(12359): "ʦe",  # つぇ
        chr(12388) + chr(12361): "ʦo",  # つぉ
        chr(12390) + chr(12355): "tʲi",  # てぃ
        chr(12390) + chr(12421): "tʲɨ",  # てゅ
        chr(12391) + chr(12355): "dʲi",  # でぃ
        chr(12391) + chr(12421): "dʲɨ",  # でゅ
        chr(12392) + chr(12357): "tɯ",  # とぅ
        chr(12393) + chr(12357): "dɯ",  # どぅ
        chr(12395) + chr(12359): "ɲe",  # にぇ
        chr(12395) + chr(12419): "ɲa",  # にゃ
        chr(12395) + chr(12421): "ɲɨ",  # にゅ
        chr(12395) + chr(12423): "ɲo",  # にょ
        chr(12402) + chr(12359): "çe",  # ひぇ
        chr(12402) + chr(12419): "ça",  # ひゃ
        chr(12402) + chr(12421): "çɨ",  # ひゅ
        chr(12402) + chr(12423): "ço",  # ひょ
        chr(12403) + chr(12419): "bʲa",  # びゃ
        chr(12403) + chr(12421): "bʲɨ",  # びゅ
        chr(12403) + chr(12423): "bʲo",  # びょ
        chr(12404) + chr(12419): "pʲa",  # ぴゃ
        chr(12404) + chr(12421): "pʲɨ",  # ぴゅ
        chr(12404) + chr(12423): "pʲo",  # ぴょ
        chr(12405) + chr(12353): "ɸa",  # ふぁ
        chr(12405) + chr(12355): "ɸʲi",  # ふぃ
        chr(12405) + chr(12359): "ɸe",  # ふぇ
        chr(12405) + chr(12361): "ɸo",  # ふぉ
        chr(12405) + chr(12421): "ɸʲɨ",  # ふゅ
        chr(12405) + chr(12423): "ɸʲo",  # ふょ
        chr(12415) + chr(12419): "mʲa",  # みゃ
        chr(12415) + chr(12421): "mʲɨ",  # みゅ
        chr(12415) + chr(12423): "mʲo",  # みょ
        chr(12426) + chr(12419): "ɾʲa",  # りゃ
        chr(12426) + chr(12421): "ɾʲɨ",  # りゅ
        chr(12426) + chr(12423): "ɾʲo",  # りょ
        chr(12436) + chr(12353): "va",  # ゔぁ
        chr(12436) + chr(12355): "vʲi",  # ゔぃ
        chr(12436) + chr(12359): "ve",  # ゔぇ
        chr(12436) + chr(12361): "vo",  # ゔぉ
        chr(12436) + chr(12421): "bʲɨ",  # ゔゅ
        chr(12436) + chr(12423): "bʲo",  # ゔょ
    }
)
assert len(HEPBURN) == 164

for k, _v in list(HEPBURN.items()):
    if len(k) == 2:
        a, b = k
        assert a in HEPBURN and b in HEPBURN, (a, b)

HEPBURN.update(
    {
        # symbols
        # 'ー': '-', # long-vowel mark, only used when repeated
        "。": ".",
        "、": ",",
        "？": "?",
        "！": "!",
        "「": chr(8220),  #'"',
        "」": chr(8221),  #'"',
        "『": chr(8220),  #'"',
        "』": chr(8221),  #'"',
        "：": ":",
        "；": ";",
        "（": "(",
        "）": ")",
        "《": "(",
        "》": ")",
        "【": "[",
        "】": "]",
        "・": " ",  #'/',
        "，": ",",
        "～": "—",
        "〜": "—",
        "—": "—",
        "«": chr(8220),
        "»": chr(8221),
        # other
        "゚": "",  # combining handakuten by itself, just discard
        "゙": "",  # combining dakuten by itself
    }
)
