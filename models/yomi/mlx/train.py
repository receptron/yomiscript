"""Yomi-0 学習。 python train.py --config configs/tiny.json --out ckpt/tiny [--dtype bfloat16] [--distill]"""
import argparse, json, math, random, time
from pathlib import Path

import mlx.core as mx
import mlx.nn as nn
import mlx.optimizers as optim

import yomi
from yomi import BOS, EOS, PAD, Vocab, Yomi

HERE = Path(__file__).resolve().parent
DT = {"float32": mx.float32, "bfloat16": mx.bfloat16, "float16": mx.float16}


def read(p):
    return [json.loads(l) for l in open(p, encoding="utf-8")] if Path(p).exists() else []


def batches(rows, sv, tv, bs, max_len, rng):
    """長さの近い文をまとめたバッチを無限に出す。"""
    rows = [r for r in rows if len(r["text"]) < max_len and len(r["target"]) + 1 < max_len]
    while True:
        idx = sorted(range(len(rows)), key=lambda i: len(rows[i]["target"]) + rng.random() * 8)
        bl = [idx[i:i + bs] for i in range(0, len(idx), bs)]
        rng.shuffle(bl)
        for b in bl:
            yield collate([rows[i] for i in b], sv, tv)


def collate(rs, sv, tv):
    s = [sv.encode(r["text"]) for r in rs]
    t = [[BOS] + tv.encode(r["target"]) + [EOS] for r in rs]
    # 長さを16の倍数に丸めて形状の種類を減らす(MLXのカーネル/バッファキャッシュ肥大による減速対策)
    r16 = lambda n: -(-n // 16) * 16
    Ls, Lt = r16(max(map(len, s))), r16(max(map(len, t)) - 1) + 1
    S = mx.array([x + [PAD] * (Ls - len(x)) for x in s], dtype=mx.int32)
    T = mx.array([x + [PAD] * (Lt - len(x)) for x in t], dtype=mx.int32)
    return S, T[:, :-1], T[:, 1:]


def loss_fn(model, S, Ti, To, ls):
    logits = model(S, Ti).astype(mx.float32)  # 損失は float32 で計算 (BF16 学習でも安定)
    mask = (To != PAD).astype(mx.float32)
    ce = nn.losses.cross_entropy(logits, To, label_smoothing=ls) * mask
    return ce.sum() / mask.sum()


def dev_loss(model, rows, sv, tv, ls, bs=64):
    tot = n = 0.0
    for i in range(0, len(rows), bs):
        S, Ti, To = collate(rows[i:i + bs], sv, tv)
        m = (To != PAD).sum().item()
        tot += loss_fn(model, S, Ti, To, 0.0).item() * m; n += m
    return tot / n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default="configs/tiny.json")
    ap.add_argument("--data", type=Path, default=HERE / "data")
    ap.add_argument("--out", type=Path, default=HERE / "ckpt/tiny")
    ap.add_argument("--dtype", default="float32", choices=list(DT))
    ap.add_argument("--distill", action="store_true", help="data/distill.jsonl も混ぜる (蒸留: 品質は pyopenjtalk が上限)")
    ap.add_argument("--steps", type=int)
    ap.add_argument("--resume", action="store_true")
    ap.add_argument("--seed", type=int, default=0)
    a = ap.parse_args()
    cfg = json.load(open(a.config)); tc = cfg["train"]
    if a.steps:
        tc["steps"] = a.steps
    mx.random.seed(a.seed); rng = random.Random(a.seed)
    voc = json.load(open(a.data / "vocab.json", encoding="utf-8"))
    sv, tv = Vocab(voc["src"]), Vocab(voc["tgt"])
    train, dev = read(a.data / "train.jsonl"), read(a.data / "dev.jsonl")
    if a.distill:
        d = read(a.data / "distill.jsonl"); print(f"蒸留データ {len(d)} 文を追加"); train += d
    model = Yomi(len(sv), len(tv), **cfg["model"])
    start = 0
    if a.resume and (a.out / "meta.json").exists():
        model.load_weights(str(a.out / "model.safetensors")); start = json.load(open(a.out / "meta.json"))["step"]
    model.set_dtype(DT[a.dtype])
    print(f"params: {yomi.n_params(model)/1e6:.2f}M  train {len(train)} dev {len(dev)}  dtype {a.dtype}")
    total, wu = tc["steps"], tc["warmup"]
    sched = lambda s: tc["lr"] * mx.minimum((s + 1) / wu, 0.5 * (1 + mx.cos(math.pi * mx.minimum(s / total, 1.0))))
    opt = optim.AdamW(learning_rate=sched, weight_decay=tc["weight_decay"])
    if a.resume and (a.out / "optimizer.safetensors").exists():
        from mlx.utils import tree_unflatten
        opt.init(model.trainable_parameters())
        opt.state = tree_unflatten(list(mx.load(str(a.out / "optimizer.safetensors")).items()))
    lg = nn.value_and_grad(model, loss_fn)
    it = batches(train, sv, tv, tc["batch_size"], cfg["model"]["max_len"], rng)
    t0, run, log = time.time(), [], []
    tw = time.time()
    for step in range(start + 1, total + 1):
        S, Ti, To = next(it)
        loss, g = lg(model, S, Ti, To, tc["label_smoothing"])
        g, _ = optim.clip_grad_norm(g, 1.0)
        opt.update(model, g)
        mx.eval(model.parameters(), opt.state, loss)
        run.append(loss.item())
        if step % 50 == 0:
            now = time.time()
            print(f"step {step}/{total} loss {sum(run)/len(run):.4f} lr {opt.learning_rate.item():.2e} {(now-tw)/50:.3f}s/step  mem {mx.get_active_memory()/2**30:.2f}GB cache {mx.get_cache_memory()/2**30:.2f}GB", flush=True)
            run = []; tw = now
            mx.clear_cache()
        if step % tc["eval_every"] == 0 or step == total:
            model.eval(); dl = dev_loss(model, dev, sv, tv, 0.0); model.train()
            print(f"  dev loss {dl:.4f}", flush=True); log.append({"step": step, "dev_loss": dl, "elapsed_s": time.time() - t0})
        if step % tc["save_every"] == 0 or step == total:
            yomi.save(a.out, model, cfg, voc, step, opt)
    json.dump(log, open(a.out / "train_log.json", "w"), indent=1)
    print(f"done {total} steps in {time.time()-t0:.1f}s -> {a.out}")


if __name__ == "__main__":
    main()
