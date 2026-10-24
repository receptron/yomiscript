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

# 5. レイテンシ (旧デコード vs 新デコードを並べて表示, バッチ1 とバッチ推論)
python bench.py --ckpt ckpt/tiny_aug
```

## 推論の高速化 (#11)

`yomi.generate` は次の3つで高速化しています。出力トークン列は旧デコード・接頭辞全体を毎回計算する参照実装と同一です。

- 自己注意の KV キャッシュを固定長で確保し、毎ステップ新しい1トークン分だけ計算 (旧版は毎ステップ配列を連結)
- 交差注意のエンコーダ側 K/V を最初に1回だけ計算 (旧版は毎ステップ再計算)
- 1ステップ分のデコーダ関数を `mx.compile` (キャッシュ長は32刻みに丸めて再コンパイルを抑制)

旧デコードは `yomi.generate_legacy`、参照実装は `yomi.generate_nocache` として残しています。
チェックポイントの形式は変わっていないので、学習中・学習済みの `ckpt/tiny_aug` をそのまま使えます。

### Mac での計測コマンド

学習が終わってから (GPU を占有しない状態で) 実行してください。

```bash
cd mulmovoice && git pull && cd models/yomi/mlx
source .venv/bin/activate
python bench.py --ckpt ckpt/tiny_aug --device gpu
python bench.py --ckpt ckpt/tiny_aug --device cpu
python bench.py --ckpt ckpt/tiny_aug --device gpu --dtype bfloat16
python evaluate.py --ckpt ckpt/tiny_aug --out ckpt/tiny_aug/eval.json   # 精度が前回と同じことの確認
```

出力の `results` に `legacy` (旧) / `fast` (新, compileあり) / `fast_nocompile` (新, compileなし) が並びます。
`batch1` は1文ずつのレイテンシ、`batch32_ms_per_sent` は32文まとめた場合の1文あたり時間、
`identical_outputs_vs_first_mode` は旧デコードと同じ出力になった文の数です。

学習ステップの `mx.compile` は `python train.py ... --compile` で有効になります (loss は同一)。
Linux CPU では約5%遅かったため既定はオフです。Mac GPU での効果は未計測です。

### Linux CPU での実測 (x86_64, 8コア, mlx 0.32.4, float32)

学習済みでない重みでの計測で、出力は文末記号が出ずに最大長まで生成するため、実際より長い出力での数字です。

| モデル | 旧 中央値 | 新 中央値 (compileあり) | 新 (compileなし) | 高速化 |
|---|---|---|---|---|
| smoke (1.33M, n=50) | 73.2ms | 48.5ms | 52.3ms | 1.51倍 |
| tiny_aug と同じ形・乱数初期化 (7.11M, n=30) | 563.5ms | 213.1ms | 253.5ms | 2.64倍 |

Mac GPU での数字はまだ計測していません。

チェックポイントは `save_every` ごとに `ckpt/<名前>/` (model.safetensors, optimizer.safetensors, meta.json) に上書き保存します。

## 増量データ (aug v1) で学習する

JSUT 4,520文だけでは漢字の読みが足りないため、オープンなテキスト約30万文を pyopenjtalk でラベル付けした増量データを使います。
ソースとライセンスは [`aug/LICENSE_DATA.md`](aug/LICENSE_DATA.md)。

| ソース | 採用文数 | 備考 |
|---|---|---|
| Tatoeba | 99,985 | 蒸留 |
| Wikipedia (1シャード) | 98,481 | 蒸留 |
| 青空文庫 (新字新仮名 400作品) | 97,559 | うち 8,099文はルビで読みを修正 (`src: "ruby"`) |
| ルールセット | 2,122 × 5回 | 数字・日付・時刻・助数詞・略語 (`src: "rule"`) |
| 合計 `distill.jsonl` | 306,635行 | + JSUT train 4,520 / dev 200 |

### 方法A: 作成済みデータの tarball (約22MB)

[リリース yomi-aug-v1](https://github.com/receptron/mulmovoice/releases/tag/yomi-aug-v1) から取得して `data/` に展開します(リポジトリが非公開なので `gh` でダウンロード)。

```bash
cd mulmovoice && git pull && cd models/yomi/mlx
source .venv/bin/activate
mkdir -p data && gh release download yomi-aug-v1 -R receptron/mulmovoice -p yomi_aug_data_v1.tar.gz -D /tmp --clobber
tar xzf /tmp/yomi_aug_data_v1.tar.gz -C data
python train.py --config configs/tiny_aug.json --out ckpt/tiny_aug --distill
```

ライセンスは `aug/LICENSE_DATA.md` を参照(Wikipedia 由来部分は CC BY-SA)。

### 方法B: Mac 上で一から作る (pyopenjtalk が必要, 数GBのダウンロードは無し・約1GB)

```bash
cd mulmovoice && git pull && cd models/yomi/mlx
source .venv/bin/activate
uv pip install -r aug/requirements.txt     # pyopenjtalk, pyarrow
python aug/build_text.py                   # Tatoeba + Wikipedia 1シャード(約170MB) -> data/aug_text/*.txt
python aug/aozora.py --works 400           # 青空文庫 400作品 (0.3秒間隔で取得, 5〜6分)
python prepare_data.py --aug               # pyopenjtalk でラベル付け -> data/distill.jsonl, data/aug_stats.json
python train.py --config configs/tiny_aug.json --out ckpt/tiny_aug --distill
```

- 語彙が変わるので、前の `ckpt/tiny` から `--resume` はできません。新しい出力先で最初から学習します。
- `tiny_aug` は 60,000 step。Mac の前回実測 (約0.06秒/step) からの**推定**で1〜2時間 (文が長めなのでもっとかかる可能性あり)。
- オプション: `--aug-max N` (ソースごとの上限, 既定10万), `--rule-repeat N` (ルールセットの繰り返し, 既定5), `--workers N`。

### 正直な注意: 蒸留の天井

増量データの読みは pyopenjtalk の出力なので、モデルは **pyopenjtalk の誤りもそのまま学びます**。期待できるのは「JSUT だけの時より pyopenjtalk に近づく」ところまでで、
pyopenjtalk を超える根拠にはなりません (特に同形異音語: pyopenjtalk はハードセットで 51.4%)。超えるには、ルビのような人手の読み・文脈付き辞書 (KOE-IR) ・人手ラベルが必要です。
青空文庫のルビでは pyopenjtalk の読みが一致したのは 43,273個中 32,167個 (74.3%, 長音の違いを吸収したゆるい比較)。ルビには固有名詞や作家独自の読み (義訓) も含むので、一般文での誤読率そのものではありません。

- 検証 (Linux CPU): `prepare_data.py --aug` は8コアで約45秒、smoke config + `--distill` で200 step 学習 (train loss 3.31→2.66, dev loss 2.95→2.83, 約2.4秒/step)。Mac では未確認。

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
