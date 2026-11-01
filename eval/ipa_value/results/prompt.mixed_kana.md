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

- en_01 (ja): 英語の授業で「How are you?」と聞かれました。
- en_02 (ja): 彼女は英語で「Nice to meet you」と挨拶した。
- en_03 (ja): 映画の最後の台詞は、英語で「I'll be back」です。
- en_04 (ja): 会議の最後に、アメリカ人の上司が「Any questions?」と聞いた。
- en_05 (ja): 英語のことわざ「Practice makes perfect」を覚えた。
- en_06 (ja): ロンドンの空港で「Final boarding call」というアナウンスが流れた。
- en_07 (ja): イギリスの取引先のメールは、いつも「Best regards」で終わる。
- en_08 (ja): 英語で聞かれて、「I don't know」と答えるしかなかった。
- en_09 (ja): 英語の先生は「thought」の発音を三回繰り返した。
- en_10 (ja): 発音練習では、「through」を英語らしく言ってみましょう。
- en_11 (ja): アメリカ人の同僚、Jennifer Wilson さんを英語の発音で紹介した。
- en_12 (ja): ロンドン出身の Matthew さんに、名前は英語の発音で呼んでほしいと言われた。
- en_13 (ja): 英語の授業で、原書の「The Catcher in the Rye」を朗読した。
- en_14 (ja): 歌手は「Somewhere Over the Rainbow」を英語で歌った。
- en_15 (ja): シアトルでは、地元の人が言うように「Pike Place Market」と英語で言ってみた。
- en_16 (ja): 朝のホームルームでは、英語で「Good morning」と挨拶します。
- ja_01 (ja): テーブルの上にコンピューターがあります。
- ja_02 (ja): 毎朝コーヒーを飲みます。
- ja_03 (ja): スマートフォンでメールを送った。
- ja_04 (ja): 駅前のホテルに泊まった。
- ja_05 (ja): iPhone を買い替えました。
- ja_06 (ja): OK、じゃあ明日ね。
- ja_07 (ja): カフェの Wi-Fi のパスワードを教えてください。
- ja_08 (ja): 友達に軽くサンキューと言った。
