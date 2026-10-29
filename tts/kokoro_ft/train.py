"""Train Kokoro bert/predictor on accent-marked ja + distill set. usage: train.py data.pt outdir steps device [ckpt_every]"""

import math
import os
import random
import sys
import time

import torch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ftlib as F


def main(data, out, steps, dev, every=1000, accum=8, lr=1e-4, ja_frac=0.7, log=print, resume=None):
    os.makedirs(out, exist_ok=True)
    D = torch.load(data, weights_only=False)
    ja = [x for x in D if x["lang"] == "ja"]
    ds = [x for x in D if x["lang"] != "ja"]
    random.seed(0)
    random.shuffle(ja)
    nv = max(1, len(ja) // 50)
    val, ja = ja[:nv], ja[nv:]
    m = F.load_model(dev, resume).train()
    m.decoder.eval()
    m.text_encoder.eval()
    ps = F.trainable(m)
    bert = [p for p in m.bert.parameters()]
    bid = {id(p) for p in bert}
    opt = torch.optim.AdamW([{"params": bert, "lr": lr * 0.2}, {"params": [p for p in ps if id(p) not in bid], "lr": lr}], weight_decay=1e-4)
    sch = torch.optim.lr_scheduler.LambdaLR(opt, lambda s: min(1, (s + 1) / 200) * 0.5 * (1 + math.cos(math.pi * min(s, steps) / steps)))
    V = {}

    def vp(n):
        return V.setdefault(n, F.voice(n))

    def step_loss(x):
        ids = torch.tensor([x["ids"]], device=dev)
        rs = vp(x["voice"])[min(len(x["ids"]) - 3, 509)].to(dev)
        dur = torch.tensor(x["dur"], device=dev)
        lg, F0, N = F.forward_train(m, ids, rs, dur)
        return F.loss_fn(lg, F0, N, dur, torch.as_tensor(x["f0"], device=dev), torch.as_tensor(x["n"], device=dev))

    def evaluate():
        m.eval()
        acc = {}
        with torch.no_grad():
            for x in val:
                _, d = step_loss(x)
                for k, v in d.items():
                    acc[k] = acc.get(k, 0) + v / len(val)
        m.train()
        m.decoder.eval()
        m.text_encoder.eval()
        return {k: round(v, 4) for k, v in acc.items()}

    hist = []
    v0 = evaluate()
    log(f"val@0 {v0}")
    hist.append((0, v0))
    t0 = time.time()
    run = {}
    for s in range(1, steps + 1):
        opt.zero_grad()
        for _ in range(accum):
            x = random.choice(ja) if (random.random() < ja_frac or not ds) else random.choice(ds)
            l, d = step_loss(x)
            (l / accum).backward()
            for k, v in d.items():
                run[k] = run.get(k, 0) + v
                run["_n"] = run.get("_n", 0) + 1
        torch.nn.utils.clip_grad_norm_(ps, 1.0)
        opt.step()
        sch.step()
        if s % max(1, min(100, steps // 10)) == 0:
            log(f"step {s} {({k:round(v/run['_n'],4) for k,v in run.items() if k!='_n'})} {time.time()-t0:.0f}s")
            run = {}
        if s % every == 0 or s == steps:
            vv = evaluate()
            hist.append((s, vv))
            log(f"val@{s} {vv}")
            torch.save({k: getattr(m, k).state_dict() for k in ("bert", "bert_encoder", "predictor")}, f"{out}/ft_{s}.pt")
            torch.save({k: getattr(m, k).state_dict() for k in ("bert", "bert_encoder", "predictor")}, f"{out}/ft_last.pt")
    return m, hist


if __name__ == "__main__":
    a = sys.argv
    main(a[1], a[2], int(a[3]), a[4], int(a[5]) if len(a) > 5 else 1000)
