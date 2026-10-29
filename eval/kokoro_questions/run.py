"""Does the original Kokoro raise the pitch at the end of questions?

Uses the original pipeline unchanged: kokoro.KPipeline (misaki + espeak-ng fallback) for the phonemes and kokoro.KModel
(PyTorch, default settings) for the model. For every English voice it records the F0 the model predicts (the decoder
follows it), mapped to phonemes with the predicted durations. For a few voices it also synthesizes the audio through
KPipeline and measures the pitch of the sound with librosa.pyin, to check that the prediction is what is heard.

usage: python run.py out.json [--audio-voices af_heart,am_michael,bf_emma]
       python run.py out_ja.json --ja [--audio-voices jf_alpha,jm_kumo]     (Japanese: sentences_ja.json, the 5 ja voices)
"""
import json, os, sys, warnings
warnings.filterwarnings("ignore")
import numpy as np
import espeakng_loader
espeakng_loader.get_library_path = lambda: os.environ.get("ESPEAK_LIB", "/opt/homebrew/lib/libespeak-ng.dylib")
espeakng_loader.get_data_path = lambda: os.environ.get("ESPEAK_DATA", "/opt/homebrew/share/espeak-ng-data")
import torch, librosa
from huggingface_hub import list_repo_files
from kokoro import KPipeline

HERE = os.path.dirname(os.path.abspath(__file__))
VOWELS = set("aeiouæɑɒɔəɛɜɪʊʌᵊɐᵻAIOQWYɯɨ")


def predict(model, ps, ref_s):
    """KModel.forward_with_tokens up to the F0 predictor (same code path, decoder skipped)"""
    ids = [model.vocab[p] for p in ps if p in model.vocab]
    input_ids = torch.LongTensor([[0, *ids, 0]])
    L = input_ids.shape[-1]
    with torch.no_grad():
        lengths = torch.full((1,), L, dtype=torch.long)
        mask = torch.gt(torch.arange(L).unsqueeze(0) + 1, lengths.unsqueeze(1))
        d_en = model.bert_encoder(model.bert(input_ids, attention_mask=(~mask).int())).transpose(-1, -2)
        s = ref_s[:, 128:]
        d = model.predictor.text_encoder(d_en, s, lengths, mask)
        x, _ = model.predictor.lstm(d)
        dur = torch.round(torch.sigmoid(model.predictor.duration_proj(x)).sum(-1)).clamp(min=1).long().squeeze()
        idx = torch.repeat_interleave(torch.arange(L), dur)
        aln = torch.zeros((L, idx.shape[0])); aln[idx, torch.arange(idx.shape[0])] = 1
        F0, _ = model.predictor.F0Ntrain(d.transpose(-1, -2) @ aln.unsqueeze(0), s)
    chars = ["<s>"] + [p for p in ps if p in model.vocab] + ["</s>"]
    return chars, dur.tolist(), F0.squeeze().numpy()


def slope_second_half(st):
    """the paper's measure (Salem et al., Speech Prosody 2026): slope of a line fitted to the voiced F0 of the second half"""
    h = st[len(st) // 2:]; t = np.arange(len(st))[len(st) // 2:]; v = ~np.isnan(h)
    return float(np.polyfit(t[v], h[v], 1)[0]) if v.sum() >= 3 else None


def measures(chars, dur, f0):
    """final-pitch measures in semitones from the predicted F0 (2 frames per duration unit), on vowel frames only"""
    fr = np.repeat(np.arange(len(chars)), np.array(dur) * 2)[: len(f0)]
    vowel = np.array([c in VOWELS for c in chars])[fr]
    st = 12 * np.log2(np.maximum(f0, 1))
    med = np.median(st[vowel & (f0 > 60)])
    last_space = max(i for i, c in enumerate(chars) if c in (" ", "<s>"))
    lw = vowel & (f0 > 60) & (fr > last_space)                       # vowels of the last word
    if lw.sum() < 3:
        return None
    s_lw = st[lw]
    end = s_lw[-3:].mean()
    full = np.where(f0 > 60, st, np.nan)
    return {"end_vs_median": float(end - med), "end_vs_lastword_min": float(end - s_lw.min()),
            "slope2": slope_second_half(full)}


def audio_measures(audio, sr=24000):
    f0, vflag, _ = librosa.pyin(audio, fmin=60, fmax=500, sr=sr, frame_length=1024, hop_length=240)
    v = ~np.isnan(f0)
    if v.sum() < 10:
        return None
    st = 12 * np.log2(f0); sv = st[v]; med = np.median(sv)
    return {"end_vs_median": float(sv[-3:].mean() - med), "end_vs_last300ms_min": float(sv[-3:].mean() - sv[-30:].min()),
            "slope2": slope_second_half(st), "contour": [None if np.isnan(x) else round(float(x), 2) for x in st]}


def main(out, audio_voices, langs="ab"):
    sentences = json.load(open(os.path.join(HERE, "sentences_ja.json" if langs == "j" else "sentences.json")))
    voices = sorted(f[7:-3] for f in list_repo_files("hexgrad/Kokoro-82M") if f.startswith("voices/") and f[7] in langs and f[8] in "fm")
    g2p = {c: KPipeline(lang_code=c, repo_id="hexgrad/Kokoro-82M", model=False) for c in langs}  # phonemes only
    for c, p in g2p.items():
        assert c not in "ab" or p.g2p.fallback is not None
    pipes = {langs[0]: KPipeline(lang_code=langs[0], repo_id="hexgrad/Kokoro-82M")}            # with the model, for audio
    model = pipes[langs[0]].model
    for c in langs[1:]:
        pipes[c] = KPipeline(lang_code=c, repo_id="hexgrad/Kokoro-82M", model=model)
    ps_cache = {}
    res = {"voices": voices, "audio_voices": audio_voices, "rows": []}
    for v in voices:
        pipe = pipes[v[0]]; pack = pipe.load_voice(v)
        for s in sentences:
            key = (v[0], s["text"])
            if key not in ps_cache:
                ps_cache[key] = [r.phonemes for r in g2p[v[0]](s["text"])]
            ps = ps_cache[key][0]
            chars, dur, f0 = predict(model, ps, pack[len(ps) - 1])
            row = {"voice": v, **s, "ps": ps, "pred": measures(chars, dur, f0)}
            if v in audio_voices:
                audio = np.concatenate([r.output.audio.numpy() for r in pipe(s["text"], voice=v)])
                row["audio"] = audio_measures(audio)
            res["rows"].append(row)
        print(v, flush=True)
    json.dump(res, open(out, "w"), ensure_ascii=False)


if __name__ == "__main__":
    a = sys.argv[1:]
    ja = "--ja" in a
    av = a[a.index("--audio-voices") + 1].split(",") if "--audio-voices" in a else (["jf_alpha", "jm_kumo"] if ja else ["af_heart", "am_michael", "bf_emma"])
    main(a[0], av, "j" if ja else "ab")
