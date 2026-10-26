import sys
from pathlib import Path
HERE = Path(__file__).resolve().parents[1]; sys.path.insert(0, str(HERE))
ROOT = HERE.parents[2]
import mlx.core as mx
import mold, yomi

def test_parse_sample():
    es = mold.parse_koedict((ROOT / "dict/sample.koedict").read_text())
    assert any(e.surface == "市" and e.default for e in es)
    assert any(e.dialect == "kansai" for e in es)

def test_priority_and_sex():
    g = mold.LexMemory.from_file(ROOT / "dict/names/given_names.koedict")
    s = mold.LexMemory.from_file(ROOT / "dict/names/surnames.koedict")
    r = mold.MemoryRouter([s, g])
    assert r.resolve("智さんが来た", {"sex": "female"})[0] == "トモさんが来た"
    assert r.resolve("智さんが来た", {"sex": "male"})[0] == "サトシさんが来た"
    assert r.resolve("{智|ちえ}さんが来た", {"sex": "male"})[0] == "チエさんが来た"   # 注記が最優先
    assert r.resolve("正しい", None)[0] == "正しい"                                  # 人名でない位置には出ない
    assert r.resolve("佐藤光が来た", {"sex": "female"})[0].startswith("サトーヒカリ")   # 苗字の隣は人名

def test_context_and_default():
    m = mold.LexMemory.from_file(ROOT / "dict/sample.koedict")
    r = mold.MemoryRouter([m])
    assert "イチ" in r.resolve("朝市の市で買う")[0]
    assert r.resolve("市へ行く")[0].startswith("シへ") and r.resolve("市役所")[0] == "市役所"

def test_swap_and_backcompat(tmp_path):
    cfg = dict(d_model=32, n_heads=2, d_ff=64, enc_layers=2, dec_layers=1, max_len=64)
    base = yomi.Yomi(20, 10, **cfg)
    mm = yomi.Yomi(20, 10, **cfg, memory={"layers": [1], "n_keys": 8, "k_dim": 8, "topk": 4})
    from mlx.utils import tree_flatten
    mm.load_weights(list(tree_flatten(base.parameters())), strict=False)
    src = mx.array([[5, 6, 7, 0]]); tin = mx.array([[1, 4, 5]])
    assert mx.allclose(base(src, tin), mm(src, tin), atol=1e-5).item()   # v2: 値0 (ゲート1) → 出力同一
    assert float(mm.enc[1].mem.gate.item()) == 1.0
    p = tmp_path / "a.mem.safetensors"
    mm.enc[1].mem.slots = mx.ones_like(mm.enc[1].mem.slots)
    mold.save_memory(mm, p)
    mm.enc[1].mem.slots = mx.zeros_like(mm.enc[1].mem.slots)
    mold.load_memory(mm, p)
    assert mm.enc[1].mem.slots.sum().item() > 0
    assert mm.generate(src, max_new=4) == mm.generate_nocache(src, max_new=4)

def test_layer_override(tmp_path):
    b = tmp_path / "base.koedict"; b.write_text("# layer: base\n@lexicon { 市場 = シジョー; }\n")
    u = tmp_path / "user.koedict"; u.write_text("@lexicon { 市場 = イチバ; }\n")
    r = mold.MemoryRouter([mold.LexMemory.from_file(b), mold.LexMemory.from_file(u)])
    assert r.resolve("市場へ")[0] == "イチバへ"
    import pytest
    with pytest.raises(ValueError):
        mold.LexMemory.from_file(tmp_path / "x.csv")

def test_pron_normalization():
    assert mold.to_pron("サトウ") == "サトー" and mold.to_pron("ケイ") == "ケー" and mold.to_pron("ユウコ") == "ユーコ" and mold.to_pron("ユイ") == "ユイ"
    s = mold.LexMemory.from_file(ROOT / "dict/names/surnames.koedict")
    g = mold.LexMemory.from_file(ROOT / "dict/names/given_names.koedict")
    assert mold.MemoryRouter([s, g], tokenizer=None).resolve("佐藤光が来た", ["female"])[0].startswith("サトーヒカリ")

def test_split_name_phrases():
    assert mold.split_name_phrases("^サ[トーヒ]カリガ$", [("サトー", "ヒカリ")]) == "^サ[トー#ヒ]カリガ$"
    assert mold.split_name_phrases("^サ[トーヒカリガ$", [("サトー", "ヒカリ")]) == "^サ[トー#ヒ[カリガ$"
    assert mold.split_name_phrases("^サ]トー#ヒ[カリ]ガ$", [("サトー", "ヒカリ")]) == "^サ]トー#ヒ[カリ]ガ$"
    s = mold.LexMemory.from_file(ROOT / "dict/names/surnames.koedict")
    g = mold.LexMemory.from_file(ROOT / "dict/names/given_names.koedict")
    r = mold.MemoryRouter([s, g], tokenizer=None)
    _, log = r.resolve("佐藤光が来た", ["female"])
    assert r.postprocess("^サ[トーヒ]カリガ#キ]タ$", log) == "^サ[トー#ヒ]カリガ#キ]タ$"

