# 増量データのソースとライセンス (Yomi-0 aug v1)

データ本体はリポジトリに入れません (`aug/build_text.py`・`aug/aozora.py`・`prepare_data.py --aug` で再生成、またはリリースの tarball)。

| ソース | 取得元 | ライセンス | 使い方 |
|---|---|---|---|
| Wikipedia 日本語版 (2023-11-01) | HF `wikimedia/wikipedia` 20231101.ja シャード 14/15 | CC BY-SA 4.0 (と GFDL) | 本文段落の文を pyopenjtalk で蒸留 |
| Tatoeba 日本語文 | downloads.tatoeba.org per_language/jpn | CC BY 2.0 FR (一部 CC0) | 文を pyopenjtalk で蒸留 |
| 青空文庫 (著作権切れ・新字新仮名の400作品) | aozora.gr.jp 作品テキスト (ルビ付き zip) | パブリックドメイン (青空文庫の取り扱い規準に従う) | ルビを正解の読みの制約に使って蒸留 |
| ルールセット (`aug/rules.py`) | mulmovoice 作成 | CC BY 4.0 | 数字・日付・時刻・助数詞・略語の例 |
| ラベル付け | pyopenjtalk / OpenJTalk (Modified BSD), 辞書 NAIST-JDIC 系 (BSD) | — | 読み・アクセント・句境界の付与 |

注意:
- Wikipedia 由来の文を含むため、データセット (tarball) を再配布する場合は **CC BY-SA 4.0 の継承条件**がかかります。出典: Wikipedia 日本語版の各記事の執筆者。
- Tatoeba の文は CC BY 2.0 FR。出典: Tatoeba (https://tatoeba.org) の投稿者。
- 学習済みモデルの重みにどのライセンス条件が及ぶかは法的に未確定です。公開前に確認してください。
- 評価セット (`eval/data/` の JSUT 280文・ハードセット70文) と一致・包含する文は除外済み。ハードセットに出てくる略語はルールセットでは使っていません。
