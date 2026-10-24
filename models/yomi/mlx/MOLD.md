# MoLD (Memory-of-Language/Domain) 試作 — Yomi-0 (issue #8, H12)

「共有の重み」＋「差し替えられる Memory」で、読みの知識を後から足し替えできるようにする試作です。
辞書の形式は **YomiScript（旧 KOE-IR）の `.koedict`** だけです。他の辞書は必ず先に `.koedict` に変換します。

## 2種類の Memory

| | 辞書メモリ (LexMemory) | 学習型メモリ層 (ProductKeyMemory) |
|---|---|---|
| 作り方 | `.koedict` をコンパイル（**学習なし・決定的**） | 学習（共有重みを凍結してメモリだけ学習も可） |
| 中身 | key = 表層形（＋文脈条件）, value = 読み | n_keys² 個のスロット（key/value）。トークンごとに top-k を読む |
| 置き場所 | エンコーダ入力の前（該当スパンを読みカナに置換） | エンコーダ層の残差（`model.memory.layers`） |
| 差し替え | `MemoryRouter.add()/remove()`、`infer.py --dict` | `*.mem.safetensors` を `--memory` で読み込み |
| 用途 | 人名・固有名詞・専門用語・方言語彙 | 方言/ドメインの「癖」（アクセント傾向など） |

辞書メモリは読み（カナ）を確定させ、モデルはそのカナを写してアクセントと境界だけを予測します。
学習型メモリ層の値は **0 で初期化**するので、tiny_aug のような既存のチェックポイントに足しても最初は出力が変わりません（後方互換）。

## 読みの優先順位
1. その場の注記 `{梨奈|りいな}`
2. 文脈が一致する辞書の項目（`[context: 女性]` / `--sex female` / 文中の文脈語）
3. `[default]`
4. 条件のない先頭の項目
5. モデル自身の予測

## レイヤー構成（同じ表層形なら上のレイヤーが勝つ）
```
user   (100)  ユーザーの .koedict（dict/names/*.koedict など）
clean  ( 50)  青空文庫ルビ・人手で確認した読み
base   (  0)  pyopenjtalk(NAIST-jdic) から変換した .koedict  ※ローカル専用・コミットしない
```
`.koedict` の先頭に `# layer: base|clean|user` と `# scope: always|name` を書いて指定します（既定は user）。
`scope: name` の辞書（`dict/names/` 以下は自動でこれになる）は、人名らしい位置にしか使いません。人名らしい位置とは、敬称（さん・くん・様…）の直前と、苗字と名前が並んだところです。
これで「正しい」の「正」が人名読みのタダシになる誤りを防ぎます。

### pyopenjtalk の辞書を base にする
pyopenjtalk の辞書は NAIST-jdic 由来（BSD 系。再配布するなら表示義務の確認が必要）なので、リポジトリには入れません。
`tools/pyopenjtalk_to_koedict.py` は手元のコーパスを pyopenjtalk で解析し、漢字を含む形態素の「表層 → 最も多い読み」を集めて `mem/base_pyopenjtalk.koedict` に書き出します（`mem/` は .gitignore 済み）。
その上に青空ルビ（clean）とユーザー辞書（user）を重ねて、base の読みを上書き・修正します。
pyopenjtalk の読みとモデルの出力や他のレイヤーを突き合わせる「不一致チェック」にも使えます（#16 の LLM 照合の前段）。

## モード
- fixed: `--dialect kansai` で `@lexicon(dialect: kansai)` を使う。学習型メモリは `--memory` で選ぶ
- auto: `mold.detect_mode()` で入力から推定（今は簡単な規則だけ）
- 明示的な指定が常に auto に勝ちます

## 実装ファイル
- `mold.py`: `.koedict` パーサ、`LexMemory`、`MemoryRouter`、`ProductKeyMemory`、`save_memory/load_memory`
- `yomi.py`: `config.model.memory` があればエンコーダ層にメモリ層を挿す。`load(..., memory=)`、`predict(..., router=, context=)`
- `train.py`: `--init`（既存の重みから開始）、`--memory-only`（メモリ層だけ学習）、`--save-memory`
- `infer.py`: `--dict`、`--sex`、`--context`、`--dialect`、`--memory`、`--show`
- `mold_demo.py`: 辞書メモリのあり/なしでの読み比べと遅延の計測
- `tools/pyopenjtalk_to_koedict.py`、`tests/test_mold.py`
- `configs/mold_smoke.json`（動作確認用）、`configs/mold_tiny.json`（tiny_aug と同じ形＋メモリ層）

