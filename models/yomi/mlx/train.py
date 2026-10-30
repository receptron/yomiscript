"""Yomi-0 training. python train.py --config configs/tiny.json --out ckpt/tiny [--dtype bfloat16] [--distill]"""

import argparse
import json
import math
import random
import time
from pathlib import Path

import mlx.core as mx
import mlx.nn as nn
import mlx.optimizers as optim
import yomi
from yomi import BOS, EOS, PAD, Vocab, Yomi

import mold

HERE = Path(__file__).resolve().parent
DT = {"float32": mx.float32, "bfloat16": mx.bfloat16, "float16": mx.float16}


def read(p):
    return [json.loads(l) for l in open(p, encoding="utf-8")] if Path(p).exists() else []


def mem_augment(rows, dicts, p_names, p_general, rng):
    """Memory-aware training: build a version whose input has the lexicon-matched parts replaced by kana, via the same path as
    the MemoryRouter at inference (to_pron, personal-name detection, morpheme boundaries). The target stays the same.
    The replaced version is used with probability p_names for personal-name sentences and p_general for other sentences a lexicon matches
    (decided once per sentence)."""
    import mold

    router = mold.MemoryRouter([mold.LexMemory.from_file(d) for d in dicts])
    n_n = n_g = 0
    out = []
    for r in rows:
        is_name = r.get("src") == "names"
        if rng.random() < (p_names if is_name else p_general):
            t, log = router.resolve(r["text"], [r["sex"]] if r.get("sex") else None)
            if log and t != r["text"]:
                r = dict(r, text=t, mem_aug=True)
                n_n += is_name
                n_g += not is_name
        out.append(r)
    print(f"mem-aug: replaced the input with lexicon kana in {n_n} personal-name / {n_g} other sentences ({len(dicts)} lexicons)", flush=True)
    return out


def batches(rows, sv, tv, bs, max_len, rng):
    """Yield batches of sentences of similar length, forever."""
    rows = [r for r in rows if len(r["text"]) < max_len and len(r["target"]) + 1 < max_len]
    while True:
        idx = sorted(range(len(rows)), key=lambda i: len(rows[i]["target"]) + rng.random() * 8)
        bl = [idx[i : i + bs] for i in range(0, len(idx), bs)]
        rng.shuffle(bl)
        for b in bl:
            rs = [rows[i] for i in b]
            S, Ti, To = collate(rs, sv, tv)
            yield S, Ti, To, *span_labels(rs, S.shape[1], To.shape[1])


