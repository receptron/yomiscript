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
    assert mx.allclose(base(src, tin), mm(src, tin), atol=1e-5).item()   # 値0初期化 → 出力同一
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
    assert mold.to_pron("サトウ") == "サトー" and mold.to_pron("ケイ") == "ケー" and mold.to_pron("ユウ") == "ユウ"
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
