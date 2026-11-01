"""Whisper (large-v3-turbo, MLX, as eval/browser_tts/asr.py) on the code-switching audio: results/asr.json.

Each sentence (audio/mixed/<condition>/<item>.wav) is transcribed as Japanese; each section the Katarite spoke in
another language (<item>.en<k>.wav, YomiScript conditions) is transcribed as English, and so is the stretch of the
kana audio where the same words are said in katakana (results/kana_segments.json, from segments.mjs; key
<condition>/<item>.en_span). Cached by key.

usage: ../prosody_ref/.venv/bin/python asr.py
"""

import json
from pathlib import Path

import librosa
import mlx_whisper
import numpy as np
import soundfile as sf

HERE = Path(__file__).parent
MODEL = "mlx-community/whisper-large-v3-turbo"


def main():
    out = HERE / "results/asr.json"
    asr = json.loads(out.read_text()) if out.exists() else {}
    for p in sorted((HERE / "audio/mixed").glob("*/*.wav")):
        k = str(p.relative_to(HERE / "audio/mixed"))
        if k not in asr:
            lang = "en" if ".en" in p.stem else "ja"
            asr[k] = mlx_whisper.transcribe(str(p), path_or_hf_repo=MODEL, language=lang)["text"].strip()
    for k, (a, b) in json.loads((HERE / "results/kana_segments.json").read_text()).items():
        if f"{k}.en_span" not in asr:
            x, sr = sf.read(HERE / "audio/mixed" / f"{k}.wav", dtype="float32")
            cut = x[max(0, int((a - 0.05) * sr)) : int((b + 0.05) * sr)]
            cut = np.ascontiguousarray(librosa.resample(cut, orig_sr=sr, target_sr=16000))  # Whisper takes 16 kHz arrays
            asr[f"{k}.en_span"] = mlx_whisper.transcribe(cut, path_or_hf_repo=MODEL, language="en")["text"].strip()
    out.write_text(json.dumps(asr, ensure_ascii=False, indent=0))
    print(f"{len(asr)} transcripts")


if __name__ == "__main__":
    main()