def collate(rs, sv, tv):
    s = [sv.encode(r["text"]) for r in rs]
    t = [[BOS] + tv.encode(r["target"]) + [EOS] for r in rs]

    # Round lengths up to a multiple of 16 to reduce the number of shapes (avoids slowdowns from MLX kernel/buffer cache growth)
    def r16(n):
        return -(-n // 16) * 16

    Ls, Lt = r16(max(map(len, s))), r16(max(map(len, t)) - 1) + 1
    S = mx.array([x + [PAD] * (Ls - len(x)) for x in s], dtype=mx.int32)
    T = mx.array([x + [PAD] * (Lt - len(x)) for x in t], dtype=mx.int32)
    return S, T[:, :-1], T[:, 1:]


def span_labels(rs, Ls, Lt=None):
    """G: 1 for general sentences (not personal-name data) (B,); N: 1 where the input character is inside a personal-name span (B,Ls).
    Given Lt, also returns NT: 1 where the output (To) position is inside the personal-name reading (name_target) (B,Lt)."""
    ps = LEAK.get("pos_src")  # when set, only rows of that src are positives (other personal-name sentences etc. are general = gate 0, KL target)

    def pos(r):
        return r.get("src") in ps if ps else r.get("source") == "names" or bool(r.get("names"))

    G = mx.array([0.0 if pos(r) else 1.0 for r in rs])
    N = []
    for r in rs:
        lab = [0.0] * Ls
        for nm in (r.get("names") or []) if pos(r) else []:
            st = 0
            while nm and (i := r["text"].find(nm, st)) >= 0:
                for j in range(i, min(i + len(nm), Ls)):
                    lab[j] = 1.0
                st = i + len(nm)
        N.append(lab)
    if Lt is None:
        return G, mx.array(N)
    NT = []
    for r in rs:
        lab = [0.0] * Lt
        nt = r.get("name_target") if pos(r) else None
        if nt and (i := r["target"].find(nt)) >= 0:
            for j in range(max(0, i - 1), min(i + len(nt) + 1, Lt)):  # one character on each side (boundary symbols) also counts as the name
                lab[j] = 1.0
        elif pos(r) and r.get("names"):
            lab = [1.0] * Lt  # no KL on personal-name sentences whose reading position is unknown
        NT.append(lab)
    return G, mx.array(N), mx.array(NT)


# Leak countermeasures for stacked memories (set in main)
LEAK = {"kl_all": False, "kl": 0.0, "gate_l1": 0.0, "gate_sup": 0.0, "gate_sup_neg": 1.0, "group": "mem2"}


def leak_loss_fn(model, S, Ti, To, ls, G, N, NT=None):
    """CE + aux + leak countermeasures:
    kl: on general sentences, match the "stacked output" to the "output without the target memory (frozen teacher)" by KL
    gate_l1: push the conditional gate to 0 on non-name input tokens / gate_sup: supervised BCE of the gate against the 0/1 personal-name spans"""
    mask = (To != PAD).astype(mx.float32)
    tgt = mold.memories(model, LEAK["group"])
    tot = 0.0
    if LEAK["kl"]:
        for m in tgt:
            m._st.off = True
        tl = mx.stop_gradient(model(S, Ti).astype(mx.float32))
        for m in tgt:
            m._st.off = False
    logits = model(S, Ti).astype(mx.float32)
    ce = nn.losses.cross_entropy(logits, To, label_smoothing=ls) * mask
    if (
        LEAK.get("span_w", 1.0) != 1.0 and NT is not None
    ):  # multiply the CE at the proper-noun reading positions of positive sentences by span_w (normalized by the original mask)
        ce = ce * (1 + (LEAK["span_w"] - 1) * (1 - G[:, None]) * NT)
    tot = ce.sum() / mask.sum() + mold.memory_aux_loss(model)
    if LEAK["kl"]:
        lp, lq = nn.log_softmax(tl, -1), nn.log_softmax(logits, -1)
        km = mask * (G[:, None] if not LEAK["kl_all"] or NT is None else G[:, None] + (1 - G[:, None]) * (1 - NT))
        kl = (mx.exp(lp) * (lp - lq)).sum(-1) * km
        tot = tot + LEAK["kl"] * kl.sum() / mx.maximum(1.0, km.sum())
    sm = (S != PAD).astype(mx.float32)
    for m in tgt:
        if m._st.cg is None:
            continue
        cg = m._st.cg
        if LEAK["gate_l1"]:
            w = sm * (1 - N)
            tot = tot + LEAK["gate_l1"] * (cg * w).sum() / mx.maximum(1.0, w.sum())
        if LEAK["gate_sup"]:
            c = mx.clip(cg, 1e-5, 1 - 1e-5)
            w = sm * (1 + (LEAK["gate_sup_neg"] - 1) * G[:, None])  # weight every token of general sentences as a 0 target
            bce = -(N * mx.log(c) + (1 - N) * mx.log(1 - c)) * w
            tot = tot + LEAK["gate_sup"] * bce.sum() / w.sum()
    return tot


def loss_fn(model, S, Ti, To, ls):
    logits = model(S, Ti).astype(mx.float32)  # compute the loss in float32 (stable even with BF16 training)
    mask = (To != PAD).astype(mx.float32)
    ce = nn.losses.cross_entropy(logits, To, label_smoothing=ls) * mask
    return ce.sum() / mask.sum()


def train_loss_fn(model, S, Ti, To, ls):
    """For training: CE + the load-balancing aux loss of the memory layers."""
    return loss_fn(model, S, Ti, To, ls) + mold.memory_aux_loss(model)


def dev_loss(model, rows, sv, tv, ls, bs=64):
    tot = n = 0.0
    for i in range(0, len(rows), bs):
        S, Ti, To = collate(rows[i : i + bs], sv, tv)
        m = (To != PAD).sum().item()
        tot += loss_fn(model, S, Ti, To, 0.0).item() * m
        n += m
    return tot / n


def parse_args():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default="configs/tiny.json")
    ap.add_argument("--data", type=Path, default=HERE / "data")
    ap.add_argument("--out", type=Path, default=HERE / "ckpt/tiny")
    ap.add_argument("--dtype", default="float32", choices=list(DT))
    ap.add_argument("--distill", action="store_true", help="also mix in data/distill.jsonl (distillation: quality is capped by pyopenjtalk)")
    ap.add_argument("--steps", type=int)
    ap.add_argument("--resume", action="store_true")
    ap.add_argument("--extra", type=Path, nargs="*", default=[], help="additional training jsonl (e.g. data/names/names_train.jsonl)")
    ap.add_argument("--only-extra", action="store_true", help="train on --extra only, without data/train.jsonl (e.g. to build just the personal-name memory)")
    ap.add_argument("--extra-repeat", type=int, default=1, help="how many times to repeat --extra in the mix")
    ap.add_argument("--init", type=Path, help="MoLD: start from the shared weights of an existing checkpoint (e.g. ckpt/tiny_aug). Memory layers start at 0")
    ap.add_argument(
        "--memory-only", action="store_true", help="MoLD: freeze the shared weights and train only the memory layers (to build a domain/dialect memory)"
    )
    ap.add_argument("--save-memory", type=Path, help="at the end, save only the memory layers to *.mem.safetensors")
    ap.add_argument("--pkm", action="append", default=[], help="memories to load after --init (repeatable / comma-separated, stacked)")
    ap.add_argument(
        "--train-mem",
        choices=["all", "mem", "mem2", "mem3"],
        default="all",
        help="memory group trained with --memory-only. With mem2, mem (general) is frozen. --save-memory also saves only this group",
    )
    ap.add_argument(
        "--mem-aug",
        type=Path,
        nargs="*",
        default=None,
        help=".koedict files for memory-aware training (default: the surnames and given names in dict/names). Can also be set by train.mem_aug in the config",
    )
    ap.add_argument("--mem-aug-names", type=float, help="fraction of personal-name sentences whose input is replaced by kana (default 0.4)")
    ap.add_argument("--mem-aug-general", type=float, help="fraction of other sentences replaced when a lexicon matches (default 0.1)")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--leak-kl", type=float, default=0.0, help="coefficient of the KL toward the output without the --train-mem memory on general sentences")
    ap.add_argument("--leak-kl-all", action="store_true", help="also apply the KL to the non-name output positions of personal-name sentences")
    ap.add_argument("--gate-l1", type=float, default=0.0, help="L1 coefficient on the conditional gate for non-name tokens")
    ap.add_argument(
        "--gate-sup-neg",
        type=float,
        default=1.0,
        help="weight of gate-sup on tokens of general sentences (no names) (>1 pushes the gate harder to 0 on general sentences)",
    )
    ap.add_argument("--span-w", type=float, default=1.0, help="CE weight at the reading positions of proper nouns (name_target) in positive sentences")
    ap.add_argument(
        "--pos-src",
        nargs="*",
        help="src values treated as positives by the leak countermeasures (e.g. places). Proper-noun sentences of other srcs count as general",
    )
    ap.add_argument(
        "--gate-sup",
        type=float,
        default=0.0,
        help="coefficient of the supervised BCE of the conditional gate against the personal-name spans (the names field)",
    )
    ap.add_argument(
        "--compile",
        action="store_true",
        help="mx.compile the training step (same loss; off by default because on Linux CPU recompiling per shape made it about 5%% slower)",
    )
    return ap.parse_args()


