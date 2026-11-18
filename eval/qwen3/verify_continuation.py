"""Verify split exclusion, all-part retrieval, float32 exports, and size limits."""

import ast
import json
from pathlib import Path

import torch
from experiment_models import Retrieval, predictions, restore
from generate_inflections import excluded
from infer_continuation import load_export
from memory import HERE
from run_continuation import metrics
from values_data import load, training_split

FILES = ["generate_inflections.py", "experiment_models.py", "run_continuation.py", "finish_continuation.py", "infer_continuation.py", "verify_continuation.py"]


def code_lengths():
    for name in FILES:
        for node in ast.walk(ast.parse((HERE / name).read_text())):
            if isinstance(node, ast.FunctionDef):
                assert node.end_lineno - node.lineno + 1 < 60, (name, node.name)


def verify_exports(dev, encoder, frozen):
    pretrained = torch.load(HERE / "work/continuation_pretrain.pt", weights_only=True)["memory.weight"]
    held = [i + 1 for i, (surface, _) in enumerate(encoder.vocab["keys"]) if excluded(surface)]
    for candidate in frozen["candidates"]:
        name = candidate["name"]
        saved = torch.load(HERE / f"work/{name}.pt", weights_only=False)
        assert all(v.dtype == torch.float32 and torch.isfinite(v).all() for v in saved["state"].values())
        assert torch.equal(saved["state"]["memory.weight"][held], pretrained[held])
        exported, meta = load_export(Path(HERE / f"work/{name}"))
        assert meta["vocab"] == saved["vocab"]
        score = metrics(dev, predictions(restore(saved), dev))
        for part in ["annotation", "measured_qwen", "S"]:
            assert abs(score[part] - saved["selection"]["dev"][part]) < 1e-6, (name, part)
        expected = predictions(restore(saved), dev[:5])
        actual = predictions(exported, dev[:5])
        for a, b in zip(expected, actual, strict=True):
            torch.testing.assert_close(torch.from_numpy(a), torch.from_numpy(b), rtol=0, atol=0)
    best = frozen["best"]
    for suffix in [".pt", ".bin", "_metadata.json"]:
        assert (HERE / f"work/{best}{suffix}").read_bytes() == (HERE / f"work/continuation_best{suffix}").read_bytes()
    return dict(
        exports_verified=len(frozen["candidates"]),
        heldout_memory_vectors_unchanged=len(held),
        exact_float32_export_parity=True,
        selection_metrics_reproduced=True,
    )


def main():
    torch.set_num_threads(6)
    code_lengths()
    rows, words, _, encoder, checks = load()
    fit, dev = training_split(rows)
    signatures = {tuple((m["ipa"], m["word"]) for m in r["morae"]) for r in checks}
    assert not any(tuple((m["ipa"], m["word"]) for m in r["morae"]) in signatures for r in fit + dev)
    assert not any(r.get("test") for r in fit + dev)
    assert not any(r["name"].startswith("CHECK_") for r in fit + dev)
    assert all(int(r["name"].split("_")[-1]) % 2 == 0 for r in fit + dev if r["name"].startswith("BASIC5000_"))
    fit = [r for r in fit if not any(excluded(m["word"]) for m in r["morae"])]
    audit = json.loads((HERE / "work/continuation_audit.json").read_text())
    assert len(fit) == audit["fit"]
    assert sum(not excluded(r["s"]) for r in words) == audit["word_teachers"]
    requests = json.loads((HERE / "work/inflection_requests.json").read_text())
    assert all(not excluded(surface) for surface, _ in requests)
    retrieval = Retrieval(encoder)
    ids = retrieval.candidates(dict(surface="持ってる", kana="モッテル"))
    keys = {tuple(encoder.vocab["keys"][i - 1]) for i in ids if i}
    assert any(s == "持っ" for s, _ in keys)
    assert any(s == "てる" for s, _ in keys)
    expected = {i + 1 for i, (s, k) in enumerate(encoder.vocab["keys"]) if s in "持ってる" and k in "モッテル"}
    assert set(ids) == expected
    path = HERE / "results/qwen4.json"
    result = json.loads(path.read_text())
    verified = dict(result["verification_before_test"])
    verified.update(splits=True, exclusion=True, substring_retrieval=True, function_lengths=True)
    (HERE / "work/continuation_verification.json").write_text(json.dumps(verified, indent=2))
    result["verification"] = verified
    path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(verified))


if __name__ == "__main__":
    main()
