"""Reference: run the original Kokoro pipeline (kokoro.KPipeline, unmodified) and record what the model sees and does.

For each text and voice, per KPipeline chunk: the phoneme string, the input ids, the voice-pack index, the predicted
durations, the predicted F0 (captured by wrapping predictor.F0Ntrain, which still computes as before) and the audio.
espeak-ng (KPipeline's fallback G2P for unknown words) is loaded from Homebrew because the espeakng-loader wheel
ignores its data path on this machine; the version is the same (1.52.0). Set ESPEAK_LIB / ESPEAK_DATA to override.

usage: python ref_kokoro.py texts.json out_dir [voice ...]      texts.json: [{"name", "text"}, ...]
       the language follows the voices (af_heart: en-US, jf_alpha: ja); default af_heart
"""
import json, os, sys, warnings
import numpy as np
warnings.filterwarnings("ignore")
import espeakng_loader
espeakng_loader.get_library_path = lambda: os.environ.get("ESPEAK_LIB", "/opt/homebrew/lib/libespeak-ng.dylib")
espeakng_loader.get_data_path = lambda: os.environ.get("ESPEAK_DATA", "/opt/homebrew/share/espeak-ng-data")
import soundfile as sf
import kokoro
from kokoro import KPipeline


def main(texts_file, out_dir, voices):
    os.makedirs(out_dir, exist_ok=True)
    lang = voices[0][0]                                   # a / b (English), j (Japanese): from the voice name
    assert all(v[0] == lang for v in voices), "one language per run"
    pipe = KPipeline(lang_code=lang, repo_id="hexgrad/Kokoro-82M")
    if lang in "ab":
        assert pipe.g2p.fallback is not None, "espeak fallback not loaded"
    model = pipe.model
    cap = {}
    orig = model.predictor.F0Ntrain
    def F0Ntrain(x, s):
        F0, N = orig(x, s)
        cap["F0"] = F0.squeeze().cpu().numpy().tolist()
        return F0, N
    model.predictor.F0Ntrain = F0Ntrain
    items = json.load(open(texts_file))
    out = {"kokoro": kokoro.__version__, "items": []}
    for voice in voices:
        pack = pipe.load_voice(voice)
        for it in items:
            chunks = []
            for k, r in enumerate(pipe(it["text"], voice=voice)):
                ps = r.phonemes
                ids = [0] + [model.vocab[p] for p in ps if p in model.vocab] + [0]
                wav = f"{it['name']}.{voice}.{k}.wav"
                sf.write(os.path.join(out_dir, wav), r.output.audio.numpy(), 24000)
                chunks.append({"text": r.graphemes, "ps": ps, "ids": ids, "ref_index": len(ps) - 1,
                               "dur": r.output.pred_dur.tolist(), "f0": cap.pop("F0"), "wav": wav})
            out["items"].append({"name": it["name"], "voice": voice, "text": it["text"], "chunks": chunks})
            print(voice, it["name"], [c["ps"] for c in chunks], flush=True)
    json.dump(out, open(os.path.join(out_dir, "ref.json"), "w"), ensure_ascii=False)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3:] or ["af_heart"])
