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


def mem_augment(rows, dicts, p_names, p_general, rng):
    """メモリを意識した学習: 推論時の MemoryRouter と同じ経路 (to_pron・人名判定・形態素境界) で
    辞書が当たる部分の入力をカナに置き換えた版を作る。正解 (target) はそのまま。
    人名文は p_names、その他で辞書が当たる文は p_general の割合で置き換え版を使う (各文1回だけ決める)。"""
    import mold
    router = mold.MemoryRouter([mold.LexMemory.from_file(d) for d in dicts])
    n_n = n_g = 0
    out = []
    for r in rows:
        is_name = r.get("src") == "names"
        if rng.random() < (p_names if is_name else p_general):
            t, log = router.resolve(r["text"], [r["sex"]] if r.get("sex") else None)
            if log and t != r["text"]:
                r = dict(r, text=t, mem_aug=True); n_n += is_name; n_g += not is_name
        out.append(r)
    print(f"mem-aug: 人名文 {n_n} / その他 {n_g} 文の入力を辞書のカナに置換 (辞書 {len(dicts)} 個)", flush=True)
    return out


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
    ap.add_argument("--extra", type=Path, nargs="*", default=[], help="追加の学習 jsonl (例 data/names/names_train.jsonl)")
    ap.add_argument("--only-extra", action="store_true", help="data/train.jsonl を使わず --extra だけで学習 (例: 人名メモリだけ作る)")
    ap.add_argument("--extra-repeat", type=int, default=1, help="--extra を何回繰り返して混ぜるか")
    ap.add_argument("--init", type=Path, help="MoLD: 既存チェックポイント (例 ckpt/tiny_aug) の共有重みから始める。メモリ層は0初期化")
    ap.add_argument("--memory-only", action="store_true", help="MoLD: 共有重みを凍結し、メモリ層だけ学習 (ドメイン/方言メモリ作り)")
    ap.add_argument("--save-memory", type=Path, help="終了時にメモリ層だけを *.mem.safetensors に保存")
    ap.add_argument("--mem-aug", type=Path, nargs="*", default=None,
                    help="メモリを意識した学習に使う .koedict (省略時 dict/names の姓・名)。config の train.mem_aug でも指定可")
    ap.add_argument("--mem-aug-names", type=float, help="人名文で入力をカナ置換する割合 (既定 0.4)")
    ap.add_argument("--mem-aug-general", type=float, help="その他の文で辞書が当たるとき置換する割合 (既定 0.1)")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--compile", action="store_true", help="学習ステップを mx.compile する (loss は同一。Linux CPU では形状ごとの再コンパイルで約5%遅かったので既定はオフ)")
    a = ap.parse_args()
    cfg = json.load(open(a.config)); tc = cfg["train"]
    if a.steps:
        tc["steps"] = a.steps
    mx.random.seed(a.seed); rng = random.Random(a.seed)
    voc = json.load(open(a.data / "vocab.json", encoding="utf-8"))
    if a.init:  # 埋め込みの行番号を合わせるため、初期化元の語彙を使う
        voc = json.load(open(a.init / "meta.json", encoding="utf-8"))["vocab"]
    sv, tv = Vocab(voc["src"]), Vocab(voc["tgt"])
    train, dev = read(a.data / "train.jsonl"), read(a.data / "dev.jsonl")
    if a.distill:
        d = read(a.data / "distill.jsonl"); print(f"蒸留データ {len(d)} 文を追加"); train += d
    if a.only_extra:
        train = []
    for p in a.extra:
        d = read(p); print(f"追加データ {p}: {len(d)} 文 x{a.extra_repeat}"); train += d * a.extra_repeat
    ma = tc.get("mem_aug", {})
    if a.mem_aug is not None or ma:
        nd = HERE.parents[2] / "dict/names"
        dicts = a.mem_aug or [Path(p) if Path(p).is_absolute() else HERE / p for p in ma.get("dicts", [])] \
            or [nd / "surnames.koedict", nd / "given_names.koedict"]
        train = mem_augment(train, dicts, a.mem_aug_names if a.mem_aug_names is not None else ma.get("p_names", 0.4),
                            a.mem_aug_general if a.mem_aug_general is not None else ma.get("p_general", 0.1), rng)
    model = Yomi(len(sv), len(tv), **cfg["model"])
    start = 0
    if a.resume and (a.out / "meta.json").exists():
        model.load_weights(str(a.out / "model.safetensors")); start = json.load(open(a.out / "meta.json"))["step"]
    if a.init:
        w = mx.load(str(a.init / "model.safetensors"))
        own = dict(__import__("mlx.utils", fromlist=["x"]).tree_flatten(model.parameters()))
        miss = [k for k in own if k not in w]
        bad = [k for k in own if k in w and w[k].shape != own[k].shape]
        if bad:
            raise SystemExit(f"--init {a.init}: 形が合わない重み {bad[:3]} (config の model 設定を初期化元と揃えてください)")
        dead = [k for k in w if k.endswith(".mem.slots") and float(mx.abs(w[k]).max()) < 1e-2]
        if dead:  # 旧版 (値 0 初期化・ゲートなし) のメモリは学習できないので、新しい初期化を使う
            print(f"旧メモリ層 {dead} は値がほぼ0のため読み込まず、乱数+ゲート0で初期化")
            w = {k: v for k, v in w.items() if ".mem." not in f".{k}."}
        model.load_weights([(k, v) for k, v in w.items() if k in own], strict=False)
        print(f"init from {a.init}: {len(w)} tensors, 新規 (メモリ層) {len(miss)}")
    if a.memory_only:
        model.freeze()
        for l in model.enc:
            if "mem" in l:
                l.mem.unfreeze()
        print(f"memory-only: 学習対象 {sum(v.size for _, v in __import__('mlx.utils', fromlist=['x']).tree_flatten(model.trainable_parameters()))/1e6:.2f}M")
    model.set_dtype(DT[a.dtype])
    print(f"params: {yomi.n_params(model)/1e6:.2f}M  train {len(train)} dev {len(dev)}  dtype {a.dtype}")
    total, wu = tc["steps"], tc["warmup"]
    sched = lambda s: tc["lr"] * mx.minimum((s + 1) / wu, 0.5 * (1 + mx.cos(math.pi * mx.minimum(s / total, 1.0))))
    opt = optim.AdamW(learning_rate=sched, weight_decay=tc["weight_decay"])
    mm = tc.get("mem_lr_mult", 10.0)
    if cfg["model"].get("memory") and mm != 1.0:
        # メモリ層は1ステップで触られるスロットが一部だけ (疎) なので学習率を上げ、値テーブルには重み減衰をかけない
        msched = lambda s: mm * sched(s)
        opt = optim.MultiOptimizer([optim.AdamW(learning_rate=msched, weight_decay=0.0), opt],
                                   [lambda path, w: ".mem." in f".{path}."])
        print(f"メモリ層の学習率 x{mm}")
    if a.resume and (a.out / "optimizer.safetensors").exists():
        from mlx.utils import tree_unflatten
        opt.init(model.trainable_parameters())
        opt.state = tree_unflatten(list(mx.load(str(a.out / "optimizer.safetensors")).items()))
    lg = nn.value_and_grad(model, loss_fn)
    ls = tc["label_smoothing"]

    def train_step(S, Ti, To):
        loss, g = lg(model, S, Ti, To, ls)
        g, _ = optim.clip_grad_norm(g, 1.0)
        opt.update(model, g)
        return loss

    if a.compile:
        from functools import partial
        if not opt.state:  # 状態を先に作っておく (コンパイル関数の入出力として追跡するため)
            opt.init(model.trainable_parameters())
        st = [model.state, opt.state, mx.random.state]
        train_step = partial(mx.compile, inputs=st, outputs=st)(train_step)
    it = batches(train, sv, tv, tc["batch_size"], cfg["model"]["max_len"], rng)
    t0, run, log = time.time(), [], []
    tw = time.time()
    for step in range(start + 1, total + 1):
        S, Ti, To = next(it)
        loss = train_step(S, Ti, To)
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
    if a.save_memory:
        import mold
        mold.save_memory(model, a.save_memory, {"from": str(a.out), "step": total}); print(f"memory -> {a.save_memory}")
    print(f"done {total} steps in {time.time()-t0:.1f}s -> {a.out}")


if __name__ == "__main__":
    main()
