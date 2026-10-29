import torch
from exact_stft import use_exact_stft  # STFT identical to torch.stft/istft (kokoro's CustomSTFT is approximate)
from kokoro import KModel

m = use_exact_stft(KModel(repo_id="hexgrad/Kokoro-82M", disable_complex=True).eval())
m.requires_grad_(False)


class B(torch.nn.Module):
    def __init__(s):
        super().__init__()
        s.m = m


class Enc(B):
    def forward(s, ids, ref):
        L = ids.shape[1]
        il = torch.full((1,), L, dtype=torch.long)
        tm = torch.zeros(1, L, dtype=torch.bool)
        d_en = m.bert_encoder(m.bert(ids, attention_mask=(~tm).int())).transpose(-1, -2)
        st = ref[:, 128:]
        d = m.predictor.text_encoder(d_en, st, il, tm)
        xx, _ = m.predictor.lstm(d)
        dur = torch.round(torch.sigmoid(m.predictor.duration_proj(xx)).sum(-1)).clamp(min=1).long().squeeze(0)
        return dur, d.transpose(-1, -2), m.text_encoder(ids, il, tm)


class F0N(B):
    def forward(s, en, ref):
        return m.predictor.F0Ntrain(en, ref[:, 128:])


class Dec(B):
    def forward(s, asr, F0, N, ref):
        return m.decoder(asr, F0, N, ref[:, :128]).squeeze()


ids = torch.LongTensor([[0] + list(range(16, 60)) + [0]])
ref = torch.randn(1, 256)
L = ids.shape[1]
with torch.no_grad():
    dur, d, t = Enc()(ids, ref)
    T = 60
    en = torch.randn(1, d.shape[1], T)
    asr = torch.randn(1, t.shape[1], T)
    F0, N = F0N()(en, ref)
    kw = dict(opset_version=17, dynamo=False)
    torch.onnx.export(
        Enc(),
        (ids, ref),
        "models/enc.onnx",
        input_names=["ids", "ref"],
        output_names=["dur", "d", "t_en"],
        dynamic_axes={"ids": {1: "L"}, "dur": {0: "L"}, "d": {2: "L"}, "t_en": {2: "L"}},
        **kw,
    )
    torch.onnx.export(
        F0N(),
        (en, ref),
        "models/f0n.onnx",
        input_names=["en", "ref"],
        output_names=["F0", "N"],
        dynamic_axes={"en": {2: "T"}, "F0": {1: "T2"}, "N": {1: "T2"}},
        **kw,
    )
    torch.onnx.export(
        Dec(),
        (asr, F0, N, ref),
        "models/dec.onnx",
        input_names=["asr", "F0", "N", "ref"],
        output_names=["audio"],
        dynamic_axes={"asr": {2: "T"}, "F0": {1: "T2"}, "N": {1: "T2"}, "audio": {0: "S"}},
        **kw,
    )
print("ok", d.shape, t.shape, F0.shape)
