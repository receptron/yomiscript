"""jsut-label (sarulab-speech) から評価用サブセットを作る。

使い方: git clone https://github.com/sarulab-speech/jsut-label /tmp/jsut-label
        python eval/scripts/prepare_jsut.py /tmp/jsut-label
テキスト・読み・韻律記号は CC-BY-SA 系ライセンス (LICENSE_DATA.md 参照)。
"""
import json, sys, yaml
from pathlib import Path

root = Path(sys.argv[1])
STEP = 16  # 5000文から等間隔に抽出 (決定的)
tk = yaml.safe_load(open(root / "text_kana/basic5000.yaml", encoding="utf-8"))
kata = yaml.safe_load(open(root / "e2e_symbol/katakana.yaml", encoding="utf-8"))
ph = yaml.safe_load(open(root / "e2e_symbol/phoneme.yaml", encoding="utf-8"))
out = []
for i, k in enumerate(sorted(tk)):
    if i % STEP:
        continue
    e = tk[k]
    # 本文と読みの修正レベル間で差がない文だけ使う (音声とのズレ由来のあいまいさを避ける)
    if e.get("text_level0") != e.get("text_level2") or e.get("kana_level0") != e.get("kana_level3"):
        continue
    out.append({"id": k, "text": e["text_level0"], "kana_prosody": kata[k], "phoneme_prosody": ph[k]})
p = Path(__file__).resolve().parents[1] / "data/jsut_basic5000_subset.jsonl"
with open(p, "w", encoding="utf-8") as f:
    for r in out:
        f.write(json.dumps(r, ensure_ascii=False) + "\n")
print(len(out), "sentences ->", p)
