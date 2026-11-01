You are acting as a **Yomite**: you write YomiScript, a language-neutral pronunciation notation that a speech synthesizer (the Katarite, here Kokoro-82M) reads. Do not use any tools; answer directly.

## YomiScript (the subset this synthesizer uses)

- One utterance per item: `<lang> /… ↘/` for a statement, `<lang> /… ↗/` for a question. `<lang>` is a BCP 47 language tag (`ja`, `en-US`).
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
- ` ‖ ` marks a pause (where a comma or a break in the sentence is).
- An item with several sentences is still **one** utterance: end each inner sentence with ` ↘ ` (or ` ↗ ` for a question) inside it, e.g. `ja /ame ɡa jamimaɕita ↘ sampo ɲi ikimaɕoː ↘/`.
- No pitch values, no accent marks: this synthesizer makes the prosody itself.
- **Original text.** After each word, write the text it reads in `<t:…>`: `kʲoː<t:今日> wa<t:は>`. Every character of the input goes into exactly one `<t:…>`, in order, so that joining them gives back the input exactly: put punctuation and brackets with the word before them (`desɯ<t:です。>`) or in a `<t:…>` of their own where nothing is spoken (`‖<t:、>`, `<t:「>`), and for English write the spaces too (`ˈwɝld<t: world.>`). The pronunciation is still only the IPA.

## Examples

Input (ja): 新しいスマートフォンを買いました。
Output: ja /ataɾaɕiː<t:新しい> sɯmaːto ɸoɴ<t:スマートフォン> o<t:を> kai<t:買い> maɕita<t:ました。> ↘/

Input (ja): 週末は、友達と京都へ行く予定です。
Output: ja /ɕɯːmatsɯ<t:週末> wa<t:は> ‖<t:、> tomodatɕi<t:友達> to<t:と> kʲoːto<t:京都> e<t:へ> ikɯ<t:行く> joteː<t:予定> desɯ<t:です。> ↘/

Input (ja): この本、読んだことある？
Output: ja /kono<t:この> hoɴ<t:本> ‖<t:、> jonda<t:読んだ> koto<t:こと> aɾɯ<t:ある？> ↗/

Input (en-US): I read the letter twice, but it still made no sense.
Output: en-US /ˌaɪ<t:I> ˈɹɛd<t: read> ðə<t: the> ˈlɛ.ɾəɹ<t: letter> ˈtwaɪs<t: twice,> ‖ ˌbʌt<t: but> ɪt<t: it> ˈstɪl<t: still> ˌmeɪd<t: made> ˈnoʊ<t: no> ˈsɛns<t: sense.> ↘/

Input (en-US): Could you close the window, please?
Output: en-US /ˌkʊd<t:Could> ju<t: you> ˈkloʊz<t: close> ðə<t: the> ˈwɪn.doʊ<t: window,> ‖ ˈpliz<t: please?> ↗/

## Task

For each item, write the YomiScript for the given text in the given language.

Return **only** a JSON object mapping each item name to its YomiScript string, with no other text:
`{"<name>": "<YomiScript>", …}`

## Items

- h003 (ja): 毎月八日に朝市が開かれる。
- h007 (ja): 一日中ずっと雨だった。
- h016 (ja): 生物はお早めにお召し上がりください。
- h021 (ja): 別れはいつも辛いものだ。
- h032 (ja): 上手く説明できない。
- h038 (ja): NHKのニュースを見た。
- h064 (ja): 7月7日は七夕だ。
- h067 (ja): 1月14日に出発した。
- h068 (ja): 6月20日に誕生日を迎える。
- h069 (ja): 平成31年4月30日に退位された。
