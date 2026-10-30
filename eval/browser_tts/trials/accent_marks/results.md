# Accent-mark trial: results (`node score.mjs`)

| prompt | set | rep | valid | reading (hard: gold; ja: same as the original Kokoro) | kept | marked phrases | marks match ref | pitch follows ref: Kokoro | Kokoro, late ok | rules | halved |
|---|---|---|---|---|---|---|---|---|---|---|---|
| addmarks | hard | 1 | 70/70 | 98.6% (69) | 70/70 | 93.2% | 87.8% | 58.6% | 72.6% | 81.5% | 78.7% |
| addmarks | hard | 2 | 69/70 | 95.7% (67) | 69/70 | 93.8% | 89.3% | 59.1% | 72.4% | 79.9% | 76.3% |
| addmarks | hard | 3 | 69/70 | 97.1% (68) | 68/70 | 93.0% | 83.3% | 60.0% | 72.9% | 77.1% | 72.3% |
| addmarks | ja | 1 | 24/24 | 62.5% (15) | 24/24 | 93.7% | 90.0% | 61.5% | 72.3% | 86.2% | 83.1% |
| addmarks | ja | 2 | 24/24 | 66.7% (16) | 24/24 | 92.3% | 90.5% | 60.2% | 71.9% | 84.4% | 80.5% |
| addmarks | ja | 3 | 24/24 | 62.5% (15) | 24/24 | 92.0% | 88.3% | 62.8% | 73.6% | 84.5% | 79.8% |
| every | hard | 1 | 70/70 | 98.6% (69) | - | 78.8% | 87.2% | 60.0% | 72.7% | 75.9% | 72.1% |
| every | hard | 2 | 70/70 | 100.0% (70) | - | 83.9% | 85.0% | 59.2% | 72.0% | 74.8% | 71.7% |
| every | hard | 3 | 70/70 | 94.3% (66) | - | 93.0% | 84.9% | 59.8% | 73.0% | 77.2% | 73.3% |
| every | ja | 1 | 24/24 | 58.3% (14) | - | 92.4% | 89.4% | 62.3% | 73.1% | 87.7% | 83.1% |
| every | ja | 2 | 24/24 | 58.3% (14) | - | 85.5% | 91.4% | 65.4% | 75.4% | 87.7% | 84.6% |
| every | ja | 3 | 24/24 | 58.3% (14) | - | 76.1% | 93.1% | 65.4% | 75.4% | 87.7% | 84.6% |
| none | hard | 1 | 70/70 | 98.6% (69) | - | 0.0% | - | 58.6% | 72.6% | - | - |
| none | hard | 2 | 69/70 | 95.7% (67) | - | 0.0% | - | 59.1% | 72.4% | - | - |
| none | hard | 3 | 68/70 | 95.7% (67) | - | 0.0% | - | 60.1% | 72.5% | - | - |
| none | ja | 1 | 24/24 | 62.5% (15) | - | 0.0% | - | 61.5% | 72.3% | - | - |
| none | ja | 2 | 24/24 | 66.7% (16) | - | 0.0% | - | 60.2% | 71.9% | - | - |
| none | ja | 3 | 24/24 | 62.5% (15) | - | 0.0% | - | 62.8% | 73.6% | - | - |

## Readings that were wrong, and in which runs

- hard h001 シアトルの市では、魚が売られている。: every1, every3
- hard h005 今日の日本経済を論じる。: addmarks1, addmarks3, every3, none1, none3
- hard h009 舞台の上手から役者が登場した。: every3
- hard h010 囲碁では彼の方が一枚上手だ。: every3
- hard h029 何本ありますか。: addmarks2, none2
- hard h039 AIの研究が進んでいる。: addmarks2, none2
- ja brackets 『吾輩は猫である』は夏目漱石（なつめそうせき）の小説です。: addmarks1, addmarks2, addmarks3, every1, every2, every3, none1, none2, none3
- ja ka_question 明日は学校に行きますか？: addmarks1, addmarks3, every1, every2, every3, none1, none3
- ja kanji_names 鈴木さんと高橋さんは、京都の清水寺を訪れた。: addmarks1, addmarks2, addmarks3, every1, every2, every3, none1, none2, none3
- ja latin 新しいiPhoneとMacBookをOKしました。: addmarks1, addmarks2, addmarks3, every1, every2, every3, none1, none2, none3
- ja loanwords パーティーでファンがヴァイオリンを弾き、ウィーンのフォークダンスとクァルテットを楽しんだ。: addmarks1, addmarks2, addmarks3, every1, every2, every3, none1, none2, none3
- ja long 吾輩は猫である。名前はまだ無い。どこで生れたかとんと見当がつかぬ。何でも薄暗いじめじめした所でニャーニャー泣いていた事だけは記憶している。吾輩はここで始めて人間というものを見た。しかもあとで聞くとそれは書生という人間中で一番獰悪な種族であったそうだ。この書生というのは時々我々を捕えて煮て食うという話である。しかしその当時は何という考もなかったから別段恐しいとも思わなかった。ただ彼の掌に載せられてスーと持ち上げられた時何だかフワフワした感じがあったばかりである。掌の上で少し落ちついて書生の顔を見たのがいわゆる人間というものの見始であろう。この時妙なものだと思った感じが今でも残っている。第一毛をもって装飾されべきはずの顔がつるつるしてまるで薬缶だ。: addmarks1, addmarks2, addmarks3, every1, every2, every3, none1, none2, none3
- ja newline おはようございます。
今日もよろしくお願いします。: every1, every2, every3
- ja numbers 2026年10月29日の午後3時15分に、850円を払いました。: addmarks1, addmarks2, addmarks3, every1, every2, every3, none1, none2, none3
- ja q_ascii 本当にそれでいいの?: addmarks1, addmarks2, addmarks3, every1, every2, every3, none1, none2, none3
- ja wave_dash 営業時間は9時〜17時です。: addmarks1, addmarks2, addmarks3, every1, every2, every3, none1, none2, none3
