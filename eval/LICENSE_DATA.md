# 評価データのライセンス

## data/jsut_basic5000_subset.jsonl
- 出典: [sarulab-speech/jsut-label](https://github.com/sarulab-speech/jsut-label) の `text_kana/basic5000.yaml` と `e2e_symbol/{katakana,phoneme}.yaml`（JSUT BASIC5000、等間隔に抽出した280文）。
- jsut-label の LICENCE.txt によると、本文は改変され、発音情報が付け加えられている。本文の出典とライセンスは次のとおり。
  - Wikipedia: CC-BY-SA 3.0
  - 田中コーパス: CC-BY 2.0
  - JSUT: CC-BY-SA 4.0
- 継承条項（SA）があるので、このファイルも **CC-BY-SA 4.0** で再配布する（クレジット: 東京大学 猿渡研究室 JSUT / jsut-label、Wikipedia 寄稿者、田中コーパス）。リポジトリ本体の Apache-2.0 は適用されない。
- 再生成: `python eval/scripts/prepare_jsut.py <jsut-labelのclone>`
- 音声（wav）は含めていない。

## data/hard_set.tsv
- mulmovoice プロジェクトが作成。CC BY 4.0。
- **正解読みは暫定。人手レビューが必要。**
