# demo/ys_web — ブラウザだけで動く YomiScript 音声合成デモ

YomiScript を入力すると、ブラウザ内（onnxruntime-web, WASM）で Kokoro-82M を動かして音声にします。日本語のアクセント記号による F0 上書きもブラウザ上で行います。YomiScript には各語を「どう発音させたいか」を書きます。

## 構成
- `web/index.html`, `web/ys.js`：デモ本体（YomiScript 変換・F0 上書き・推論）。`web/presets.json` に東京/大阪や言語混在の例
- `export_split.py`：Kokoro を `enc` / `f0n` / `dec` の 3 つの ONNX に分けて書き出す（F0 を間で差し替えるため）
- `quant.py`：軽量化の試験（fp16/int8。現状は日本語ピッチが崩れるため fp32 を使用）
- `parity.mjs` / `node_test.mjs` / `pw_test.mjs` / `ort_check.py`：Python 版との一致確認、Node・Playwright での試験

## 分割 ONNX の書き出し（Python 3.11）
```
pip install kokoro torch onnx
python export_split.py     # models/enc.onnx, f0n.onnx, dec.onnx（計 約 311 MB）を作成
```
声は Kokoro-82M の `voices/<名前>.pt` から style ベクトル（float32, 510×256）を取り出し、生の float32 として `voices/<名前>.bin`（例 `af_heart.bin`, `jf_alpha.bin`）に保存します。
重みと声は `hexgrad/Kokoro-82M`（Apache-2.0）から自動取得されます。生成物はリポジトリに含めません。

## 実行
```
npm install
cd web && ln -s ../models models && ln -s ../voices voices && ln -s ../node_modules/onnxruntime-web/dist ort
python3 -m http.server 8000   # http://localhost:8000/ を開く
```
注意：初回読み込みが重く（約 311 MB）、合成は音声の長さの約 3 倍の時間がかかります。
