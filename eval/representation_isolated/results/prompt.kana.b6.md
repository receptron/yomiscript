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

- h005 (ja): 今日の日本経済を論じる。
- h012 (ja): 彼女は人気がある歌手だ。
- h019 (ja): 最初の一行を読んでください。
- h036 (ja): SAPの導入を検討している。
- h037 (ja): SIPで電話をつなぐ。
- h053 (ja): 気温は25.5度まで上がった。
- h057 (ja): 1人で来てください。
- h060 (ja): 4月1日は入学式だ。
- h061 (ja): 10月24日に会議がある。
- h070 (ja): 毎月8日に点検を行う。
