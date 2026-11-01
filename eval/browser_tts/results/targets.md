Target words of eval/tts_readings/targets.tsv, read from the phoneme string Kokoro is given

| system | target words right (69) | sentences, all target words right (62) | sentence-level (score.mjs), same sentences | sentence-level, all 70 | words: homographs | words: acronyms | words: numbers | words: dates and times |
|---|---|---|---|---|---|---|---|---|
| claude (claude-opus-5-5) | 69/69 (100.0%) | 62/62 (100.0%) | 62/62 (100.0%) | 69/70 (98.6%) | 35/35 (100.0%) | 10/10 (100.0%) | 8/8 (100.0%) | 16/16 (100.0%) |
| codex (gpt-6.1-sol) | 69/69 (100.0%) | 62/62 (100.0%) | 62/62 (100.0%) | 70/70 (100.0%) | 35/35 (100.0%) | 10/10 (100.0%) | 8/8 (100.0%) | 16/16 (100.0%) |
| original Kokoro front end (misaki) | 22/69 (31.9%) | 19/62 (30.6%) | 18/62 (29.0%) | 23/70 (32.9%) | 20/35 (57.1%) | 0/10 (0.0%) | 1/8 (12.5%) | 1/16 (6.2%) |
| pyopenjtalk (= piper-plus front end) | 56/69 (81.2%) | 49/62 (79.0%) | 48/62 (77.4%) | 55/70 (78.6%) | 22/35 (62.9%) | 10/10 (100.0%) | 8/8 (100.0%) | 16/16 (100.0%) |

Words read wrong, close calls (best right and best misread equally far, or the reading not found as such), and words in sentences where the target-word and the sentence-level verdicts differ:

