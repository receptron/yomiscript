# tts/kokoro_ys — YomiScript → Kokoro-82M 音声合成（参照実装）

YomiScript だけを入力にして音声を作る参照実装です。テキスト解析（misaki の前段）は使わず、YomiScript の記号を Kokoro の音素列とピッチの指示に直します。YomiScript には各語を「どう発音させたいか」を書きます。

## 主なファイル
- `ys2kokoro.py` / `ys2kokoro_v2.py` / `misaki_hepburn.py`：YomiScript → Kokoro 音素（misaki 形式 IPA）の変換
- `pitch_v3.py` / `prosody_v4.py`：アクセント記号から F0 を作り、Kokoro の予測ピッチを置き換える（長さは Kokoro のまま）
- `mix.py`：言語タグ `{lang|...}` ごとの合成方針（ja は F0 上書き、en/fr は Kokoro 自身のピッチ、区間ごとに合成して連結、1 語だけの外国語区間はその言語の声のみで読ませる）。`mix5〜8.py`, `mix_v4.py` は途中版
- `osaka.py` / `osaka_n.py`：東京式と大阪式（`^ja-x-osaka|`、`=` 高起式）の読み比べ
- `run.py` / `run_v2.py`：4 言語のサンプル生成
- `wh*.py` / `whisper*.json`：Whisper（small）による言語判定・書き起こし評価とその結果

## 準備
Kokoro-82M（Apache-2.0, hexgrad）の重みと声を、このディレクトリに置きます（リポジトリには含めません）。
```
pip install kokoro-onnx soundfile numpy
curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
```
`prosody_v4.py` など F0 上書きを使うものは PyTorch 版も必要です（Python 3.11 推奨）：`pip install kokoro torch`（重みは `hexgrad/Kokoro-82M` から自動取得）。

## 実行
このディレクトリで実行します（パスは相対）。
```
python run_v2.py      # 4 言語サンプル
python mix.py         # 言語混在文
python osaka_n.py     # 東京・大阪の読み比べ
```
