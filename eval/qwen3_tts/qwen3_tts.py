"""Qwen3-TTS 1.7B (MLX, bf16) reading the plain Japanese text of texts.json, for the blind test against Kokoro.

Two voices:
  anna   1.7B CustomVoice, its Japanese speaker ono_anna (the model's own native Japanese voice)
  clone  1.7B Base, the voice cloned from Kokoro's jf_alpha (audio/ref/kokoro.wav, made with `yomiscript speak`),
         so that the voice is close to Kokoro's and only the way of speaking differs

The engine is given the original text (the `<t:…>` of each YomiScript), not the reading: the texts were chosen so
that no word's reading depends on the context. Sampling: the checkpoint's defaults, a fixed seed per sentence, one
take each.

usage: .venv/bin/python qwen3_tts.py [anna|clone ...]   -> audio/raw/<voice>/<name>.wav and audio/raw/timing.json
"""

import json
import subprocess
import sys
import time
from pathlib import Path

import mlx.core as mx
import numpy as np
import soundfile as sf
from mlx_audio.tts.utils import load_model

HERE = Path(__file__).resolve().parent
REF_TEXT = "この先は下り坂なので、自転車をこぐのが楽になるよ。"
VOICES = {
    "anna": ("mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-bf16", {"voice": "ono_anna"}),
    "clone": ("mlx-community/Qwen3-TTS-12Hz-1.7B-Base-bf16", {"ref_audio": str(HERE / "audio/ref/kokoro.wav"), "ref_text": REF_TEXT}),
}
SEED = 42


def texts():
    """The original text of each YomiScript, from the CLI package's originalText (the one implementation)."""
    script = (
        "import fs from 'fs'; import { originalText } from 'yomiscript';"
        f"const t = JSON.parse(fs.readFileSync({json.dumps(str(HERE / 'texts.json'))}, 'utf8'));"
        "console.log(JSON.stringify(t.map((x) => [x.name, originalText(x.ys)])));"
    )
    out = subprocess.run(["node", "--input-type=module", "-e", script], cwd=HERE, check=True, capture_output=True, text=True)
    return json.loads(out.stdout)


def speak(model, text, opts, seed):
    mx.random.seed(seed)
    parts = [np.array(r.audio) for r in model.generate(text=text, lang_code="japanese", **opts)]
    return np.concatenate(parts), model.sample_rate


def main(names):
    items = texts()
    timing_file = HERE / "audio/raw/timing.json"
    timing = json.loads(timing_file.read_text()) if timing_file.exists() else {}
    for voice in names:
        repo, opts = VOICES[voice]
        model = load_model(repo)
        out = HERE / "audio/raw" / voice
        out.mkdir(parents=True, exist_ok=True)
        timing[voice] = {}
        for k, (name, text) in enumerate(items):
            start = time.perf_counter()
            audio, rate = speak(model, text, opts, SEED + k)
            took = time.perf_counter() - start
            sf.write(out / f"{name}.wav", audio, rate, subtype="PCM_16")
            timing[voice][name] = {"audio_s": round(len(audio) / rate, 2), "took_s": round(took, 2)}
            print(voice, name, text, f"({len(audio) / rate:.2f} s of audio in {took:.2f} s)", flush=True)
        del model
    timing_file.write_text(json.dumps(timing, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main(sys.argv[1:] or list(VOICES))