def load_data(a, tc, rng):
    """train / dev sentences: data/train.jsonl, --distill, --extra, then the memory-aware augmentation"""
    train, dev = read(a.data / "train.jsonl"), read(a.data / "dev.jsonl")
    if a.distill:
        d = read(a.data / "distill.jsonl")
        print(f"added {len(d)} distillation sentences")
        train += d
    if a.only_extra:
        train = []
    for p in a.extra:
        d = read(p)
        print(f"extra data {p}: {len(d)} sentences x{a.extra_repeat}")
        train += d * a.extra_repeat
    ma = tc.get("mem_aug", {})
    if a.mem_aug is not None or ma:
        nd = HERE.parents[2] / "dict/names"
        dicts = (
            a.mem_aug or [Path(p) if Path(p).is_absolute() else HERE / p for p in ma.get("dicts", [])] or [nd / "surnames.koedict", nd / "given_names.koedict"]
        )
        train = mem_augment(
            train,
            dicts,
            a.mem_aug_names if a.mem_aug_names is not None else ma.get("p_names", 0.4),
            a.mem_aug_general if a.mem_aug_general is not None else ma.get("p_general", 0.1),
            rng,
        )
    return train, dev


def build_model(a, cfg, sv, tv):
    """the model, from scratch, --resume, or --init (+ --pkm memories); -> (model, first step)"""
    model = Yomi(len(sv), len(tv), **cfg["model"])
    start = 0
    if a.resume and (a.out / "meta.json").exists():
        model.load_weights(str(a.out / "model.safetensors"))
        start = json.load(open(a.out / "meta.json"))["step"]
    if a.init:
        w = mx.load(str(a.init / "model.safetensors"))
        own = dict(__import__("mlx.utils", fromlist=["x"]).tree_flatten(model.parameters()))
        miss = [k for k in own if k not in w]
        bad = [k for k in own if k in w and w[k].shape != own[k].shape]
        if bad:
            raise SystemExit(f"--init {a.init}: mismatched weight shapes {bad[:3]} (make the model settings in the config match the source checkpoint)")
        dead = [k for k in w if k.endswith(".mem.slots") and float(mx.abs(w[k]).max()) < 1e-2 and k[: -len("slots")] + "gate" not in w]
        if dead:  # old memories (values initialized to 0, no gate) cannot be trained, so use a fresh initialization
            print(f"old memory layers {dead} have values 0 and no gate (old format), so they are not loaded and a fresh initialization is used")
            w = {k: v for k, v in w.items() if not mold.is_mem_key(k)}
        model.load_weights([(k, v) for k, v in w.items() if k in own], strict=False)
        print(f"init from {a.init}: {len(w)} tensors, new (memory layers) {len(miss)}")
    for p in mold.split_pkm(a.pkm):
        mold.load_memory(model, p)
        print(f"memory <- {p}")
    if a.memory_only:
        model.freeze()
        for m in mold.memories(model, None if a.train_mem == "all" else a.train_mem):
            m.unfreeze()
        print(f"memory-only: trainable {sum(v.size for _, v in __import__('mlx.utils', fromlist=['x']).tree_flatten(model.trainable_parameters()))/1e6:.2f}M")
    model.set_dtype(DT[a.dtype])
    return model, start


