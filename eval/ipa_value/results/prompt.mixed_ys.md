You are acting as a **Yomite**: you write YomiScript for a speech synthesizer. Do not use any tools; answer directly.

Write what you want to say as YomiScript, a pronunciation notation: you decide how every word is read, from its context.

- One utterance: `<lang> /… ↘/` for a statement, `<lang> /… ↗/` for a question. `<lang>` is a BCP 47 tag (`ja`, `en-US`).
- The pronunciation is IPA, as the words are actually spoken: numbers, dates, symbols and abbreviations spelled out, and each word read the way it is meant here.
  - Japanese: phonemic IPA, mora by mora. Rows: a i ɯ e o; ka ki kɯ ke ko (kʲa kʲɯ kʲo); sa ɕi sɯ se so (ɕa ɕɯ ɕo); dza dʑi dzɯ dze dzo; ta tɕi tsɯ te to (tɕa tɕɯ tɕo); da de do; na ɲi nɯ ne no (ɲa ɲɯ ɲo); ha çi ɸɯ he ho (ça çɯ ço); ba bi bɯ be bo; pa pi pɯ pe po; ma mi mɯ me mo (mʲa…); ja jɯ jo; wa; ɾa ɾi ɾɯ ɾe ɾo (ɾʲa…). Loanword sounds: ti di tɯ ɸa ɸi ɸe ɸo wi we wo tsa va. Particles: は `wa`, へ `e`, を `o`. Long vowel `ː` as pronounced (先生 `seːseː`). Geminate: double the next consonant (`kitte`; before tɕ / ts write `t`: `mattɕi`), `ʔ` before a vowel or at the end. ン: `m` before p b m, `n` before t d n ɾ dz, `ɲ` before tɕ dʑ ɲ, `ŋ` before k ɡ, `ɴ` otherwise. Latin letters and symbols as a Japanese speaker says them (iPhone `aiɸoɴ`). Separate words with spaces.
  - A word or phrase meant to be said in another language (a quoted English phrase, an English title, a name said the English way) goes in braces with its BCP 47 tag, in that language's IPA, inside the Japanese utterance: `{en-US ˈɡʊd<t:Good> ˈnaɪt<t: night>}`. A loanword or a word said the Japanese way (テーブル, iPhone `aiɸoɴ`) stays Japanese.
  - English: IPA with `ˈ` / `ˌ` stress at the start of the syllable, `.` between syllables, spaces between words.
- ` ‖ ` marks a pause (a comma). Several sentences stay one utterance: end each inner sentence with ` ↘ ` or ` ↗ `.
- After each word, write the text it reads in `<t:…>`, so that joining them gives back your text exactly: punctuation goes with the word before it (`desɯ<t:です。>`) or in its own `<t:…>` where nothing is spoken (`‖<t:、>`); in English write the spaces too (`ˈwɝld<t: world.>`).
- No pitch values and no accent marks: the synthesizer makes the prosody.

Examples:
ja /ɕɯːmatsɯ<t:週末> wa<t:は> ‖<t:、> tomodatɕi<t:友達> to<t:と> kʲoːto<t:京都> e<t:へ> ikɯ<t:行く> joteː<t:予定> desɯ<t:です。> ↘/
ja /tsɯitatɕi<t:一日> kaɾa<t:から> mikka<t:三日> made<t:まで> jasɯmi<t:休み> desɯ<t:です。> ↘/
en-US /ˌaɪ<t:I> ˈɹɛd<t: read> ðə<t: the> ˈlɛ.ɾəɹ<t: letter> ˈtwaɪs<t: twice,> ‖ ˌbʌt<t: but> ɪt<t: it> ˈstɪl<t: still> ˌmeɪd<t: made> ˈnoʊ<t: no> ˈsɛns<t: sense.> ↘/
ja /kaɾe<t:彼> wa<t:は> {en-US ˈɡʊd<t:「Good> ˈnaɪt<t: night」>} to<t:と> itta<t:言った。> ↘/

## Task

For each item, write the YomiScript of the text.

Return **only** a JSON object mapping each item name to its YomiScript string, with no other text:
`{"<name>": "<YomiScript>", …}`

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