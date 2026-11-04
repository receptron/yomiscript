"""Qwen's own representation of each word of a sentence, for nucleus.py: what the clone's talker (the 1.7B Base, as
generate.py runs it) holds at the sentence's text tokens when it has read them, before it speaks.

The input is built exactly as the clone's generation builds it (mlx-audio's ICL prompt: the reference transcript and
the sentence over codec padding, then the reference audio's codes), and the talker is run over it once. At each text
token of the sentence the output of some of its layers is taken; the talker is causal, so a token has seen the
reference transcript and the sentence up to itself. Each word of the YomiScript (its <t:…>) gets the mean over the
tokens that overlap its characters; a word of no text (a pause written ‖<t:>) gets zeros.

usage: ../qwen3_tts/.venv/bin/python qwen_hidden.py [tag ...]   (the tags of abs.mjs's outputs: _phrased _wiki)
       -> work/qwen_hidden/<name>.npy ([words, layers, 2048], float16)
"""

import json
import re
import sys
from pathlib import Path

import mlx.core as mx
import mlx.nn as nn
import numpy as np
from mlx_audio.tts.utils import load_model
from mlx_audio.utils import load_audio

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "qwen3_tts"))
from qwen3_tts import VOICES  # noqa: E402  (the clone's model and reference voice: one place)

LAYERS = (7, 14, 21, 28)


def words(ys):
    return re.findall(r"<t:([^>]*)>", ys)


def layer_outputs(talker, embeds):
    """the output of each layer in LAYERS, [layers, positions, hidden]"""
    m = talker.model
    T = embeds.shape[1]
    pos = mx.broadcast_to(mx.arange(T)[None, :].astype(mx.int32), (1, T))
    pe = m.rotary_emb(embeds, mx.stack([pos, pos, pos], axis=0))
    mask = nn.MultiHeadAttention.create_additive_causal_mask(T).astype(embeds.dtype)
    x, out = embeds, []
    for i, layer in enumerate(m.layers, start=1):
        x = layer(x, pe, mask, None)
        if i in LAYERS:
            out.append(m.norm(x) if i == len(m.layers) else x)
    return mx.stack([o[0] for o in out])


def sentence(model, ref, ref_text, text):
    """the layers' outputs at the sentence's tokens and each token's characters in the sentence"""
    embeds, _, _, codes = model._prepare_icl_generation_inputs(text, ref, ref_text, language="japanese")
    tok = model.tokenizer
    n_ref = len(tok.encode(f"<|im_start|>assistant\n{ref_text}<|im_end|>\n")) - 5
    prefix = "<|im_start|>assistant\n"
    enc = tok(f"{prefix}{text}<|im_end|>\n<|im_start|>assistant\n", return_offsets_mapping=True)
    spans = [(a - len(prefix), b - len(prefix)) for a, b in enc["offset_mapping"][3:-5]]
    text_lens = n_ref + len(spans) + 1
    start = embeds.shape[1] - (codes.shape[2] + 1) - text_lens + n_ref
    H = layer_outputs(model.talker, embeds)[:, start : start + len(spans)]
    return np.array(H.astype(mx.float32)), spans


def by_word(H, spans, W):
    """[words, layers, hidden]: each word the mean of the tokens overlapping its characters"""
    out, at = np.zeros((len(W), H.shape[0], H.shape[2]), dtype=np.float16), 0
    for i, w in enumerate(W):
        a, b = at, at + len(w)
        at = b
        T = [k for k, (s, e) in enumerate(spans) if s < b and e > a]
        if w and T:
            out[i] = H[:, T].mean(axis=1)
    return out


def main():
    tags = sys.argv[1:] or ["_phrased", "_wiki"]
    repo, opts = VOICES["clone"]
    model = load_model(repo)
    ref = load_audio(opts["ref_audio"], sample_rate=model.sample_rate)
    out = HERE / "work/qwen_hidden"
    out.mkdir(parents=True, exist_ok=True)
    for tag in tags:
        read = json.loads((HERE / f"work/abs{tag}.json").read_text())
        for n, (name, r) in enumerate(read.items()):
            f = out / f"{name}.npy"
            if f.exists():
                continue
            W = words(r["ys"])
            H, spans = sentence(model, ref, opts["ref_text"], "".join(W))
            np.save(f, by_word(H, spans, W))
            if n % 200 == 0:
                print(f"{tag} {n}/{len(read)}", flush=True)


if __name__ == "__main__":
    main()
