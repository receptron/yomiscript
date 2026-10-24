# eval/ — 評価セットと指標（Issue #5, #6）

```
uv venv -p 3.11 .venv && uv pip install -p .venv -r eval/requirements.txt   # pyopenjtalk のビルドには cmake と C++ コンパイラが必要
.venv/bin/python eval/scripts/run_pyopenjtalk_baseline.py
```

- `data/jsut_basic5000_subset.jsonl`: JSUT BASIC5000 から取った280文。人手でつけた読み、アクセント核、アクセント句境界とポーズを含む（CC-BY-SA 4.0。`LICENSE_DATA.md` を参照）。
- `data/hard_set.tsv`: 手作りの難問70文（同形異音語35、頭字語12、数詞12、日付11）。**正解は暫定なので、人手レビューが必要。**
- `scripts/metrics.py`: 次の指標を計算する。
  - カナCER（厳密版と表記ゆれ正規化版）
  - 句境界のP/R/F1
  - アクセント核のP/R/F1
  - アクセント句の完全一致率
- `results/`: 測定結果のJSONと、誤り例のTSV。結果のまとめは `RESULTS.md`。
