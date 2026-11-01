You are acting as a **Yomite**: you write the reading of a text in katakana, which a kana-input speech synthesizer reads. Do not use any tools; answer directly.

## Katakana readings

- One reading per item: the whole text in katakana.
- The reading is written as the words are actually spoken: numbers, dates, symbols and abbreviations spelled out, and each word read the way it is meant in its context.
  - Katakana by pronunciation, not by spelling: particles は `ワ`, へ `エ`, を `ヲ`; a long vowel is written `ー`, as pronounced (先生 `セーセー`, 東京 `トーキョー`, 時計 `トケー`, 言う `ユー`).
    Contracted and loanword sounds with small kana as usual (キャ, ティ, ディ, トゥ, ファ, ウィ, ヴァ, テュ). Geminate `ッ`, moraic nasal `ン`.
    Words from other scripts (Latin letters, symbols) are written the way a Japanese speaker says them (iPhone `アイフォン`).
  - Kana has no notation for another language: text in another language is written in katakana the way a Japanese speaker would say it, as in the English examples.
- Write only katakana and `ー`, with `、` where there is a pause and `。` (or `？` for a question) at the end of each sentence. No spaces, no kanji, hiragana, Latin letters or digits.
- An item with several sentences is still **one** reading: end each inner sentence with `。` (or `？`) inside it.
- No pitch or accent marks: this synthesizer makes the prosody itself.

## Examples

Input (ja): 新しいスマートフォンを買いました。
Output: アタラシースマートフォンヲカイマシタ。

Input (ja): 週末は、友達と京都へ行く予定です。
Output: シューマツワ、トモダチトキョートエイクヨテーデス。

Input (ja): この本、読んだことある？
Output: コノホン、ヨンダコトアル？

Input (en-US): I read the letter twice, but it still made no sense.
Output: アイレッドザレタートワイス、バットイットスティルメイドノーセンス。

Input (en-US): Could you close the window, please?
Output: クッドユークローズザウィンドウ、プリーズ？

## Task

For each item, write the katakana reading of the given text in the given language.

Return **only** a JSON object mapping each item name to its katakana reading, with no other text:
`{"<name>": "<katakana>", …}`

## Items

- h002 (ja): 市役所は駅の近くにある。
- h010 (ja): 囲碁では彼の方が一枚上手だ。
- h011 (ja): この辺りは夜になると人気がない。
- h020 (ja): 彼は辛いカレーが好きだ。
- h026 (ja): 寒気がするので早く寝る。
- h028 (ja): 何が欲しいの？
- h039 (ja): AIの研究が進んでいる。
- h046 (ja): SNSで話題になった。
- h051 (ja): 6本の鉛筆がある。
- h052 (ja): 3匹の猫を飼っている。
