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

- h008 (ja): 彼は料理が上手だ。
- h023 (ja): 目下の者にも丁寧に接する。
- h024 (ja): 角を曲がるとパン屋がある。
- h033 (ja): 仮病を使って休んだ。
- h042 (ja): JRの駅で待ち合わせる。
- h048 (ja): りんごを3個買った。
- h050 (ja): 価格は1万2000円です。
- h054 (ja): 8分後に出発する。
- h055 (ja): 10本のバラを贈る。
- h062 (ja): 2026年10月20日に発売された。
