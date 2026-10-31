"""Which references read their text right: only those are used by the score (results/refcheck.json).

Each reference is transcribed by Whisper twice, as usual and with a prompt in hiragana (so that it writes what it
hears in kana rather than choosing a kanji: 市 read いち or し looks the same in kanji). A transcript is turned into
katakana by pronunciation (pyopenjtalk, asr_score.py's normalization) and compared with the gold reading (hard set),
the text's OpenJTalk reading (parity texts) or JSUT's hand-checked kana (the JSUT sentences). A reference is kept
when either transcript matches exactly: Whisper's own mistakes can only drop a reference, never let a misreading in.

usage: .venv/bin/python refcheck.py   (cached by file: results/asr.json)
"""

import json
import sys
from pathlib import Path

import mlx_whisper

HERE = Path(__file__).parent
JSUT_KANA = Path.home() / "yomi_tts/jsut-label/text_kana/basic5000.yaml"
sys.path.insert(0, str(HERE.parent / "browser_tts"))
from asr_score import heard, norm

MODEL = "mlx-community/whisper-large-v3-turbo"
KANA_PROMPT = "きょうは いい てんきですね。しやくしょは えきの ちかくに あります。いちばで さかなを かいました。"


def expected():
    # item -> the readings counted as right, normalized
    out = {}
    for line in (HERE.parent / "data/hard_set.tsv").read_text().splitlines():
        if line and not line.startswith("#"):
            name, _, text, gold = line.split("\t")[:4]
            out[f"hard.{name}"] = {norm(g) for g in gold.split("|")}
    for x in json.loads((HERE.parent / "kokoro_parity/texts_ja.json").read_text()):
        out[f"ja.{x['name']}"] = {heard(x["text"])}
    name = None
    for line in JSUT_KANA.read_text().splitlines():
        if line.startswith("BASIC5000_"):
            name = line.rstrip(":")
        elif line.strip().startswith("kana_level0:") and name:
            out[f"jsut.{name}"] = {norm(line.split(":", 1)[1].strip())}
    return out


def transcribe(asr, f):
    # [as usual, with the kana prompt], cached
    k = str(f.relative_to(HERE))
    if k not in asr:
        asr[k] = [
            mlx_whisper.transcribe(str(f), path_or_hf_repo=MODEL, language="ja")["text"].strip(),
            mlx_whisper.transcribe(str(f), path_or_hf_repo=MODEL, language="ja", initial_prompt=KANA_PROMPT)["text"].strip(),
        ]
    return asr[k]


def main():
    cache = HERE / "results/asr.json"
    cache.parent.mkdir(exist_ok=True)
    asr = json.loads(cache.read_text()) if cache.exists() else {}
    gold, out = expected(), {}
    for d in sorted((HERE / "audio/ref").iterdir()):
        out[d.name] = {}
        for f in sorted(d.glob("*.wav")):
            texts = transcribe(asr, f)
            got = [heard(t) for t in texts]
            out[d.name][f.stem] = {"ok": any(g in gold[f.stem] for g in got), "heard": got}
        cache.write_text(json.dumps(asr, ensure_ascii=False, indent=0))
        n = sum(v["ok"] for v in out[d.name].values())
        print(f"{d.name}: {n} of {len(out[d.name])} read right")
    (HERE / "results/refcheck.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
