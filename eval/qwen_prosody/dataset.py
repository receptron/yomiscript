"""The Hugging Face dataset of the generated speech: every clip of both passes as FLAC, with its text, YomiScript,
the reading check and, for the clips read right, the prosody of data/jsut_qwen_clone.jsonl.

Layout (Hugging Face's audiofolder): work/hf/README.md (the dataset card, from dataset_card.md), work/hf/metadata.jsonl
(one row per clip; `file_name` is the audio's path), work/hf/audio/{text,kana}/<JSUT id>.flac. Uploading is a step
of its own (README.md, "Dataset").

usage: ../prosody_ref/.venv/bin/python dataset.py   (after extract.py)   -> work/hf/
"""

import json
import shutil
from pathlib import Path

import soundfile as sf

HERE = Path(__file__).resolve().parent
OUT = HERE / "work/hf"
PASSES = {"text": ("work/audio", "work/items.json"), "kana": ("work/audio_kana", "work/items_kana.json")}
PROSODY = ["units", "f0", "spans", "pauses", "gaps", "align"]


def load(rel):
    p = HERE / rel
    return json.loads(p.read_text()) if p.exists() else None


def rows():
    """one row per clip, with its FLAC written"""
    kept = {(r["name"], r["given"]): r for r in map(json.loads, (HERE / "data/jsut_qwen_clone.jsonl").read_text().splitlines())}
    asr = load("work/asr.json") or {}
    for given, (folder, items_file) in PASSES.items():
        for x in load(items_file) or []:
            wav = HERE / folder / f"{x['name']}.wav"
            if not wav.exists():
                continue
            rel = f"audio/{given}/{x['name']}.flac"
            y, sr = sf.read(wav)
            (OUT / rel).parent.mkdir(parents=True, exist_ok=True)
            sf.write(OUT / rel, y, sr, format="FLAC")
            r = kept.get((x["name"], given))
            heard = asr.get(("kana/" if given == "kana" else "") + x["name"])
            row = {
                "file_name": rel,
                "id": x["name"],
                "given": given,
                "spoken_text": x["text"],
                "text": x.get("plain", x["text"]),
                "ys": x["ys"],
                "read_right": (r is not None) if heard else None,  # None: not checked yet
                "whisper": heard,
                "duration": round(len(y) / sr, 3),
            }
            row.update({k: r[k] if r else None for k in PROSODY})
            yield row


def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    n = right = 0
    hours = 0.0
    with (OUT / "metadata.jsonl").open("w") as f:
        for row in rows():
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
            n += 1
            right += bool(row["read_right"])
            hours += row["duration"] / 3600
    shutil.copy(HERE / "dataset_card.md", OUT / "README.md")
    size = sum(p.stat().st_size for p in OUT.rglob("*.flac")) / 1e6
    print(f"{n} clips ({right} read right), {hours:.2f} h, {size:.0f} MB of FLAC -> {OUT.relative_to(HERE)}")


if __name__ == "__main__":
    main()
