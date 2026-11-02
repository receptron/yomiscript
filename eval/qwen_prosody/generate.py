"""Qwen3-TTS 1.7B Base with the voice cloned from Kokoro's (eval/qwen3_tts: the side heard as the most natural)
reading every sentence of work/items.json from its plain text, in batches of sentences of similar length.

Resumable: a sentence whose audio exists is skipped. Sampling: the checkpoint's defaults, seed SEED + the batch's
index (batches are formed after sorting by length, so a rerun from scratch makes the same batches).

usage: ../qwen3_tts/.venv/bin/python generate.py [--batch 16] [--limit N] [--items work/items.json] [--out work/audio]
       -> <out>/<name>.wav (the kana pass: --items work/items_kana.json --out work/audio_kana, from kana_items.mjs)
"""

import argparse
import json
import sys
import time
from pathlib import Path

import mlx.core as mx
import numpy as np
import soundfile as sf
from mlx_audio.tts.utils import load_model

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "qwen3_tts"))
from qwen3_tts import VOICES  # noqa: E402  (the clone's model and reference voice: one place)

SEED = 42


def batches(items, size):
    order = sorted(items, key=lambda x: len(x["text"]))
    return [order[i : i + size] for i in range(0, len(order), size)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--batch", type=int, default=16)
    ap.add_argument("--limit", type=int)
    ap.add_argument("--items", default="work/items.json")
    ap.add_argument("--out", default="work/audio")
    a = ap.parse_args()
    items = json.loads((HERE / a.items).read_text())[: a.limit]
    out = HERE / a.out
    out.mkdir(parents=True, exist_ok=True)
    repo, opts = VOICES["clone"]
    model = load_model(repo)
    done, start, audio_s = 0, time.perf_counter(), 0.0
    for b, group in enumerate(batches(items, a.batch)):
        todo = [x for x in group if not (out / f"{x['name']}.wav").exists()]
        if todo:
            mx.random.seed(SEED + b)
            n = len(todo)
            for r in model.batch_generate(
                texts=[x["text"] for x in todo], ref_audios=[opts["ref_audio"]] * n, ref_texts=[opts["ref_text"]] * n, lang_code="japanese"
            ):
                y = np.array(r.audio).reshape(-1)
                sf.write(out / f"{todo[r.sequence_idx]['name']}.wav", y, model.sample_rate, subtype="PCM_16")
                audio_s += len(y) / model.sample_rate
        done += len(group)
        took = time.perf_counter() - start
        print(f"{done}/{len(items)}  {audio_s:.0f} s of audio in {took:.0f} s", flush=True)


if __name__ == "__main__":
    main()