| sentence | text | system | word | verdict | reading found | margin | close call | sentence-level |
|---|---|---|---|---|---|---|---|---|
| h001 | シアトルの市では、魚が売られている。 | original Kokoro front end (misaki) | 市 | misread | シ | -2 |  | wrong |
| h001 | シアトルの市では、魚が売られている。 | pyopenjtalk (= piper-plus front end) | 市 | misread | シ | -2 |  | wrong |
| h006 | 一日から三日まで休みです。 | pyopenjtalk (= piper-plus front end) | 一日 | misread | イチニチ | -5 |  | wrong |
| h007 | 一日中ずっと雨だった。 | original Kokoro front end (misaki) | 一日中 | right | イチニチジュウ | 5 | yes | wrong |
| h009 | 舞台の上手から役者が登場した。 | pyopenjtalk (= piper-plus front end) | 上手 | misread | ジョオズ | -6 |  | wrong |
| h010 | 囲碁では彼の方が一枚上手だ。 | original Kokoro front end (misaki) | 上手 | misread | ジョオズ | -5 |  | wrong |
| h011 | この辺りは夜になると人気がない。 | original Kokoro front end (misaki) | 人気 | misread | ニンキ | -4 |  | wrong |
| h011 | この辺りは夜になると人気がない。 | pyopenjtalk (= piper-plus front end) | 人気 | misread | ニンキ | -4 |  | wrong |
| h014 | 彼は書道の大家として知られる。 | original Kokoro front end (misaki) | 大家 | misread | オオヤ | -4 |  | wrong |
| h014 | 彼は書道の大家として知られる。 | pyopenjtalk (= piper-plus front end) | 大家 | misread | オオヤ | -4 |  | wrong |
| h016 | 生物はお早めにお召し上がりください。 | original Kokoro front end (misaki) | 生物 | misread | セエブツ | -8 |  | wrong |
| h016 | 生物はお早めにお召し上がりください。 | pyopenjtalk (= piper-plus front end) | 生物 | misread | セエブツ | -8 |  | wrong |
| h018 | 一行は無事に山頂に着いた。 | original Kokoro front end (misaki) | 一行 | misread | イチギョオ | -5 |  | wrong |
| h019 | 最初の一行を読んでください。 | original Kokoro front end (misaki) | 一行 | misread | イッコオ | -5 |  | wrong |
| h019 | 最初の一行を読んでください。 | pyopenjtalk (= piper-plus front end) | 一行 | misread | イッコオ | -5 |  | wrong |
| h020 | 彼は辛いカレーが好きだ。 | original Kokoro front end (misaki) | 辛い | misread | ツライ | -3 |  | wrong |
| h020 | 彼は辛いカレーが好きだ。 | pyopenjtalk (= piper-plus front end) | 辛い | misread | ツライ | -3 |  | wrong |
| h023 | 目下の者にも丁寧に接する。 | original Kokoro front end (misaki) | 目下 | misread | モッカ | -5 |  | wrong |
| h023 | 目下の者にも丁寧に接する。 | pyopenjtalk (= piper-plus front end) | 目下 | misread | モッカ | -5 |  | wrong |
| h024 | 角を曲がるとパン屋がある。 | pyopenjtalk (= piper-plus front end) | 角 | misread | カク | -2 |  | wrong |
| h025 | 牛の角は意外と硬い。 | original Kokoro front end (misaki) | 角 | misread | カド | -4 |  | wrong |
| h025 | 牛の角は意外と硬い。 | pyopenjtalk (= piper-plus front end) | 角 | misread | カク | -5 |  | wrong |
| h026 | 寒気がするので早く寝る。 | original Kokoro front end (misaki) | 寒気 | misread | カンキ | -4 |  | wrong |
| h027 | 強い寒気が南下している。 | original Kokoro front end (misaki) | 寒気 | misread | サムケ | -4 |  | wrong |
| h027 | 強い寒気が南下している。 | pyopenjtalk (= piper-plus front end) | 寒気 | misread | サムケ | -4 |  | wrong |
| h028 | 何が欲しいの？ | original Kokoro front end (misaki) | 何 | misread | ナン | -1 |  | wrong |
| h029 | 何本ありますか。 | original Kokoro front end (misaki) | 何本 | misread | ナンポン | -1 |  | wrong |
| h030 | 色紙にサインをもらった。 | original Kokoro front end (misaki) | 色紙 | misread | イロガミ | -7 |  | wrong |
| h030 | 色紙にサインをもらった。 | pyopenjtalk (= piper-plus front end) | 色紙 | misread | イロガミ | -7 |  | wrong |
| h036 | SAPの導入を検討している。 | original Kokoro front end (misaki) | SAP | misread | - | -8 |  | wrong |
| h039 | AIの研究が進んでいる。 | original Kokoro front end (misaki) | AI | misread | - | -4 |  | wrong |
| h040 | USBメモリを差し込む。 | original Kokoro front end (misaki) | USB | misread | - | -9 |  | wrong |
| h041 | NASAが新しい探査機を打ち上げた。 | original Kokoro front end (misaki) | NASA | misread | - | -4 |  | wrong |
| h042 | JRの駅で待ち合わせる。 | original Kokoro front end (misaki) | JR | misread | - | -7 |  | wrong |
| h042 | JRの駅で待ち合わせる。 | pyopenjtalk (= piper-plus front end) | JR | right | ジェエアアル | 6 | yes | right |
| h043 | GPUを使ってモデルを学習する。 | original Kokoro front end (misaki) | GPU | misread | - | -9 |  | wrong |
| h044 | APIの仕様を確認する。 | original Kokoro front end (misaki) | API | misread | - | -7 |  | wrong |
| h045 | IoT機器が増えている。 | claude (claude-opus-5-5) | IoT | right | アイオオティイ | 6 | yes | right |
| h045 | IoT機器が増えている。 | codex (gpt-6.1-sol) | IoT | right | アイオオティイ | 6 | yes | right |
| h045 | IoT機器が増えている。 | original Kokoro front end (misaki) | IoT | misread | - | -6 |  | wrong |
| h045 | IoT機器が増えている。 | pyopenjtalk (= piper-plus front end) | IoT | right | アイオオティイ | 6 | yes | right |
| h046 | SNSで話題になった。 | original Kokoro front end (misaki) | SNS | misread | - | -9 |  | wrong |
| h047 | UNESCOの世界遺産に登録された。 | original Kokoro front end (misaki) | UNESCO | misread | - | -8 |  | wrong |
| h051 | 6本の鉛筆がある。 | original Kokoro front end (misaki) | 6本 | misread | ロクポン | -2 |  | wrong |
| h052 | 3匹の猫を飼っている。 | original Kokoro front end (misaki) | 3匹 | misread | サンピキ | -1 |  | wrong |
| h053 | 気温は25.5度まで上がった。 | original Kokoro front end (misaki) | 25.5度 | misread | ニジュウゴゴド | -3 |  | wrong |
| h053 | 気温は25.5度まで上がった。 | pyopenjtalk (= piper-plus front end) | 25.5度 | right | ニジュウゴテンゴド | 3 | yes | wrong |
| h054 | 8分後に出発する。 | original Kokoro front end (misaki) | 8分 | misread | ハチプン | -1 |  | wrong |
| h055 | 10本のバラを贈る。 | original Kokoro front end (misaki) | 10本 | misread | ジュウポン | -1 |  | wrong |
| h056 | 2人で旅行に行く。 | original Kokoro front end (misaki) | 2人 | misread | ニニン | -3 | yes | wrong |
| h057 | 1人で来てください。 | original Kokoro front end (misaki) | 1人 | misread | イチニン | -6 |  | wrong |
| h060 | 4月1日は入学式だ。 | original Kokoro front end (misaki) | 4月 | misread | ヨンガツ | -3 |  | wrong |
| h060 | 4月1日は入学式だ。 | original Kokoro front end (misaki) | 1日 | misread | イチニチ | -5 |  | wrong |
| h061 | 10月24日に会議がある。 | original Kokoro front end (misaki) | 24日 | misread | ニジュウヨンカ | -1 |  | wrong |
| h062 | 2026年10月20日に発売された。 | claude (claude-opus-5-5) | 20日 | right | ハツカ | 9 | yes | right |
| h062 | 2026年10月20日に発売された。 | codex (gpt-6.1-sol) | 20日 | right | ハツカ | 9 | yes | right |
| h062 | 2026年10月20日に発売された。 | original Kokoro front end (misaki) | 20日 | misread | ニジュウニチ | -9 |  | wrong |
| h062 | 2026年10月20日に発売された。 | pyopenjtalk (= piper-plus front end) | 20日 | right | ハツカ | 9 | yes | right |
| h063 | 5月5日はこどもの日です。 | original Kokoro front end (misaki) | 5日 | misread | ゴニチ | -7 |  | wrong |
| h064 | 7月7日は七夕だ。 | original Kokoro front end (misaki) | 7月 | misread | ナナガツ | -6 |  | wrong |
| h064 | 7月7日は七夕だ。 | original Kokoro front end (misaki) | 7日 | misread | ナナカ | -1 |  | wrong |
| h065 | 9時30分に集合です。 | original Kokoro front end (misaki) | 9時 | misread | キュウジ | -2 |  | wrong |
| h065 | 9時30分に集合です。 | original Kokoro front end (misaki) | 30分 | misread | サンジュウブン | -2 |  | wrong |
| h066 | 3月3日はひな祭りだ。 | original Kokoro front end (misaki) | 3月 | misread | サンツキ | -3 |  | wrong |
| h066 | 3月3日はひな祭りだ。 | original Kokoro front end (misaki) | 3日 | misread | サンヒ | -4 |  | wrong |
| h067 | 1月14日に出発した。 | original Kokoro front end (misaki) | 14日 | misread | ジュウヨンカ | -1 |  | wrong |
| h068 | 6月20日に誕生日を迎える。 | claude (claude-opus-5-5) | 20日 | right | ハツカ | 9 | yes | right |
| h068 | 6月20日に誕生日を迎える。 | codex (gpt-6.1-sol) | 20日 | right | ハツカ | 9 | yes | right |
| h068 | 6月20日に誕生日を迎える。 | original Kokoro front end (misaki) | 20日 | misread | ニジュウニチ | -9 |  | wrong |
| h068 | 6月20日に誕生日を迎える。 | pyopenjtalk (= piper-plus front end) | 20日 | right | ハツカ | 9 | yes | right |
| h069 | 平成31年4月30日に退位された。 | original Kokoro front end (misaki) | 4月 | misread | ヨンガツ | -3 | yes | wrong |
| h070 | 毎月8日に点検を行う。 | original Kokoro front end (misaki) | 8日 | misread | ハチニチ | -10 |  | wrong |
