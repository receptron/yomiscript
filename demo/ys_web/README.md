# demo/ys_web — ブラウザだけで動く YomiScript 音声合成デモ

YomiScript を入力すると、ブラウザ内（onnxruntime-web, WASM）で Kokoro-82M を動かして音声にします。日本語のアクセント記号による F0 上書きもブラウザ上で行います。YomiScript には各語を「どう発音させたいか」を書きます。

## 構成
- `web/index.html`, `web/ys.js`：デモ本体（YomiScript 変換・F0 上書き・推論）。`web/presets.json` に東京/大阪や言語混在の例
- `export_split.py`：Kokoro を `enc` / `f0n` / `dec` の 3 つの ONNX に分けて書き出す（F0 を間で差し替えるため）
- `quant.py`：軽量化。`python quant.py w16` で重みだけ fp16 で保存した版（計算は fp32）を `models_q/*_w16.onnx` に作成（既定で使用、計 約 163 MB）。`i8` は decoder の int8 試験
- `serve.py`：COOP/COEP ヘッダ付きのローカルサーバ（WASM マルチスレッドに必要）
- `qeval.py`：fp32 との品質比較（pyin F0 相関・mel 差）。`drift.py`：torch・Python ONNX・JS の区間ごとの比較
- `parity.mjs` / `node_test.mjs` / `pw_test.mjs` / `pw_bench.mjs` / `ort_check.py`：Python 版との一致確認、Node・Playwright での試験と速度計測

## 分割 ONNX の書き出し（Python 3.11）
```
pip install kokoro torch onnx
python export_split.py     # models/enc.onnx, f0n.onnx, dec.onnx（計 約 311 MB）を作成
```
声ファイルは `export_voices.py` で作ります。`voices-v1.0.bin`（`tts/kokoro_ys/README.md` の手順で取得）から、各声の style ベクトル (510, 1, 256) float32 を生バイト列で `voices/<名前>.bin` に書き出します。
```
python export_voices.py path/to/voices-v1.0.bin   # 既定でデモの 7 声
```
重みと声は `hexgrad/Kokoro-82M`（Apache-2.0）から自動取得されます。生成物はリポジトリに含めません。

## 実行
```
npm install
python quant.py w16
cd web && ln -s ../models models && ln -s ../voices voices && ln -s ../node_modules/onnxruntime-web/dist ort && cd ..
for f in enc_w16 f0n_w16 dec_w16; do ln -s ../models_q/$f.onnx models/$f.onnx; done
python serve.py 8000 web   # http://localhost:8000/ を開く
```
URL パラメータ：
- `?m=` モデル：`w16`（既定。重み fp16、計 約 163 MB）/ `fp32`（約 311 MB）/ `i8`（decoder の MatMul・Gemm を int8）
- `?t=` WASM スレッド数（既定 4。COOP/COEP ヘッダが必要なので `serve.py` で配信）
- `?ep=webgpu` WebGPU を試す（使えない環境では WASM に戻る）

目安（8 コア CPU、ヘッドレス Chromium、4 スレッド）：3.5 秒の音声を約 2.8 秒で合成（実時間比 約 0.8）。言語混在文は区間ごとに推論するため 約 1.2。
品質：重み fp16 版は fp32 と F0 相関 0.995 以上、Whisper の書き起こしも同じ。
速度計測：`node pw_bench.mjs 8000 "m=w16"`