def test_no_replace_inside_word():
    m = mold.LexMemory.from_file(ROOT / "dict/sample.koedict")
    for tok in (None, "auto"):
        r = mold.MemoryRouter([m], tokenizer=tok)
        out = r.resolve("朝市の市で魚を買う。")[0]
        assert out.startswith("朝市の"), out          # 朝市 の中は置換しない
        assert "のイチで" in out, out                    # 独立した 市 は文脈 (朝市) で イチ
    b = Path(__file__).parent / "_tmp_base.koedict"
    b.write_text("# layer: base\n@lexicon { 朝市 = アサイチ; }\n")
    try:
        r = mold.MemoryRouter([mold.LexMemory.from_file(b), m], tokenizer=None)
        assert r.resolve("朝市の市で")[0] == "アサイチのイチで"   # 長い一致 (base) が勝つ
    finally:
        b.unlink()


def test_pkm_cosine_routing_not_collapsed():
    """v2: コサイン類似度 x 温度なのでスコアが有界、softmax が one-hot にならず、ゲートも 0 でない。"""
    import mlx.nn as nn
    mx.random.seed(0)
    m = mold.ProductKeyMemory(64, n_keys=16, k_dim=16, topk=4, temp=15.0)
    x = mx.random.normal((4, 32, 64)) * 20.0  # 残差ノルムが大きくてもスコアは膨らまない
    assert float(mx.abs(m(x)).max()) == 0.0  # 値 0 初期化 → 開始時の出力は 0
    m.slots = mx.random.normal(m.slots.shape)  # 学習後を模擬
    mold.ProductKeyMemory.probe = []
    out = m(x)
    w, idx, _, _, sc = mold.ProductKeyMemory.probe[0]; mold.ProductKeyMemory.probe = None
    assert float(mx.abs(sc).max()) <= 2 * 15.0 + 1e-3
    assert float(w.max(-1).mean()) < 0.9
    assert len(set(idx.flatten().tolist())) > 64
    ratio = float(mx.linalg.norm(out, axis=-1).mean() / mx.linalg.norm(x, axis=-1).mean())
    assert 0.02 < ratio < 2.0
    aux = m._st.aux
    assert float(aux) >= -1e-4
    # 負荷分散 loss の勾配は query / subkeys に流れる
    def f(mod, x):
        mod(x); return mod._st.aux
    _, g = nn.value_and_grad(m, f)(m, x)
    r = mx.random.normal(x.shape)
    m.slots = mx.zeros_like(m.slots)
    _, gs = nn.value_and_grad(m, lambda mod, x: (mod(x) * r).sum())(m, x)
    assert float(mx.abs(gs["slots"]).sum()) > 0  # 値 0 でもゲート 1 なので値に勾配が流れる
    assert float(mx.abs(g["subkeys"]).sum()) > 0 and float(mx.abs(g["query"]["weight"]).sum()) > 0
    assert "_st" not in dict(__import__("mlx.utils", fromlist=["x"]).tree_flatten(m.parameters()))


def test_stacked_memories(tmp_path):
    cfg = dict(d_model=32, n_heads=2, d_ff=64, enc_layers=2, dec_layers=1, max_len=64)
    m = {"layers": [1], "n_keys": 8, "k_dim": 8, "topk": 4}
    mm = yomi.Yomi(20, 10, **cfg, memory=m, memory2=dict(m, cond_gate=True))
    assert mm.enc[1].mem2.cgate is not None
    mm.enc[1].mem.slots = mx.ones_like(mm.enc[1].mem.slots)
    mm.enc[1].mem2.slots = 2 * mx.ones_like(mm.enc[1].mem2.slots)
    a, b = tmp_path / "a.mem.safetensors", tmp_path / "b.mem.safetensors"
    mold.save_memory(mm, a, group="mem"); mold.save_memory(mm, b, group="mem2")
    for x in ("mem", "mem2"):
        setattr(getattr(mm.enc[1], x), "slots", mx.zeros_like(mm.enc[1].mem.slots))
    for p in mold.split_pkm([f"{a},{b}"]):
        mold.load_memory(mm, p)
    assert mm.enc[1].mem.slots.max().item() == 1.0 and mm.enc[1].mem2.slots.max().item() == 2.0
    assert len(mold.memories(mm)) == 2 and mold.is_mem_key("enc.1.mem2.slots", "mem2")
    assert not mold.is_mem_key("enc.1.mem2.slots", "mem")


