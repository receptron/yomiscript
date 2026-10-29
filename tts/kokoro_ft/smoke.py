"""Box smoke test: fake 'real' ja audio = Kokoro jm_kumo voice; 6 ja + 4 distill; few CPU steps."""

import json
import sys
import warnings

import numpy as np
import torch

warnings.filterwarnings("ignore")
sys.path.insert(0, ".")
import ftlib as F
import prep
import train
import ys_ja

torch.manual_seed(0)
dev = "cpu"
m = F.load_model(dev).eval()
vj = F.voice("jf_alpha")
vk = F.voice("jm_kumo")
T = [
    "愛情のために彼女の欠点が見えなかった。",
    "今日は雨が降っています。",
    "橋と箸と端です。",
    "東京駅で友達に会いました。",
    "この本はとても面白いです。",
    "明日の会議は十時からですか？",
]
D = []
for t in T:
    ys = ys_ja.text2ys(t)
    ph = ys_ja.ys2ph(ys)
    real = F.synth(m, ph, vk, keep_marks=False)
    x = prep.make_ja(m, ph, real, 24000, vj, dev)
    x.update(lang="ja", voice="jf_alpha", ys=ys)
    D.append(x)
    print(ys, len(x["ids"]), sum(x["dur"]), len(x["f0"]))
for d in json.load(open("./distill_ph.json"))[::150][:4]:
    x = prep.make_distill(m, d["ph"], F.voice(d["voice"]), dev)
    x.update(lang=d["lang"], voice=d["voice"])
    D.append(x)
torch.save(D, "/tmp/smoke.pt")
with torch.no_grad():
    print(
        "train-set loss before:",
        {
            k: round(
                np.mean(
                    [
                        F.loss_fn(
                            *F.forward_train(m, torch.tensor([x["ids"]]), F.voice(x["voice"])[len(x["ids"]) - 3], torch.tensor(x["dur"])),
                            torch.tensor(x["dur"]),
                            torch.as_tensor(x["f0"]),
                            torch.as_tensor(x["n"]),
                        )[1][k]
                        for x in D
                    ]
                ),
                4,
            )
            for k in ["dur", "ce", "f0", "n"]
        },
    )
del m
mm, h = train.main("/tmp/smoke.pt", "/tmp/smoke_out", int(sys.argv[1]) if len(sys.argv) > 1 else 30, dev, every=1000, accum=4, lr=3e-4, ja_frac=0.7)
mm.eval()
torch.set_grad_enabled(False)
print(
    "train-set loss after:",
    {
        k: round(
            np.mean(
                [
                    F.loss_fn(
                        *F.forward_train(mm, torch.tensor([x["ids"]]), F.voice(x["voice"])[len(x["ids"]) - 3], torch.tensor(x["dur"])),
                        torch.tensor(x["dur"]),
                        torch.as_tensor(x["f0"]),
                        torch.as_tensor(x["n"]),
                    )[1][k]
                    for x in D
                ]
            ),
            4,
        )
        for k in ["dur", "ce", "f0", "n"]
    },
)
import soundfile as sf

w = F.synth(mm.eval(), ys_ja.ys2ph(D[2]["ys"]), vj)
sf.write("/tmp/smoke_ja.wav", w, 24000)
print("synth ok", w.shape)
