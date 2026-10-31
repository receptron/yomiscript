"""Audio8 TTS 0.1B (INT8 ONNX, CPU) on the Japanese listening sets of eval/browser_tts, for listening next to Kokoro and
Supertonic 3. Audio8 reads text, like Supertonic, and clones the voice of a reference recording.

  (default)        every Japanese text as written: ../browser_tts/audio/audio8/<set>.<name>.wav
  --ys LLM [RULE]  the LLM's YomiScript as the text the Supertonic Katarite gives its engine (the original text with kana
                   where RULE says: ambiguous (default), kanji) -> ../browser_tts/audio/audio8_ys_<LLM>_<RULE>/
  --voice NAME     a registered voice (default jsut; `default` is the model's bundled Chinese speaker); a voice other
                   than jsut adds _<NAME> to the directory
  --register NAME WAV TEXT   register WAV (0.5-30 s) with its exact transcript TEXT as voice NAME, then exit

usage: python audio8.py --runtime DIR [--ys claude|codex [ambiguous|kanji]] [--voice NAME] [--sets ja hard]
  DIR is onnx_runtime_0_1b_int8 of a clone of github.com/Edge0-AI/Audio8_TTS (the runtime is not on PyPI).
  The model is read from ~/.cache/audio8/model, the voices from ~/.cache/audio8/voices (README.md).
"""

import argparse
import json
import sys
import time
from pathlib import Path

import soundfile as sf

HERE = Path(__file__).parent
BROWSER_TTS = HERE.parent / "browser_tts"
CACHE = Path.home() / ".cache/audio8"
SEED = 42


def parse_args():
    p = argparse.ArgumentParser(description="Audio8 TTS 0.1B on the Japanese listening sets")
    p.add_argument("--runtime", type=Path, required=True, help="onnx_runtime_0_1b_int8 of an Audio8_TTS clone")
    p.add_argument("--model", type=Path, default=CACHE / "model")
    p.add_argument("--voices", type=Path, default=CACHE / "voices")
    p.add_argument("--voice", default="jsut")
    p.add_argument("--ys", nargs="+", metavar=("LLM", "RULE"))
    p.add_argument("--sets", nargs="+", default=["ja", "hard"])
    p.add_argument("--register", nargs=3, metavar=("NAME", "WAV", "TEXT"))
    p.add_argument("--threads", type=int, default=8)
    return p.parse_args()


def register(args):
    from arktts_runtime.registration import VoiceRegistration

    name, wav, text = args.register
    fingerprint = json.loads((args.model / "runtime_manifest.json").read_text())["model_fingerprint"]
    meta = VoiceRegistration(args.model / "registration", args.voices, fingerprint).register(Path(wav).read_bytes(), Path(wav).name, text, name)
    print(f"registered {meta['name']}: {meta['shape']} from {meta['source_audio']}")


def texts_and_dir(args):
    sys.path.insert(0, str(BROWSER_TTS))
    from texts import katarite, load_sets

    sets = {k: v for k, v in load_sets().items() if k in args.sets}
    key = "audio8"
    if args.ys:
        rule = args.ys[1] if len(args.ys) > 1 else "ambiguous"
        sets = katarite(sets, args.ys[0], rule, names=args.sets)
        key += f"_ys_{args.ys[0]}_{rule}"
    if args.voice != "jsut":
        key += f"_{args.voice}"
    return sets, BROWSER_TTS / "audio" / key


def main():
    args = parse_args()
    sys.path.insert(0, str(args.runtime))
    if args.register:
        register(args)
        return
    from arktts_runtime.runtime import ArkTtsRuntime

    sets, out = texts_and_dir(args)
    out.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    rt = ArkTtsRuntime(args.model, args.voices, None, None, args.threads)
    sr = int(rt.manifest["sample_rate"])
    print(f"load {time.time() - t0:.1f} s, writing {out.relative_to(HERE.parent)}")
    spent = heard = 0.0
    for name, items in sets.items():
        for x in items:
            t = time.time()
            audio, _ = rt.synthesize(text=x["text"], voice=args.voice, max_new_tokens=1024, temperature=0.7, top_p=0.9, top_k=50, seed=SEED)
            spent += time.time() - t
            heard += len(audio) / sr
            sf.write(str(out / f"{name}.{x['name']}.wav"), audio, sr)
    print(f"{sum(map(len, sets.values()))} texts, {heard:.0f} s of audio in {spent:.0f} s (real-time factor {spent / max(heard, 1e-9):.2f}, CPU)")


if __name__ == "__main__":
    main()