def make_optimizer(a, cfg, tc, model):
    total, wu = tc["steps"], tc["warmup"]

    def sched(s):
        return tc["lr"] * mx.minimum((s + 1) / wu, 0.5 * (1 + mx.cos(math.pi * mx.minimum(s / total, 1.0))))

    opt = optim.AdamW(learning_rate=sched, weight_decay=tc["weight_decay"])
    mm = tc.get("mem_lr_mult", 10.0)
    if any(cfg["model"].get(k) for k in ("memory", "memory2", "memory3")) and mm != 1.0:
        # A step touches only a few memory slots (sparse), so raise the learning rate and apply no weight decay to the value table
        def msched(s):
            return mm * sched(s)

        opt = optim.MultiOptimizer([optim.AdamW(learning_rate=msched, weight_decay=0.0), opt], [lambda path, w: mold.is_mem_key(path)])
        print(f"memory layer learning rate x{mm}")
    if a.resume and (a.out / "optimizer.safetensors").exists():
        from mlx.utils import tree_unflatten

        opt.init(model.trainable_parameters())
        opt.state = tree_unflatten(list(mx.load(str(a.out / "optimizer.safetensors")).items()))
    return opt


def make_step(a, tc, model, opt):
    """one training step (loss, clipped gradients, update), with the leak losses when asked for"""
    LEAK.update(
        kl_all=a.leak_kl_all,
        kl=a.leak_kl,
        gate_l1=a.gate_l1,
        gate_sup=a.gate_sup,
        gate_sup_neg=a.gate_sup_neg,
        pos_src=a.pos_src,
        span_w=a.span_w,
        group=a.train_mem if a.train_mem != "all" else "mem2",
    )
    use_leak = bool(a.leak_kl or a.gate_l1 or a.gate_sup)
    if use_leak:
        print(f"leak countermeasures {LEAK}")
    lg = nn.value_and_grad(model, leak_loss_fn if use_leak else train_loss_fn)
    ls = tc["label_smoothing"]

    def train_step(S, Ti, To, G, N, NT):
        loss, g = lg(model, S, Ti, To, ls, G, N, NT) if use_leak else lg(model, S, Ti, To, ls)
        g, _ = optim.clip_grad_norm(g, 1.0)
        opt.update(model, g)
        return loss

    if a.compile:
        from functools import partial

        if not opt.state:  # create the state first (to trace it as an input/output of the compiled function)
            opt.init(model.trainable_parameters())
        st = [model.state, opt.state, mx.random.state]
        train_step = partial(mx.compile, inputs=st, outputs=st)(train_step)
    return train_step


