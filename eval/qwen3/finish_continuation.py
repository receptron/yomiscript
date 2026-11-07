"""Freeze development selection, report checks, and evaluate the winner once."""

import hashlib
import json
import shutil
import time

import numpy as np
import torch
from evaluate_values import record_test_look
from experiment_models import Retrieval, predictions, restore
from memory import HERE
from rows import IPA_KANA
from run_continuation import metrics
from value_metrics import distance
from values_data import Encoder, load, target, training_split
from values_model import ValuesNet, predict

NAMES = ["qwen4", "qwen5", "qwen6", "qwen7", "qwen8", "qwen9", "qwen10", "qwen11"]
LABELS = [
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


def export(saved, name):
    tensors = []
    with (HERE / f"work/{name}.bin").open("wb") as out:
        for key, value in saved["state"].items():
            assert value.dtype == torch.float32
            out.write(value.numpy().astype("<f4").tobytes())
            tensors.append([key, list(value.shape)])
    meta = dict(
        vocab=saved["vocab"],
        ipa_kana=IPA_KANA,
        attention=saved["attention"],
        structured=saved["structured"],
        tensors=tensors,
        gain=saved.get("gain", 1.0),
        bounded_shape=saved.get("bounded_shape", False),
    )
    path = HERE / f"work/{name}_metadata.json"
    path.write_text(json.dumps(meta, ensure_ascii=False, separators=(",", ":")))
    code = sum(
        (HERE / f).stat().st_size
        for f in ["experiment_models.py", "values_model.py", "infer_continuation.py", "value_metrics.py", "values_data.py", "train_sentence.py", "memory.py"]
    )
    code += (HERE.parent.parent / "tools/yomiscript/kana2ipa.py").stat().st_size
    size = ((HERE / f"work/{name}.bin").stat().st_size + path.stat().st_size + code) / 1e6
    assert size < 100
    assert (HERE / f"work/{name}.pt").stat().st_size < 100e6
    return size


def prepare_checks(checks, encoder, retrieval):
    for row in checks:
        starts = row["dict"]["starts"]
        for a, z in zip(starts, [*starts[1:], len(row["morae"])], strict=True):
            for i in range(a, z):
                row["morae"][i]["ppos"] = i - a
                row["morae"][i]["bound"] = "start" if i == 0 else "#" if i == a else ""
        retrieval.row(encoder.row(row))


def check_scores(model, checks):
    teachers = json.loads((HERE / "work/check_values.json").read_text())
    values = predictions(model, checks)
    return [
        dict(word=label, check_index=i, distance=distance([teachers[row["name"]]["gold"]], [v])["movement_distance"])
        for i, (label, row, v) in enumerate(zip(LABELS, checks, values, strict=True))
    ]


def freeze():
    scores = []
    for name in NAMES:
        saved = torch.load(HERE / f"work/{name}.pt", map_location="cpu", weights_only=False)
        scores.append(dict(name=name, **saved["selection"]["dev"], epoch=saved["selection"]["epoch"]))
    best = min(scores, key=lambda r: r["S"])["name"]
    frozen = dict(best=best, candidates=scores, frozen_before_checks_and_test=True, time=time.time())
    (HERE / "work/continuation_selection.json").write_text(json.dumps(frozen, indent=2))
    return frozen


def report_candidates(frozen, checks, encoder, retrieval):
    prepare_checks(checks, encoder, retrieval)
    candidates = []
    for score in frozen["candidates"]:
        name = score["name"]
        saved = torch.load(HERE / f"work/{name}.pt", weights_only=False)
        model = restore(saved)
        check = check_scores(model, checks)
        size = export(saved, name)
        candidates.append(
            dict(
                **score,
                mean_check_distance=float(np.mean([c["distance"] for c in check])),
                checks=check,
                size_mb=size,
                attention=saved["attention"],
                structured=saved["structured"],
                gain=saved.get("gain", 1.0),
                bounded_shape=saved.get("bounded_shape", False),
                source=saved.get("calibration_source", saved["selection"].get("source", name)),
                checkpoint_mb=(HERE / f"work/{name}.pt").stat().st_size / 1e6,
            )
        )
    return candidates


def final_test(rows):
    saved = torch.load(HERE / "work/qwen4.pt", weights_only=False)
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
    encoder = Encoder(saved["vocab"])
    retrieval = Retrieval(encoder)
    for row in test:
        retrieval.row(encoder.row(row))
    marker = HERE / "work/continuation_test_started.json"
    if marker.exists():
        raise RuntimeError("Final candidate test scoring already started; inspect saved partial results.")
    marker.write_text(json.dumps(dict(candidates=NAMES, selection_frozen=True)))
    result = {}
    for name in NAMES:
        candidate = torch.load(HERE / f"work/{name}.pt", weights_only=False)
        assert candidate["vocab"] == saved["vocab"]
        count = record_test_look()
        result[name] = metrics(test, predictions(restore(candidate), test))
        (HERE / "work/continuation_test_partial.json").write_text(json.dumps(dict(results=result, cumulative_looks=count), indent=2))
    for name, kind in [("dictionary", "dict"), ("qwen2", "q2")]:
        result[name] = metrics(test, [target(s["comparison"][kind]) for s in test])
    return result, count


def baseline_dev(rows, checks):
    saved = torch.load(HERE / "work/qwen3.pt", weights_only=False)
    model = ValuesNet({k: len(v) for k, v in saved["vocab"].items()}, saved.get("word_prior", False))
    model.load_state_dict(saved["state"])
    _, dev = training_split(rows)
    dev = [r for r in dev if r.get("target") and any(k == "qwen" for k, _ in r["teachers"])]
    encoder = Encoder(saved["vocab"])
    for row in dev:
        encoder.row(row)
    return metrics(dev, predict(model, dev))


def preflight(frozen, rows, encoder, retrieval):
    from verify_continuation import verify_exports

    best = frozen["best"]
    for suffix in [".pt", ".bin", "_metadata.json"]:
        shutil.copyfile(HERE / f"work/{best}{suffix}", HERE / f"work/continuation_best{suffix}")
    _, dev = training_split(rows)
    dev = [r for r in dev if r.get("target") and any(k == "qwen" for k, _ in r["teachers"])]
    for row in dev:
        retrieval.row(encoder.row(row))
    return verify_exports(dev, encoder, frozen)


def main():
    if (HERE / "results/qwen4.json").exists():
        raise RuntimeError("Final test already recorded; do not repeat it.")
    torch.set_num_threads(6)
    frozen = freeze()
    rows, _, _, encoder, checks = load()
    retrieval = Retrieval(encoder)
    candidates = report_candidates(frozen, checks, encoder, retrieval)
    old_dev = baseline_dev(rows, checks)
    verified = preflight(frozen, rows, encoder, retrieval)
    tests, looks = final_test(rows)
    for candidate in candidates:
        candidate["test"] = tests[candidate["name"]]
    best = frozen["best"]
    digest = hashlib.sha256((HERE / f"work/{best}.bin").read_bytes()).hexdigest()
    result = dict(
        selection_metric="annotation + measured_qwen / 4",
        selection_split="166 fixed annotated development sentences with measured targets",
        candidates=candidates,
        best=best,
        previous_qwen3_dev=old_dev,
        test=tests,
        additional_test_looks=len(NAMES),
        additional_test_batches=1,
        test_look_definition="One full test-half evaluation per frozen candidate; eight in one final batch.",
        cumulative_movement_test_looks=looks,
        checks_used_for_selection=False,
        test_used_for_selection=False,
        audit=json.loads((HERE / "work/continuation_audit.json").read_text()),
        inflections=json.loads((HERE / "work/inflection_audit.json").read_text()),
        generation=json.loads((HERE / "work/inflection_generation.json").read_text()),
        generation_classes=json.loads((HERE / "work/inflection_classes.json").read_text()),
        compute=json.loads((HERE / "work/continuation_complete.json").read_text()),
        anchored_shape_seconds=json.loads((HERE / "work/qwen10_history.json").read_text())[-1]["seconds"],
        annotation_only_seconds=json.loads((HERE / "work/qwen11_history.json").read_text())[-1]["seconds"],
        refinement_seconds=json.loads((HERE / "work/qwen9_history.json").read_text())[-1]["seconds"],
        best_float32_sha256=digest,
        best_metadata_sha256=hashlib.sha256((HERE / f"work/{best}_metadata.json").read_bytes()).hexdigest(),
        development_trials=sum(len(json.loads((HERE / f"work/{name}_history.json").read_text())) for name in NAMES),
        device="cpu",
        dtype="float32 weights and model computations",
        verification_before_test=verified,
    )
    (HERE / "results/qwen4.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
