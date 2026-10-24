"""Yomi-0 MLX 試作: 文字入力 -> カナ+韻律記号を出す小型 Transformer エンコーダ・デコーダ (密, MoEなし)。"""
import json
from pathlib import Path

import mlx.core as mx
import mlx.nn as nn
from mlx.utils import tree_flatten, tree_unflatten

PAD, BOS, EOS, UNK = 0, 1, 2, 3
SPECIALS = ["<pad>", "<s>", "</s>", "<unk>"]


class Vocab:
    def __init__(self, chars):
        self.itos = SPECIALS + list(chars)
        self.stoi = {c: i for i, c in enumerate(self.itos)}

    def encode(self, s):
        return [self.stoi.get(c, UNK) for c in s]

    def decode(self, ids):
        out = []
        for i in ids:
            if i == EOS:
                break
            if i > UNK:
                out.append(self.itos[i])
        return "".join(out)

    def __len__(self):
        return len(self.itos)


class MHA(nn.Module):
    def __init__(self, d, h):
        super().__init__()
        self.h = h
        self.q, self.k, self.v, self.o = (nn.Linear(d, d, bias=False) for _ in range(4))

    def __call__(self, x, mem, mask=None, cache=None):
        B, L, D = x.shape
        q = self.q(x).reshape(B, L, self.h, -1).transpose(0, 2, 1, 3)
        k = self.k(mem).reshape(B, mem.shape[1], self.h, -1).transpose(0, 2, 1, 3)
        v = self.v(mem).reshape(B, mem.shape[1], self.h, -1).transpose(0, 2, 1, 3)
        if cache is not None:  # 自己注意の KV キャッシュ
            if cache[0] is not None:
                k = mx.concatenate([cache[0], k], axis=2); v = mx.concatenate([cache[1], v], axis=2)
            cache[0], cache[1] = k, v
        y = mx.fast.scaled_dot_product_attention(q, k, v, scale=q.shape[-1] ** -0.5, mask=mask)
        return self.o(y.transpose(0, 2, 1, 3).reshape(B, L, D))


class FF(nn.Module):
    def __init__(self, d, f):
        super().__init__()
        self.a, self.b = nn.Linear(d, f), nn.Linear(f, d)

    def __call__(self, x):
        return self.b(nn.gelu(self.a(x)))


class EncLayer(nn.Module):
    def __init__(self, d, h, f):
        super().__init__()
        self.n1, self.n2, self.att, self.ff = nn.LayerNorm(d), nn.LayerNorm(d), MHA(d, h), FF(d, f)

    def __call__(self, x, mask):
        h = self.n1(x)
        x = x + self.att(h, h, mask)
        return x + self.ff(self.n2(x))


class DecLayer(nn.Module):
    def __init__(self, d, h, f):
        super().__init__()
        self.n1, self.n2, self.n3 = nn.LayerNorm(d), nn.LayerNorm(d), nn.LayerNorm(d)
        self.sa, self.ca, self.ff = MHA(d, h), MHA(d, h), FF(d, f)

    def __call__(self, x, mem, smask, mmask, cache=None):
        h = self.n1(x)
        x = x + self.sa(h, h, smask, cache)
        x = x + self.ca(self.n2(x), mem, mmask)
        return x + self.ff(self.n3(x))


class Yomi(nn.Module):
    def __init__(self, n_src, n_tgt, d_model=256, n_heads=4, d_ff=1024, enc_layers=4, dec_layers=4, max_len=256, **_):
        super().__init__()
        self.src_emb, self.tgt_emb = nn.Embedding(n_src, d_model), nn.Embedding(n_tgt, d_model)
        self.pos = nn.Embedding(max_len, d_model)
        self.enc = [EncLayer(d_model, n_heads, d_ff) for _ in range(enc_layers)]
        self.dec = [DecLayer(d_model, n_heads, d_ff) for _ in range(dec_layers)]
        self.enc_norm, self.dec_norm = nn.LayerNorm(d_model), nn.LayerNorm(d_model)
        self.out = nn.Linear(d_model, n_tgt, bias=False)
        self.max_len = max_len

    def _pad_mask(self, src, dtype):
        return mx.where(src == PAD, -1e9, 0.0).astype(dtype)[:, None, None, :]

    def encode(self, src):
        x = self.src_emb(src) + self.pos(mx.arange(src.shape[1]))
        m = self._pad_mask(src, x.dtype)
        for l in self.enc:
            x = l(x, m)
        return self.enc_norm(x), m

    def decode(self, tgt_in, mem, mmask, offset=0, caches=None):
        L = tgt_in.shape[1]
        x = self.tgt_emb(tgt_in) + self.pos(mx.arange(offset, offset + L))
        smask = None if caches is not None and L == 1 else nn.MultiHeadAttention.create_additive_causal_mask(L).astype(x.dtype)
        for i, l in enumerate(self.dec):
            x = l(x, mem, smask, mmask, None if caches is None else caches[i])
        return self.out(self.dec_norm(x))

    def __call__(self, src, tgt_in):
        mem, m = self.encode(src)
        return self.decode(tgt_in, mem, m)

    def generate(self, src, max_new=None):
        """貪欲デコード (バッチ対応, KVキャッシュ)。戻り値: list[list[int]]"""
        B = src.shape[0]
        max_new = max_new or min(self.max_len - 1, int(src.shape[1] * 3) + 8)
        mem, m = self.encode(src)
        caches = [[None, None] for _ in self.dec]
        tok = mx.full((B, 1), BOS, dtype=mx.int32)
        outs, done = [], mx.zeros((B,), dtype=mx.bool_)
        for t in range(max_new):
            logits = self.decode(tok, mem, m, offset=t, caches=caches)
            tok = mx.argmax(logits[:, -1, :], axis=-1).astype(mx.int32)
            outs.append(tok)
            done = done | (tok == EOS)
            tok = tok[:, None]
            if t % 8 == 7 and done.all().item():
                break
        return mx.stack(outs, axis=1).tolist()


def n_params(model):
    return sum(v.size for _, v in tree_flatten(model.parameters()))


def save(path, model, cfg, vocab, step, opt=None):
    path = Path(path); path.mkdir(parents=True, exist_ok=True)
    model.save_weights(str(path / "model.safetensors"))
    json.dump({"config": cfg, "vocab": vocab, "step": step}, open(path / "meta.json", "w", encoding="utf-8"), ensure_ascii=False)
    if opt is not None:
        st = dict(tree_flatten(opt.state))
        mx.save_safetensors(str(path / "optimizer.safetensors"), {k: v for k, v in st.items() if isinstance(v, mx.array)})


def load(path, dtype=None):
    path = Path(path)
    meta = json.load(open(path / "meta.json", encoding="utf-8"))
    src, tgt = Vocab(meta["vocab"]["src"]), Vocab(meta["vocab"]["tgt"])
    model = Yomi(len(src), len(tgt), **meta["config"]["model"])
    model.load_weights(str(path / "model.safetensors"))
    if dtype is not None:
        model.set_dtype(dtype)
    model.eval()
    return model, src, tgt, meta


def predict(model, src_vocab, tgt_vocab, texts, batch=32):
    out = []
    for i in range(0, len(texts), batch):
        chunk = texts[i:i + batch]
        ids = [src_vocab.encode(t)[: model.max_len] for t in chunk]
        L = max(len(x) for x in ids)
        arr = mx.array([x + [PAD] * (L - len(x)) for x in ids], dtype=mx.int32)
        out += [tgt_vocab.decode(g) for g in model.generate(arr)]
    return out