def dev_report(model, dev, sv, tv):
    model.eval()
    dl = dev_loss(model, dev, sv, tv, 0.0)
    model.train()
    gs = " ".join(
        f"{k.split('.')[-2]}@{k.split('.')[1]} {float(v.reshape(-1)[0]):.3f}"
        for k, v in __import__("mlx.utils", fromlist=["x"]).tree_flatten(model.parameters())
        if k.endswith(".gate") and mold.is_mem_key(k)
    )
    print(f"  dev loss {dl:.4f}" + (f"  gate {gs}" if gs else ""), flush=True)
    return dl


def main():
    a = parse_args()
    cfg = json.load(open(a.config))
    tc = cfg["train"]
    if a.steps:
        tc["steps"] = a.steps
    mx.random.seed(a.seed)
    rng = random.Random(a.seed)
    voc = json.load(open(a.data / "vocab.json", encoding="utf-8"))
    if a.init:  # use the vocabulary of the source checkpoint so the embedding rows line up
        voc = json.load(open(a.init / "meta.json", encoding="utf-8"))["vocab"]
    sv, tv = Vocab(voc["src"]), Vocab(voc["tgt"])
    train, dev = load_data(a, tc, rng)
    model, start = build_model(a, cfg, sv, tv)
    print(f"params: {yomi.n_params(model)/1e6:.2f}M  train {len(train)} dev {len(dev)}  dtype {a.dtype}")
    total = tc["steps"]
    opt = make_optimizer(a, cfg, tc, model)
    train_step = make_step(a, tc, model, opt)
    it = batches(train, sv, tv, tc["batch_size"], cfg["model"]["max_len"], rng)
    t0, run, log = time.time(), [], []
    tw = time.time()
    for step in range(start + 1, total + 1):
        loss = train_step(*next(it))
        mx.eval(model.parameters(), opt.state, loss)
        run.append(loss.item())
        if step % 50 == 0:
            now = time.time()
            print(
                f"step {step}/{total} loss {sum(run)/len(run):.4f} lr {opt.learning_rate.item():.2e} {(now-tw)/50:.3f}s/step "
                f" mem {mx.get_active_memory()/2**30:.2f}GB cache {mx.get_cache_memory()/2**30:.2f}GB",
                flush=True,
            )
            run = []
            tw = now
            mx.clear_cache()
        if step % tc["eval_every"] == 0 or step == total:
            log.append({"step": step, "dev_loss": dev_report(model, dev, sv, tv), "elapsed_s": time.time() - t0})
        if step % tc["save_every"] == 0 or step == total:
            yomi.save(a.out, model, cfg, voc, step, opt)
    json.dump(log, open(a.out / "train_log.json", "w"), indent=1)
    if a.save_memory:
        mold.save_memory(model, a.save_memory, {"from": str(a.out), "step": total}, None if a.train_mem == "all" else a.train_mem)
        print(f"memory -> {a.save_memory}")
    print(f"done {total} steps in {time.time()-t0:.1f}s -> {a.out}")


if __name__ == "__main__":
    main()
