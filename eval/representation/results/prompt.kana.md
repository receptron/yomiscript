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
