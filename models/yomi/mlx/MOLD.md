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
