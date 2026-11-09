"""One final test look, using only movement distances to pitch-value teachers."""

import json

import numpy as np
import torch
from memory import HERE
from value_metrics import distance
from values_data import load, target
from values_model import ValuesNet, predict


def check_results(model, checks, encoder):
    teachers = json.loads((HERE / "work/check_values.json").read_text())
    for s in checks:
        starts = s["dict"]["starts"]
        for a, z in zip(starts, [*starts[1:], len(s["morae"])], strict=True):
            for i in range(a, z):
                s["morae"][i]["ppos"] = i - a
                s["morae"][i]["bound"] = "start" if i == 0 else "#" if i == a else ""
        encoder.row(s)
    values = predict(model, checks)
    labels = [
        "そうだ",
        "そうだ",
        "寝てる",
        "着てる",
        "出てる",
        "見てる",
        "呼んでる",
        "読んでる",
        "持ってる",
        "盛ってる",
        "兼ねてる",
        "食べて",
        "やめて",
        "ぴかぴか",
        "当軒",
        "見たいもんだなあ",
    ]
    return [
        {
            "word": word,
            "check_index": index,
            "model": distance([teachers[s["name"]]["gold"]], [v])["movement_distance"],
            "dictionary": distance([teachers[s["name"]]["gold"]], [teachers[s["name"]]["dict"]])["movement_distance"],
            "confirmed_falls_zero_based": teachers[s["name"]]["confirmed_falls"],
        }
        for index, (s, v, word) in enumerate(zip(checks, values, labels, strict=True))
    ]


def size_report(model, saved):
    memory = model.memory.weight.numel() * 4
    weights = sum(p.numel() * 4 for p in model.parameters())
    metadata = (HERE / "work/qwen3.json").stat().st_size
    code = sum((HERE / name).stat().st_size for name in ["qwen3.mjs", "values_runtime.mjs"])
    keys = len(json.dumps(saved["vocab"]["keys"], ensure_ascii=False, separators=(",", ":")).encode())
    return {
        "memory_float32_mb": memory / 1e6,
        "networks_float32_mb": (weights - memory) / 1e6,
        "keys_utf8_mb": keys / 1e6,
        "other_metadata_mb": (metadata - keys) / 1e6,
        "runtime_code_mb": code / 1e6,
        "shipped_total_mb": (weights + metadata + code) / 1e6,
        "entries": len(saved["vocab"]["keys"]),
    }


def comparisons(model, test):
    values = predict(model, test)
    predictions = {"qwen3": values, "dictionary": [np.array(s["comparison"]["dict"]) for s in test], "qwen2": [np.array(s["comparison"]["q2"]) for s in test]}
    gold = [target(s["comparison"]["gold"], dtype=np.float64) for s in test]
    measured = [target(s["target"], dtype=np.float64) for s in test]
    masks = [np.isfinite(t) for t in measured]
    return {"gold": {k: distance(gold, p) for k, p in predictions.items()}, "qwen_measured": {k: distance(measured, p, masks) for k, p in predictions.items()}}


def record_test_look():
    path = HERE / "work/movement_test_looks.json"
    count = json.loads(path.read_text())["looks"] + 1 if path.exists() else 1
    path.write_text(json.dumps({"looks": count}) + "\n")
    return count


def trial_report():
    direct = json.loads((HERE / "work/values_movement_history.json").read_text())
    prior = json.loads((HERE / "work/values_prior_history.json").read_text())
    return {
        "direct_epochs": sum(r["phase"] in (0, 1) for r in direct),
        "word_residual_epochs": len(prior),
        "annotation_only_epochs": sum(r["phase"] == 2 for r in direct),
        "development_candidates": len(direct) + len(prior),
    }


def main():
    torch.set_num_threads(6)
    saved = torch.load(HERE / "work/qwen3.pt", weights_only=False, map_location="cpu")
    model = ValuesNet({k: len(v) for k, v in saved["vocab"].items()}, saved.get("word_prior", False))
    model.load_state_dict(saved["state"])
    rows, _, _, encoder, checks = load()
    test = [
        s
        for s in rows
        if s.get("test")
        and s["name"].startswith("BASIC5000_")
        and s["comparison"].get("gold")
        and s["comparison"].get("q2")
        and all(v is not None for v in s["comparison"]["q2"])
        and s.get("target")
    ]
    assert all(int(s["name"].split("_")[-1]) % 2 for s in test)
    result = {
        "test_looks": record_test_look(),
        "test_look_scope": "This movement experiment; pre-existing fall/RMSE attempts were not used for selection.",
        "distance": comparisons(model, test),
        "checks": check_results(model, checks, encoder),
        "checks_scope": "Full supplied check sentences; context retained. No checks used for selection.",
        "size": size_report(model, saved),
        "architecture": "word-value residual" if saved.get("word_prior", False) else "direct values",
        "selection": saved["selection"],
        "trials": trial_report(),
        "teacher_weights": saved["teacher_weights"],
        "training_loss": "Exact movement distance; no value regularizer, no mora weighting, no fall labels or outputs.",
        "device": "cpu; torch.backends.mps.is_available() returned false in sandbox",
        "runtime_verification": json.loads((HERE / "work/runtime_verification.json").read_text()),
        "checks_tuned": False,
        "data_audit": json.loads((HERE / "work/data_audit.json").read_text()),
        "teacher_mora_weighting": "None; unmodified linear-contour values carry accent movement.",
        "word_surrogate_targets": json.loads((HERE / "work/data_audit.json").read_text())["word_surrogates"],
    }
    assert result["size"]["shipped_total_mb"] < 100
    (HERE / "results/qwen3.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
