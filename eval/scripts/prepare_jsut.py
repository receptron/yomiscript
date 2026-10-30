"""Build the evaluation subset from jsut-label (sarulab-speech).

Usage: git clone https://github.com/sarulab-speech/jsut-label /tmp/jsut-label
       python eval/scripts/prepare_jsut.py /tmp/jsut-label
The texts, readings and prosody symbols are under a CC-BY-SA family license (see LICENSE_DATA.md).
"""

import json
import sys
from pathlib import Path

import yaml

root = Path(sys.argv[1])
STEP = 16  # pick evenly spaced sentences from the 5000 (deterministic)
tk = yaml.safe_load(open(root / "text_kana/basic5000.yaml", encoding="utf-8"))
kata = yaml.safe_load(open(root / "e2e_symbol/katakana.yaml", encoding="utf-8"))
ph = yaml.safe_load(open(root / "e2e_symbol/phoneme.yaml", encoding="utf-8"))
out = []
for i, k in enumerate(sorted(tk)):
    if i % STEP:
        continue
    e = tk[k]
    # use only sentences whose text and reading do not differ between correction levels (avoids ambiguity from mismatches with the audio)
    if e.get("text_level0") != e.get("text_level2") or e.get("kana_level0") != e.get("kana_level3"):
        continue
    out.append({"id": k, "text": e["text_level0"], "kana_prosody": kata[k], "phoneme_prosody": ph[k]})
p = Path(__file__).resolve().parents[1] / "data/jsut_basic5000_subset.jsonl"
with open(p, "w", encoding="utf-8") as f:
    for r in out:
        f.write(json.dumps(r, ensure_ascii=False) + "\n")
print(len(out), "sentences ->", p)
