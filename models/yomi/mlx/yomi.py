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
    def __init__(self, d, h, f, memory=None, memory2=None):
        super().__init__()
        self.n1, self.n2, self.att, self.ff = nn.LayerNorm(d), nn.LayerNorm(d), MHA(d, h), FF(d, f)
        from mold import ProductKeyMemory
        if memory:  # MoLD: 学習型 product-key メモリ (値テーブルは差し替え可能)
            self.mem = ProductKeyMemory(d, **{k: v for k, v in memory.items() if k != "layers"})
        if memory2:  # 積み重ね用の 2 つ目のメモリ (例: 人名)。mem の後に足す。独自のキー・値・ゲート
            self.mem2 = ProductKeyMemory(d, **{k: v for k, v in memory2.items() if k != "layers"})

    def __call__(self, x, mask):
        h = self.n1(x)
        x = x + self.att(h, h, mask)
        x = x + self.ff(self.n2(x))
        if "mem" in self:
            x = x + self.mem(x)
        if "mem2" in self:
            x = x + self.mem2(x)
        return x


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
    def __init__(self, n_src, n_tgt, d_model=256, n_heads=4, d_ff=1024, enc_layers=4, dec_layers=4, max_len=256, memory=None, memory2=None, **_):
        super().__init__()
        self.src_emb, self.tgt_emb = nn.Embedding(n_src, d_model), nn.Embedding(n_tgt, d_model)
        self.pos = nn.Embedding(max_len, d_model)
        ml = set((memory or {}).get("layers", []))
        ml2 = set((memory2 or {}).get("layers", []))
        self.enc = [EncLayer(d_model, n_heads, d_ff, memory if i in ml else None, memory2 if i in ml2 else None)
                    for i in range(enc_layers)]
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

    def generate_legacy(self, src, max_new=None):
        """旧デコード (比較用): 自己注意KVを毎ステップ連結、交差注意K/Vも毎ステップ再計算。戻り値: list[list[int]]"""
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


    def generate_nocache(self, src, max_new=None):
        """参照実装: 毎ステップ接頭辞全体を再計算する貪欲デコード (等価性テスト用, 遅い)。"""
        B = src.shape[0]
        max_new = max_new or min(self.max_len - 1, int(src.shape[1] * 3) + 8)
        mem, m = self.encode(src)
        seq = mx.full((B, 1), BOS, dtype=mx.int32)
        outs = []
        for t in range(max_new):
            tok = mx.argmax(self.decode(seq, mem, m)[:, -1, :], axis=-1).astype(mx.int32)
            outs.append(tok); seq = mx.concatenate([seq, tok[:, None]], axis=1)
            if t % 8 == 7 and (mx.stack(outs, 1) == EOS).any(axis=1).all().item():
                break
        return mx.stack(outs, axis=1).tolist()

    # ---- 高速デコード: 固定長KVキャッシュ + 交差注意K/Vの事前計算 + mx.compile ----
    def _cross_kv(self, mem):
        B, S, _ = mem.shape
        ks, vs = [], []
        for l in self.dec:
            h = l.ca.h
            ks.append(l.ca.k(mem).reshape(B, S, h, -1).transpose(0, 2, 1, 3))
            vs.append(l.ca.v(mem).reshape(B, S, h, -1).transpose(0, 2, 1, 3))
        return ks, vs

    def _step(self, tok, t, ks, vs, cks, cvs, mmask):
        """1トークン分のデコード。tok:(B,1) t:()int32配列。ks/vs: 層ごとの (B,h,T,dh) 固定長キャッシュ。"""
        B = tok.shape[0]
        T = ks[0].shape[2]
        x = self.tgt_emb(tok) + self.pos.weight[t][None, None, :]
        pos = mx.arange(T)
        write = (pos == t)[None, None, :, None]
        smask = mx.where(pos <= t, 0.0, -1e9).astype(x.dtype)[None, None, None, :]
        nks, nvs = [], []
        for i, l in enumerate(self.dec):
            a = l.sa
            hdn = l.n1(x)
            q = a.q(hdn).reshape(B, 1, a.h, -1).transpose(0, 2, 1, 3)
            k = a.k(hdn).reshape(B, 1, a.h, -1).transpose(0, 2, 1, 3)
            v = a.v(hdn).reshape(B, 1, a.h, -1).transpose(0, 2, 1, 3)
            kc, vc = mx.where(write, k, ks[i]), mx.where(write, v, vs[i])
            nks.append(kc); nvs.append(vc)
            sc = q.shape[-1] ** -0.5
            y = mx.fast.scaled_dot_product_attention(q, kc, vc, scale=sc, mask=smask)
            x = x + a.o(y.transpose(0, 2, 1, 3).reshape(B, 1, -1))
            c = l.ca
            q = c.q(l.n2(x)).reshape(B, 1, c.h, -1).transpose(0, 2, 1, 3)
            y = mx.fast.scaled_dot_product_attention(q, cks[i], cvs[i], scale=sc, mask=mmask)
            x = x + c.o(y.transpose(0, 2, 1, 3).reshape(B, 1, -1))
            x = x + l.ff(l.n3(x))
        logits = self.out(self.dec_norm(x))
        return mx.argmax(logits[:, -1, :], axis=-1).astype(mx.int32), nks, nvs

    def _step_fn(self, compiled):
        if not compiled:
            return self._step
        if getattr(self, "_compiled_step", None) is None:
            from functools import partial
            self._compiled_step = partial(mx.compile, inputs=self.state)(self._step)
        return self._compiled_step

    def generate(self, src, max_new=None, compile=True):
        """貪欲デコード (バッチ対応, 高速版)。generate_nocache と同じトークン列を返す。戻り値: list[list[int]]"""
        B = src.shape[0]
        max_new = max_new or min(self.max_len - 1, int(src.shape[1] * 3) + 8)
        mem, m = self.encode(src)
        cks, cvs = self._cross_kv(mem)
        T = min(-(-max_new // 32) * 32, self.max_len)  # キャッシュ長を32刻みに丸めて再コンパイルを減らす
        h = self.dec[0].sa.h
        ks = [mx.zeros((B, h, T, mem.shape[-1] // h), dtype=mem.dtype) for _ in self.dec]
        vs = [mx.zeros((B, h, T, mem.shape[-1] // h), dtype=mem.dtype) for _ in self.dec]
        step = self._step_fn(compile)
        tok = mx.full((B, 1), BOS, dtype=mx.int32)
        outs, done = [], mx.zeros((B,), dtype=mx.bool_)
        for t in range(max_new):
            nt, ks, vs = step(tok, mx.array(t, dtype=mx.int32), ks, vs, cks, cvs, m)
            outs.append(nt)
            done = done | (nt == EOS)
            tok = nt[:, None]
            mx.async_eval(tok, done, ks, vs)
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


def load(path, dtype=None, memory=None):
    """memory: 差し替える *.mem.safetensors (任意)。既存の tiny_aug などメモリ無しのチェックポイントもそのまま読める。"""
    path = Path(path)
    meta = json.load(open(path / "meta.json", encoding="utf-8"))
    src, tgt = Vocab(meta["vocab"]["src"]), Vocab(meta["vocab"]["tgt"])
    model = Yomi(len(src), len(tgt), **meta["config"]["model"])
    w = mx.load(str(path / "model.safetensors"))
    own = dict(tree_flatten(model.parameters()))
    miss = [k for k in own if k not in w]
    if any(not k.endswith(".mem.gate") for k in miss) or any(k not in own for k in w):
        model.load_weights(list(w.items()))  # 通常のエラーを出す
    model.load_weights(list(w.items()), strict=False)  # 旧形式 (ゲートなし・値0) のメモリ層はゲート初期値のまま
    if memory:  # 1 つのパス、カンマ区切り、またはリスト (積み重ね: 各ファイルは自分のグループのキーだけを持つ)
        import mold
        for p in mold.split_pkm(memory):
            mold.load_memory(model, p)
    import os
    if os.environ.get("MOLD_CG_THRESH"):  # 推論時だけ条件付きゲートを閾値で切る (例 0.5)。config の cg_thresh を上書き
        import mold
        for m in mold.memories(model):
            if "cgate" in m:
                m.cg_thresh = float(os.environ["MOLD_CG_THRESH"])
    if dtype is not None:
        model.set_dtype(dtype)
    model.eval()
    return model, src, tgt, meta


def predict(model, src_vocab, tgt_vocab, texts, batch=32, mode="fast", compile=True, router=None, context=None, logs=None):
    """mode: fast (既定) | legacy (旧デコード) | nocache (参照)。
    router: mold.MemoryRouter (辞書メモリ。学習なしで差し替え可能)。context: {'sex': 'female'} など。"""
    res = None
    if router is not None:
        res = [router.resolve(t, context) for t in texts]
        texts = [r[0] for r in res]
        if logs is not None:
            logs += [r[1] for r in res]
    out = []
    for i in range(0, len(texts), batch):
        chunk = texts[i:i + batch]
        ids = [src_vocab.encode(t)[: model.max_len] for t in chunk]
        L = max(len(x) for x in ids)
        arr = mx.array([x + [PAD] * (L - len(x)) for x in ids], dtype=mx.int32)
        if mode == "fast":
            gen = model.generate(arr, compile=compile)
        else:
            gen = model.generate_legacy(arr) if mode == "legacy" else model.generate_nocache(arr)
        out += [tgt_vocab.decode(g) for g in gen]
    if res is not None:  # 苗字+名前の句境界を補う
        out = [router.postprocess(o, r[1]) for o, r in zip(out, res)]
    return out
