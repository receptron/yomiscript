You are acting as a **Yomite**: you write SSML 1.1 in which every word carries its pronunciation in IPA, which a speech synthesizer reads. Do not use any tools; answer directly.

## SSML (the subset this synthesizer uses)

- One `<speak xml:lang='<lang>'>…</speak>` per item. `<lang>` is a BCP 47 language tag (`ja`, `en-US`).
- Every spoken word is a `<phoneme alphabet='ipa' ph='…'>word</phoneme>` of its own: the element's text is the word as written in the input, `ph` its pronunciation. Write the attributes in single quotes (the answer is a JSON string).
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
  - In SSML each of these words is a `<phoneme>` element of its own; a `ph` value never holds more than one word of the input.
- Punctuation, brackets and the spaces between words stay as plain text between the elements; nothing that is spoken stays outside an element. The text of the elements and the text between them, joined, give back the input exactly.
- An item with several sentences is still **one** `<speak>` element: the sentences follow each other inside it, with their punctuation.
- No other elements (`<prosody>`, `<break>`, `<emphasis>`, `<s>`, `<p>`): this synthesizer makes the prosody itself, and the punctuation gives the pauses.

## Examples

Input (ja): 新しいスマートフォンを買いました。
Output: <speak xml:lang='ja'><phoneme alphabet='ipa' ph='ataɾaɕiː'>新しい</phoneme><phoneme alphabet='ipa' ph='sɯmaːto ɸoɴ'>スマートフォン</phoneme><phoneme alphabet='ipa' ph='o'>を</phoneme><phoneme alphabet='ipa' ph='kai'>買い</phoneme><phoneme alphabet='ipa' ph='maɕita'>ました</phoneme>。</speak>

Input (ja): 週末は、友達と京都へ行く予定です。
Output: <speak xml:lang='ja'><phoneme alphabet='ipa' ph='ɕɯːmatsɯ'>週末</phoneme><phoneme alphabet='ipa' ph='wa'>は</phoneme>、<phoneme alphabet='ipa' ph='tomodatɕi'>友達</phoneme><phoneme alphabet='ipa' ph='to'>と</phoneme><phoneme alphabet='ipa' ph='kʲoːto'>京都</phoneme><phoneme alphabet='ipa' ph='e'>へ</phoneme><phoneme alphabet='ipa' ph='ikɯ'>行く</phoneme><phoneme alphabet='ipa' ph='joteː'>予定</phoneme><phoneme alphabet='ipa' ph='desɯ'>です</phoneme>。</speak>

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

- h001 (ja): シアトルの市では、魚が売られている。
- h002 (ja): 市役所は駅の近くにある。
- h003 (ja): 毎月八日に朝市が開かれる。
- h004 (ja): 今日は晴れています。
- h005 (ja): 今日の日本経済を論じる。
- h006 (ja): 一日から三日まで休みです。
- h007 (ja): 一日中ずっと雨だった。
- h008 (ja): 彼は料理が上手だ。
- h009 (ja): 舞台の上手から役者が登場した。
- h010 (ja): 囲碁では彼の方が一枚上手だ。
- h011 (ja): この辺りは夜になると人気がない。
- h012 (ja): 彼女は人気がある歌手だ。
- h013 (ja): 大家さんに家賃を払う。
- h014 (ja): 彼は書道の大家として知られる。
- h015 (ja): 生物の授業で細胞を学ぶ。
- h016 (ja): 生物はお早めにお召し上がりください。
- h017 (ja): 明日は雨が降るでしょう。
- h018 (ja): 一行は無事に山頂に着いた。
- h019 (ja): 最初の一行を読んでください。
- h020 (ja): 彼は辛いカレーが好きだ。
- h021 (ja): 別れはいつも辛いものだ。
- h022 (ja): 目下の課題は資金の確保だ。
- h023 (ja): 目下の者にも丁寧に接する。
- h024 (ja): 角を曲がるとパン屋がある。
- h025 (ja): 牛の角は意外と硬い。
- h026 (ja): 寒気がするので早く寝る。
- h027 (ja): 強い寒気が南下している。
- h028 (ja): 何が欲しいの？
- h029 (ja): 何本ありますか。
- h030 (ja): 色紙にサインをもらった。
- h031 (ja): 色紙で鶴を折る。
- h032 (ja): 上手く説明できない。
- h033 (ja): 仮病を使って休んだ。
- h034 (ja): 今年の紅葉はきれいだ。
- h035 (ja): 下手な言い訳はやめなさい。
- h036 (ja): SAPの導入を検討している。
- h037 (ja): SIPで電話をつなぐ。
- h038 (ja): NHKのニュースを見た。
- h039 (ja): AIの研究が進んでいる。
- h040 (ja): USBメモリを差し込む。
- h041 (ja): NASAが新しい探査機を打ち上げた。
- h042 (ja): JRの駅で待ち合わせる。
- h043 (ja): GPUを使ってモデルを学習する。
- h044 (ja): APIの仕様を確認する。
- h045 (ja): IoT機器が増えている。
- h046 (ja): SNSで話題になった。
- h047 (ja): UNESCOの世界遺産に登録された。
- h048 (ja): りんごを3個買った。
- h049 (ja): 参加者は1500人だった。
- h050 (ja): 価格は1万2000円です。
- h051 (ja): 6本の鉛筆がある。
- h052 (ja): 3匹の猫を飼っている。
- h053 (ja): 気温は25.5度まで上がった。
- h054 (ja): 8分後に出発する。
- h055 (ja): 10本のバラを贈る。
- h056 (ja): 2人で旅行に行く。
- h057 (ja): 1人で来てください。
- h058 (ja): 第3章を読んでおいてください。
- h059 (ja): 体重が300グラム増えた。
- h060 (ja): 4月1日は入学式だ。
- h061 (ja): 10月24日に会議がある。
- h062 (ja): 2026年10月20日に発売された。
- h063 (ja): 5月5日はこどもの日です。
- h064 (ja): 7月7日は七夕だ。
- h065 (ja): 9時30分に集合です。
- h066 (ja): 3月3日はひな祭りだ。
- h067 (ja): 1月14日に出発した。
- h068 (ja): 6月20日に誕生日を迎える。
- h069 (ja): 平成31年4月30日に退位された。
- h070 (ja): 毎月8日に点検を行う。
