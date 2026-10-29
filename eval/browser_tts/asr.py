"""Transcribe the listening audio with Whisper (large-v3-turbo, MLX), for an intelligibility check: results/asr.json.

Every wav under audio/ is transcribed once (cached by path). usage: python asr.py   (python with mlx_whisper)
"""

import json
from pathlib import Path

import mlx_whisper

HERE = Path(__file__).parent
MODEL = "mlx-community/whisper-large-v3-turbo"


def main():
    out = HERE / "results/asr.json"
    asr = json.loads(out.read_text()) if out.exists() else {}
    files = sorted(p for p in (HERE / "audio").glob("*/*.wav") if str(p.relative_to(HERE)) not in asr)
    for i, p in enumerate(files):
        lang = "en" if p.name.startswith("en.") else "ja"
        asr[str(p.relative_to(HERE))] = mlx_whisper.transcribe(str(p), path_or_hf_repo=MODEL, language=lang)["text"].strip()
        if i % 50 == 49:
            out.write_text(json.dumps(asr, ensure_ascii=False, indent=0))
            print(f"{i + 1}/{len(files)}")
    out.write_text(json.dumps(asr, ensure_ascii=False, indent=0))
    print(f"{len(asr)} transcripts")


if __name__ == "__main__":
    main()
