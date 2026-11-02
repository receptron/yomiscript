"""The JSUT BASIC5000 sentences and their hand-annotated accent (jsut-label, sarulab-speech) for eval/jsut_accent.

Usage: python prepare.py [path to a clone of https://github.com/sarulab-speech/jsut-label]   (default ~/yomi_tts/jsut-label)
Writes data/items.json (gitignored: the texts and labels are under CC BY-SA, see eval/LICENSE_DATA.md): each sentence
whose text and reading are the same at every correction level (as eval/scripts/prepare_jsut.py), in id order, with
its katakana and prosody symbols (e2e_symbol/katakana.yaml: [ rise, ] fall, # accent phrase boundary, _ pause).
"""

import json
import sys
from pathlib import Path

import yaml

root = Path(sys.argv[1] if len(sys.argv) > 1 else Path.home() / "yomi_tts/jsut-label")
tk = yaml.safe_load(open(root / "text_kana/basic5000.yaml", encoding="utf-8"))
kata = yaml.safe_load(open(root / "e2e_symbol/katakana.yaml", encoding="utf-8"))
out = []
for k in sorted(tk):
    e = tk[k]
    if e.get("text_level0") != e.get("text_level2") or e.get("kana_level0") != e.get("kana_level3"):
        continue
    out.append({"name": k, "text": e["text_level0"], "lang": "ja", "gold": kata[k]})
p = Path(__file__).resolve().parent / "data/items.json"
p.parent.mkdir(exist_ok=True)
p.write_text(json.dumps(out, ensure_ascii=False, indent=0), encoding="utf-8")
print(len(out), "sentences ->", p)
