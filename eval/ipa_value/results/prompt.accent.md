You are acting as a **Yomite**: you write YomiScript for a speech synthesizer. Do not use any tools; answer directly.

Write what you want to say as YomiScript, a pronunciation notation: you decide how every word is read, from its context.

- One utterance: `<lang> /… ↘/` for a statement, `<lang> /… ↗/` for a question. `<lang>` is a BCP 47 tag (`ja`, `en-US`).
- The pronunciation is IPA, as the words are actually spoken: numbers, dates, symbols and abbreviations spelled out, and each word read the way it is meant here.
  - Japanese: phonemic IPA, mora by mora. Rows: a i ɯ e o; ka ki kɯ ke ko (kʲa kʲɯ kʲo); sa ɕi sɯ se so (ɕa ɕɯ ɕo); dza dʑi dzɯ dze dzo; ta tɕi tsɯ te to (tɕa tɕɯ tɕo); da de do; na ɲi nɯ ne no (ɲa ɲɯ ɲo); ha çi ɸɯ he ho (ça çɯ ço); ba bi bɯ be bo; pa pi pɯ pe po; ma mi mɯ me mo (mʲa…); ja jɯ jo; wa; ɾa ɾi ɾɯ ɾe ɾo (ɾʲa…). Loanword sounds: ti di tɯ ɸa ɸi ɸe ɸo wi we wo tsa va. Particles: は `wa`, へ `e`, を `o`. Long vowel `ː` as pronounced (先生 `seːseː`). Geminate: double the next consonant (`kitte`; before tɕ / ts write `t`: `mattɕi`), `ʔ` before a vowel or at the end. ン: `m` before p b m, `n` before t d n ɾ dz, `ɲ` before tɕ dʑ ɲ, `ŋ` before k ɡ, `ɴ` otherwise. Latin letters and symbols as a Japanese speaker says them (iPhone `aiɸoɴ`). Separate words with spaces.
  - English: IPA with `ˈ` / `ˌ` stress at the start of the syllable, `.` between syllables, spaces between words.
- ` ‖ ` marks a pause (a comma). Several sentences stay one utterance: end each inner sentence with ` ↘ ` or ` ↗ `.
- After each word, write the text it reads in `<t:…>`, so that joining them gives back your text exactly: punctuation goes with the word before it (`desɯ<t:です。>`) or in its own `<t:…>` where nothing is spoken (`‖<t:、>`); in English write the spaces too (`ˈwɝld<t: world.>`).
- Japanese pitch accent (Tokyo): write `ꜜ` right after the accent-nucleus mora (the pitch falls after it) and `ꜛ` right after the mora where the pitch rises (the first mora of a phrase is low unless it is the nucleus). Put ` | ` between accent phrases and mark every phrase. A flat word has no `ꜜ` (桜が `saꜛkɯɾa ɡa`); a word whose fall comes after its last mora has `ꜜ` there (男が `oꜛtokoꜜ ɡa`); 命が `iꜜnotɕi ɡa`. Mark the accent each word has in this sentence and meaning. No pitch values: the synthesizer makes them from the marks.

Examples:
ja /ɕɯꜛːmatsɯ<t:週末> wa<t:は> ‖<t:、> toꜛmodatɕi<t:友達> to<t:と> | kʲoꜜːto<t:京都> e<t:へ> | iꜛkɯ<t:行く> | joꜛteː<t:予定> deꜜsɯ<t:です。> ↘/
ja /oꜛtoːtoꜜ<t:弟> ɡa<t:が> | saꜛkɯɾa<t:桜> o<t:を> | miꜛ<t:見> ni<t:に> | iꜛtta<t:行った。> ↘/

## Task

For each item, write the YomiScript of the text, with the accent marks.

Return **only** a JSON object mapping each item name to its YomiScript string, with no other text:
`{"<name>": "<YomiScript>", …}`

## Items

- ame_1 (ja): 朝から雨が降っています。
- ame_2 (ja): 子供が飴をなめています。
- hashi_1 (ja): 川に新しい橋がかかった。
- hashi_2 (ja): 食事のときは箸を使います。
- hashi_3 (ja): 道の端を歩いてください。
- kaki_1 (ja): 秋になると柿が甘くなる。
- kaki_2 (ja): 広島で牡蠣を食べました。
- sake_1 (ja): 父は毎晩酒を飲む。
- sake_2 (ja): 川を鮭がのぼってきた。
- kami_1 (ja): 神に祈りを捧げた。
- kami_2 (ja): コピー機の紙が切れた。
- kami_3 (ja): 美容院で髪を切った。
- hana_1 (ja): 風邪で鼻がつまっている。
- hana_2 (ja): 庭に花が咲いた。
- aki_1 (ja): 秋が来て涼しくなった。
- aki_2 (ja): 駐車場に空きがない。
- asa_1 (ja): 朝が早いので眠い。
- asa_2 (ja): このシャツは麻でできている。
- kata_1 (ja): 重い荷物で肩が痛い。
- kata_2 (ja): ケーキの型を買った。
- michi_1 (ja): この道をまっすぐ行ってください。
- michi_2 (ja): 未知の世界を探検する。
- ishi_1 (ja): 川原で石を拾った。
- ishi_2 (ja): 本人の意思を尊重する。
- shio_1 (ja): スープに塩を入れた。
- shio_2 (ja): 潮が満ちてきた。
- ima_1 (ja): 今が一番楽しい。
- ima_2 (ja): 家族は居間でテレビを見ている。
- atsui_1 (ja): 熱いお茶を飲んだ。
- atsui_2 (ja): 厚い本を読んだ。
- hi_1 (ja): ガスの火を消した。
- hi_2 (ja): 日が暮れてきた。
- ki_1 (ja): 公園の木が倒れた。
- ki_2 (ja): 彼は気が短い。
- ijou_1 (ja): 以上で説明を終わります。
- ijou_2 (ja): 検査で異常が見つかった。
- ichi_1 (ja): 一から勉強し直す。
- ichi_2 (ja): 机の位置を変えた。
- shita_1 (ja): 机の下に猫がいる。
- shita_2 (ja): 熱いスープで舌をやけどした。
- aka_1 (ja): 信号が赤に変わった。
- aka_2 (ja): お風呂で垢を落とした。
- toshi_1 (ja): 東京は大きな都市だ。
- toshi_2 (ja): 年が明けた。