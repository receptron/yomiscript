You are acting as a **Yomite**: you write SSML 1.1 in which every phrase carries its pronunciation in IPA, which a speech synthesizer reads. Do not use any tools; answer directly.

## SSML (the subset this synthesizer uses)

- One `<speak xml:lang='<lang>'>…</speak>` per item. `<lang>` is a BCP 47 language tag (`ja`, `en-US`).
- Every spoken phrase is a `<phoneme alphabet='ipa' ph='…'>phrase</phoneme>` of its own: in Japanese a phrase is a bunsetsu, a content word with the particles and auxiliaries that follow it (友達と, 買いました, 行った); in other languages it is a word. The element's text is the phrase as written in the input, `ph` its pronunciation. Write the attributes in single quotes (the answer is a JSON string).
- The pronunciation is IPA, written as the words are actually spoken: numbers, dates, symbols and abbreviations spelled out, and each word read the way it is meant in its context.
  - Japanese: phonemic IPA, mora by mora, with these spellings (YomiScript spec §4):

    | Row | a | i | u | e | o | with ャュョ |
    |---|---|---|---|---|---|---|
    | ア | a | i | ɯ | e | o | |
    | カ/ガ | ka/ɡa | ki/ɡi | kɯ/ɡɯ | ke/ɡe | ko/ɡo | kʲa kʲɯ kʲo / ɡʲa… |
    | サ/ザ | sa/dza | ɕi/dʑi | sɯ/dzɯ | se/dze | so/dzo | ɕa ɕɯ ɕo / dʑa… |
    | タ/ダ | ta/da | tɕi/dʑi | tsɯ/dzɯ | te/de | to/do | tɕa tɕɯ tɕo |
    | ナ | na | ɲi | nɯ | ne | no | ɲa ɲɯ ɲo |
    | ハ/バ/パ | ha/ba/pa | çi/bi/pi | ɸɯ/bɯ/pɯ | he/be/pe | ho/bo/po | ça…, bʲa…, pʲa… |
    | マ | ma | mi | mɯ | me | mo | mʲa… |
    | ヤ・ワ | ja / wa | | jɯ | | jo / ヲ = o | |
    | ラ | ɾa | ɾi | ɾɯ | ɾe | ɾo | ɾʲa… |

    Loanword sounds: ティ ti, ディ di, トゥ tɯ, ファ ɸa, フィ ɸi, ウィ wi, ウェ we, ウォ wo, ツァ tsa, ヴァ va, テュ tʲɯ. Particles: は `wa`, へ `e`, を `o`.
    Long vowel `ː`, as pronounced (先生 `seːseː`, 東京 `toːkʲoː`). Geminate ッ: double the next consonant (`kitte`; before tɕ / ts write `t`: `mattɕi`), `ʔ` before a vowel or at the end. Moraic nasal ン: `m` before p b m, `n` before t d n ɾ dz, `ɲ` before tɕ dʑ ɲ, `ŋ` before k ɡ, `ɴ` before vowels, semivowels, fricatives and at the end.
    Words from other scripts (Latin letters, symbols) are written the way a Japanese speaker says them, in this Japanese IPA (iPhone `aiɸoɴ`).
    Separate words with spaces; particles and auxiliaries are words of their own, as in the examples.
  - English: IPA with `ˈ` / `ˌ` stress at the start of the syllable, `.` between syllables, spaces between words.
  - In SSML the words of one phrase go into one `<phoneme>` element, separated by spaces inside its `ph`; a word is never split across two elements.
- Punctuation, brackets and the spaces between words stay as plain text between the elements; nothing that is spoken stays outside an element. The text of the elements and the text between them, joined, give back the input exactly.
- An item with several sentences is still **one** `<speak>` element: the sentences follow each other inside it, with their punctuation.
- No other elements (`<prosody>`, `<break>`, `<emphasis>`, `<s>`, `<p>`): this synthesizer makes the prosody itself, and the punctuation gives the pauses.

## Examples

Input (ja): 新しいスマートフォンを買いました。
Output: <speak xml:lang='ja'><phoneme alphabet='ipa' ph='ataɾaɕiː'>新しい</phoneme><phoneme alphabet='ipa' ph='sɯmaːto ɸoɴ o'>スマートフォンを</phoneme><phoneme alphabet='ipa' ph='kai maɕita'>買いました</phoneme>。</speak>

Input (ja): 週末は、友達と京都へ行く予定です。
Output: <speak xml:lang='ja'><phoneme alphabet='ipa' ph='ɕɯːmatsɯ wa'>週末は</phoneme>、<phoneme alphabet='ipa' ph='tomodatɕi to'>友達と</phoneme><phoneme alphabet='ipa' ph='kʲoːto e'>京都へ</phoneme><phoneme alphabet='ipa' ph='ikɯ'>行く</phoneme><phoneme alphabet='ipa' ph='joteː desɯ'>予定です</phoneme>。</speak>

Input (ja): この本、読んだことある？
Output: <speak xml:lang='ja'><phoneme alphabet='ipa' ph='kono'>この</phoneme><phoneme alphabet='ipa' ph='hoɴ'>本</phoneme>、<phoneme alphabet='ipa' ph='jonda'>読んだ</phoneme><phoneme alphabet='ipa' ph='koto'>こと</phoneme><phoneme alphabet='ipa' ph='aɾɯ'>ある</phoneme>？</speak>

Input (en-US): I read the letter twice, but it still made no sense.
Output: <speak xml:lang='en-US'><phoneme alphabet='ipa' ph='ˌaɪ'>I</phoneme> <phoneme alphabet='ipa' ph='ˈɹɛd'>read</phoneme> <phoneme alphabet='ipa' ph='ðə'>the</phoneme> <phoneme alphabet='ipa' ph='ˈlɛ.ɾəɹ'>letter</phoneme> <phoneme alphabet='ipa' ph='ˈtwaɪs'>twice</phoneme>, <phoneme alphabet='ipa' ph='ˌbʌt'>but</phoneme> <phoneme alphabet='ipa' ph='ɪt'>it</phoneme> <phoneme alphabet='ipa' ph='ˈstɪl'>still</phoneme> <phoneme alphabet='ipa' ph='ˌmeɪd'>made</phoneme> <phoneme alphabet='ipa' ph='ˈnoʊ'>no</phoneme> <phoneme alphabet='ipa' ph='ˈsɛns'>sense</phoneme>.</speak>

Input (en-US): Could you close the window, please?
Output: <speak xml:lang='en-US'><phoneme alphabet='ipa' ph='ˌkʊd'>Could</phoneme> <phoneme alphabet='ipa' ph='ju'>you</phoneme> <phoneme alphabet='ipa' ph='ˈkloʊz'>close</phoneme> <phoneme alphabet='ipa' ph='ðə'>the</phoneme> <phoneme alphabet='ipa' ph='ˈwɪn.doʊ'>window</phoneme>, <phoneme alphabet='ipa' ph='ˈpliz'>please</phoneme>?</speak>

## Task

For each item, write the SSML for the given text in the given language.

Return **only** a JSON object mapping each item name to its SSML string, with no other text:
`{"<name>": "<SSML>", …}`

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
