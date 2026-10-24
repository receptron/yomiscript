# Yomi-0 MLX 試作版

日本語テキスト → **カナ読み + アクセント核 + 句境界** を出す小型の密な Transformer (エンコーダ・デコーダ, MoEなし, D2)。
入力は文字単位の語彙、出力は jsut-label `e2e_symbol` 形式のカナ+韻律記号列です。

```
入力: 水をマレーシアから買わなくてはならないのです。
出力: ^ミ[ズヲ#マ[レ]ーシアカラ#カ[ワナ]クテワ#ナ[ラ]ナイノデス$
記号: ^文頭 $文末 ?疑問 #アクセント句境界 _ポーズ [上昇 ]アクセント核
```

## サイズ (実測パラメータ数, 語彙は BASIC5000 由来の入力2639・出力91)

| config | d_model | enc/dec 層 | パラメータ |
|---|---|---|---|
| `configs/smoke.json` | 128 | 2/2 | 1.33M (動作確認用) |
| `configs/tiny.json` | 256 | 4/3 | 7.11M |
| `configs/small.json` | 384 | 6/4 | 21.30M |

## データ

- 人手ラベル: [jsut-label](https://github.com/sarulab-speech/jsut-label) BASIC5000。`eval/data/` の評価用280文は**除外**。残り4720文を train 4520 / dev 200 に分割 (seed固定)。ライセンスは `eval/LICENSE_DATA.md` 参照。
- 任意の蒸留 (`--distill-text`): 1行1文のオープンなテキストを pyopenjtalk でラベル付けして `data/distill.jsonl` に出力 (`source: "distill"`)。**蒸留なので品質は pyopenjtalk が上限**で、その誤読も学習します。量を増やして基礎を作る用途で、最終評価は人手ラベルで行います。
- `data/` と `ckpt/` は git に入れません。`prepare_data.py` が jsut-label を自動で clone して作ります。

4520文は小さいので、tiny/small は人手データだけだと過学習しやすいはずです (未検証)。

## Mac でのセットアップ (Apple Silicon)

```bash
git clone https://github.com/receptron/mulmovoice && cd mulmovoice/models/yomi/mlx
uv venv && source .venv/bin/activate      # uv がなければ: python3 -m venv .venv && source .venv/bin/activate
uv pip install -r requirements.txt         # または pip install -r requirements.txt
# 蒸留も使う場合: uv pip install pyopenjtalk
```

## コマンド

```bash
# 1. データ作成 (jsut-label を data/jsut-label に clone)
python prepare_data.py
#   蒸留を足す場合: python prepare_data.py --distill-text corpus.txt --distill-max 50000

# 2. 学習
python train.py --config configs/tiny.json  --out ckpt/tiny
python train.py --config configs/small.json --out ckpt/small --dtype bfloat16
#   蒸留データを混ぜる: --distill   途中から再開: --resume   ステップ数上書き: --steps N

# 3. 推論
python infer.py --ckpt ckpt/tiny "今日は良い天気です。"
python infer.py --ckpt ckpt/tiny --plain < sentences.txt

# 4. 評価 (eval/ の JSUT 280文 + ハードセット70文)
python evaluate.py --ckpt ckpt/tiny --out ckpt/tiny/eval.json

# 5. レイテンシ (1文ずつ, バッチ1)
python bench.py --ckpt ckpt/tiny
python bench.py --ckpt ckpt/tiny --dtype bfloat16
```

チェックポイントは `save_every` ごとに `ckpt/<名前>/` (model.safetensors, optimizer.safetensors, meta.json) に上書き保存します。

## 所要時間の目安 (**推定・未計測**)

M1〜M3 クラスの Mac (GPU) を想定した大まかな見積もりです。実測ではありません。

| 作業 | 目安 |
|---|---|
| prepare_data.py (蒸留なし) | 1分未満 |
| 蒸留 5万文 | 5〜15分 |
| tiny 20,000 step | 30分〜1.5時間 |
| small 40,000 step | 2〜5時間 |
| evaluate.py | 1〜3分 |

## 検証状況

Linux CPU (x86_64, `mlx[cpu]` 0.32.4) で次を実行して動作を確認しました。**Mac (Metal GPU) では未確認です。**

- prepare_data.py: 4720文 (280文除外) を作成、蒸留3文のテストも成功
- smoke config で 300 step 学習: train loss 3.34 → 2.60、dev loss 2.83 → 2.64 (約2秒/step, 計598秒)
- 推論・評価・ベンチ・`--resume`・`--dtype bfloat16` が最後まで動くこと
- smoke モデルの精度はほぼゼロ (JSUT 文正解 0%) で、**コードが通ることの確認だけ**です。精度は Mac で tiny/small を学習して測ってください。

## 注意

- 韻律の評価は出力のカナ+記号列を文字単位で整列して比較します。pyopenjtalk ベースライン (音素単位) と数値は近いはずですが、手順は厳密には同じではありません。
- デコードは貪欲法 + KV キャッシュ。8bit 量子化での配布 (D3) とメモリ層 (MoLD) はまだ入っていません。
