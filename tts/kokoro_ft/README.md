# tts/kokoro_ft — Kokoro アクセント記号の追加学習（実験・中止）

YomiScript のアクセント記号 `[ ] =` を Kokoro の未使用語彙（7, 8, 26、長さ 0）に割り当て、デコーダを固定して追加学習する実験コードです。アクセントは `tts/kokoro_ys` の F0 上書きですでに指定できるため、この実験は中止しました。記録として残しています。

- `ftlib.py` / `prep.py` / `train.py`：学習本体（日本語は JSUT を Kokoro に整列、fr/zh/en は蒸留）
- `ys_ja.py`：日本語 YomiScript → 音素（`../kokoro_ys` を参照）
- `build_distill.py`：蒸留データ作成（生成物 `distill_ph.json` は含めません）
- `smoke.py`：小さな動作確認、`mac_worker.py`：Mac での実行用

重みは `pip install kokoro torch` で `hexgrad/Kokoro-82M`（Apache-2.0）から取得します。JSUT はライセンス上、配布物に含めないでください。