def test_leak_losses():
    import train
    cfg = dict(d_model=32, n_heads=2, d_ff=64, enc_layers=2, dec_layers=1, max_len=64)
    m = {"layers": [1], "n_keys": 8, "k_dim": 8, "topk": 4}
    mm = yomi.Yomi(20, 10, **cfg, memory=m, memory2=dict(m, cond_gate=True))
    G, N = train.span_labels([{"text": "abcab", "names": ["ab"]}, {"text": "xyz"}], 6)
    assert G.tolist() == [0.0, 1.0] and N.tolist()[0] == [1, 1, 0, 1, 1, 0]
    S = mx.array([[5, 6, 7, 5, 6, 0], [5, 6, 7, 0, 0, 0]]); Ti = mx.array([[1, 4, 5]] * 2); To = mx.array([[4, 5, 2]] * 2)
    train.LEAK.update(kl=1.0, gate_l1=0.1, gate_sup=1.0, group="mem2")
    base = float(train.train_loss_fn(mm, S, Ti, To, 0.0))
    tot = float(train.leak_loss_fn(mm, S, Ti, To, 0.0, G, N))
    assert tot > base  # KL は 0 (mem2 値 0)、ゲート項 (0.5) が乗る
    assert not mm.enc[1].mem2._st.off
    train.LEAK.update(kl=0.0, gate_l1=0.0, gate_sup=0.0)


def test_stacked_load_keeps_default_memory(tmp_path):
    """回帰: 積み重ね読み込み (ckpt の値とは別の既定メモリ + mem2) で mem0 のゲート・値がファイルと一致する。"""
    import json as _j
    from mlx.utils import tree_flatten
    m = {"layers": [1], "n_keys": 8, "k_dim": 8, "topk": 4}
    cfg = dict(d_model=32, n_heads=2, d_ff=64, enc_layers=2, dec_layers=1, max_len=64, memory=m, memory2=dict(m, layers=[1], cond_gate=True))
    mm = yomi.Yomi(20, 10, **cfg)
    mm.enc[1].mem.slots = mx.full(mm.enc[1].mem.slots.shape, 0.3); mm.enc[1].mem.gate = mx.array([1.7])
    a = tmp_path / "def.mem.safetensors"; mold.save_memory(mm, a, group="mem")
    mm.enc[1].mem2.slots = mx.full(mm.enc[1].mem2.slots.shape, 0.5)
    b = tmp_path / "n.mem2.safetensors"; mold.save_memory(mm, b, group="mem2")
    assert all(".mem2." in k for k in mx.load(str(b)))      # mem2 ファイルに mem0 は入らない
    # ckpt 側は mem0 がオフ (ゲート0・値0)
    mm.enc[1].mem.slots = mx.zeros_like(mm.enc[1].mem.slots); mm.enc[1].mem.gate = mx.array([0.0])
    ck = tmp_path / "ck"; ck.mkdir()
    mx.save_safetensors(str(ck / "model.safetensors"), dict(tree_flatten(mm.parameters())))
    voc = {"src": [chr(65 + i) for i in range(16)], "tgt": [chr(97 + i) for i in range(6)]}
    (ck / "meta.json").write_text(_j.dumps({"vocab": voc, "config": {"model": cfg}}))
    for spec in (f"{a},{b}", [str(a), str(b)], f"{b},{a}"):
        mo, *_ = yomi.load(ck, memory=spec)
        assert abs(float(mo.enc[1].mem.gate.item()) - 1.7) < 1e-6
        assert mx.allclose(mo.enc[1].mem.slots, mx.full(mo.enc[1].mem.slots.shape, 0.3)).item()
        assert mx.allclose(mo.enc[1].mem2.slots, mx.full(mo.enc[1].mem2.slots.shape, 0.5)).item()


def test_gate_floor_and_cg_thresh():
    m = mold.ProductKeyMemory(16, n_keys=4, k_dim=8, topk=2, gate_floor=0.3, cond_gate=True, cg_thresh=0.6)
    m.slots = mx.ones_like(m.slots); m.gate = mx.array([0.0])
    x = mx.random.normal((1, 3, 16)); m.eval()
    assert float(mx.abs(m(x)).sum()) == 0.0          # eval: cg=0.5 < 0.6 → 0
    m.train(); assert float(mx.abs(m(x)).sum()) > 0   # 学習中: ゲート下限 0.3 で出力あり
    def f(gt):
        m.gate = gt; return m(x).sum()
    assert float(mx.abs(mx.grad(f)(mx.array([0.0]))).sum()) > 0  # straight-through: ゲートへ勾配が流れる