## Mac で試すコマンド
```bash
cd mulmovoice && git pull
cd models/yomi/mlx
pip install pytest && python -m pytest -q tests          # 単体テスト

# 1) 辞書メモリだけ（学習なし。いまの tiny_aug でそのまま使えます）
python mold_demo.py --ckpt ckpt/tiny_aug
python infer.py --ckpt ckpt/tiny_aug --show --sex female \
  --dict ../../../dict/names/surnames.koedict --dict ../../../dict/names/given_names.koedict \
  "佐藤光さんが来た。" "智さんに会った。"

# 2) pyopenjtalk を base レイヤーにする（任意。出力はコミットしない）
mkdir -p mem && python tools/pyopenjtalk_to_koedict.py --text data/train.jsonl --out mem/base_pyopenjtalk.koedict
python mold_demo.py --ckpt ckpt/tiny_aug --extra mem/base_pyopenjtalk.koedict

# 3) 学習型メモリ層: tiny_aug の重みから始めて追加学習（メモリ層は0初期化）
python train.py --config configs/mold_tiny.json --init ckpt/tiny_aug --out ckpt/mold_tiny --distill \
  --save-memory ckpt/mold_tiny/default.mem.safetensors
python evaluate.py --ckpt ckpt/mold_tiny
python bench.py --ckpt ckpt/mold_tiny

# 3') 共有重みを凍結してメモリ層だけ学習（ドメイン/方言メモリを作る例）
python train.py --config configs/mold_tiny.json --init ckpt/mold_tiny --memory-only --steps 3000 \
  --out ckpt/mold_mem_x --save-memory mem/x.mem.safetensors
python infer.py --ckpt ckpt/mold_tiny --memory mem/x.mem.safetensors "今日は良い天気です。"
```
（`evaluate.py` と `bench.py` の引数は今までと同じです。）

## 今後
- YomiScript に `[sex: male|female]` を正式に追加（今は `[context: 男性]` で代用）
- 辞書メモリを、ソース置換ではなく「読み埋め込みへのクロスアテンション」にする（アクセントまで辞書から渡せる）
- 非自己回帰の 1 パス出力（10 ms/文の目標）と組み合わせる

## Linux 箱での動作確認（2026-10-24, MLX 0.32.4 CPU）
- 単体テスト 5 件はすべて通過。内容は優先順位（注記＞文脈＞default）、性別の文脈、人名スコープ（「正しい」は置換しない）、レイヤーの上書き、`.koedict` 以外を受け付けないこと、メモリ値が0なら出力が同一であること（後方互換）、メモリの保存と差し替え、高速デコードと参照デコードの一致。
- `mold_smoke`（1.76M パラメータ、メモリ層1つ）を CPU で 300 ステップ学習（1151 秒、dev loss 2.79）。この箱では学習1ステップが約2.2秒と遅く、モデル自体はまだ意味のある読みを出せません。辞書による読みの改善は Mac の tiny_aug で確認してください。
- 辞書メモリの解決は狙いどおりに動きました。梨奈→リナ（default）、智→トモ（女性）/サトシ（男性）、佐藤光→サトウ＋ヒカリ（女性）/ヒカル（男性）、朝市の市→イチ（context）、`{梨奈|りいな}`→リイナ（注記）。
- 遅延: `router.resolve` は 1 文あたり 0.028 ms。学習型メモリ層の学習コストは、同じ形の比較で +1% 程度でした（CPU）。

## 修正 (Mac での tiny_aug 確認を受けて)
1. **長音の正規化**: 辞書の読みを差し込む時に、学習ラベル（pyopenjtalk の pron 形）に合わせて o段+ウ→ー、e段+イ→ー に変えます（サトウ→サトー、ケイ→ケー）。`mold.to_pron`。`MemoryRouter(normalize=False)` で無効にできます。その場の注記も同じ規則で変換します。
2. **苗字と名前の句境界**: 苗字と名前が並んで置換されたとき、出力の中で 2 つの読みの継ぎ目に `#` を入れ、名前を別のアクセント句にします（`split_name_phrases`）。名前の 1 モーラ目の後に `]` も `[` もなければ `[` を足します。pyopenjtalk の 佐藤光 は `サ]トー#ヒ[カリ]ガ` です。`split_names=False` で無効にできます。
3. **語の途中は置換しない**: always 辞書の候補は、全レイヤーを通して「長い一致 > 上位レイヤー」の順に選びます。さらにスパンが形態素の境界に揃っているときだけ使います。境界は pyopenjtalk が入っていればそれで判定し、無ければ「前後が漢字でない」という簡易規則を使います。これで 朝市 の中の 市 は置換せず、独立した 市 だけを文脈で イチ にします（市役所 も置換しません）。base レイヤー（pyopenjtalk 変換）に 朝市 があれば、その長い一致が勝ちます。

確認コマンド (Mac):
```bash
git pull && cd models/yomi/mlx && python -m pytest -q tests
python mold_demo.py --ckpt ckpt/tiny_aug
python infer.py --ckpt ckpt/tiny_aug --show --sex female --dict ../../../dict/sample.koedict \
  --dict ../../../dict/names/surnames.koedict --dict ../../../dict/names/given_names.koedict \
  "佐藤光さんが来た。" "朝市の市で魚を買う。" "市役所に行く。"
```

## 名前学習データ（aug/names.py）

佐藤光が `^サ[トー#ヒ]カリ` になる問題（正解は pyopenjtalk の `サ]トー#ヒ[カリ`）は、モデルが名前を含む文を学習していないことが原因。そこで、名前を含む文を合成して学習データに足す。

- 元データ: `dict/names/surnames_top200.csv` と `given_names_by_generation.csv`。名は（表記, 読み, 性別）を1件として扱う。
- `is_estimated` が付いた行の扱いは `--estimated` で選ぶ。`skip` は使わない、`down`（既定）は重み0.3で使う、`keep` はそのまま使う。
- テンプレート: フルネーム、名だけ、姓だけ。敬称は さん/様/くん/ちゃん/氏 などから性別に合わせて選ぶ。名前は主語の位置と目的語の位置の両方に置き、彼/彼女 のような手がかり語も入れる。
- ラベル: アクセントと句境界は pyopenjtalk で付ける。名前の読みは辞書の読みに強制し、生成後に読みが一致するか検証する。名前が形態素境界に合わない文は捨てる。
- 名前の約10%は学習に使わない（unseen）。評価セットは `names_eval_seen` と `names_eval_unseen` の2つ。
- 評価（eval_names.py）は各セットについてメモリなしとメモリあり（姓と名の辞書を使い、性別を context として渡す）の両方で行う。指標は name_reading_acc、name_prosody_exact（名前部分の読みとアクセントが完全一致した割合）、sent_kana_acc、boundary_f1、accent_f1。
- `data/` は git に入れない。データは各自で生成する。

## base 層の変換器（tools/pyopenjtalk_to_koedict.py）

コーパスを pyopenjtalk で解析し、漢字を含む形態素ごとに最も多く出た読みとアクセントを `表記 = 読み [accent: N];` の形で出力する。ほかの読みはコメントとして残す。ヘッダは `# layer: base` と `# scope: always`。出力先は `mem/`（gitignore 済み）で、NAIST-jdic 由来のためコミットしない。

## Mac での実行手順（名前）

```bash
python aug/names.py --out data/names --n-train 30000 --n-eval 1000
python eval_names.py --ckpt ckpt/tiny_aug                       # 学習前（メモリなし/あり）
python train.py --config configs/tiny_aug_names.json --init ckpt/tiny_aug --out ckpt/tiny_aug_names \
  --distill --extra data/names/names_train.jsonl --extra-repeat 2
python eval_names.py --ckpt ckpt/tiny_aug_names                 # 学習後（メモリなし/あり）
python evaluate.py --ckpt ckpt/tiny_aug_names                   # 一般文で劣化していないか確認
python tools/pyopenjtalk_to_koedict.py --text data/train.jsonl data/distill.jsonl --out mem/base_pyopenjtalk.koedict --min-count 2
```

`--init` を使うときは初期化元の語彙を引き継ぐ。重みの形が合わない場合は学習を始めずにエラーで止まる。
