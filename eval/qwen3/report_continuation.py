"""Append measured results to README without rerunning inference."""

import json

from memory import HERE


def candidate_table(result):
    lines = [
        "\n### Measured continuation results\n",
        "These are **test** distances for all frozen final candidates; checks are report-only. "
        "Decimal MB includes float32 weights, all keys, metadata, and inference source.\n",
        "| Candidate | Annotation | Measured Qwen | S | Mean checks | MB |",
        "| --- | ---: | ---: | ---: | ---: | ---: |",
    ]
    for row in result["candidates"]:
        r = dict(row, **row["test"])
        lines.append(f"| {r['name']} | {r['annotation']:.4f} | {r['measured_qwen']:.4f} | {r['S']:.4f} | {r['mean_check_distance']:.4f} | {r['size_mb']:.3f} |")
    return lines


def test_table(result):
    best = result["best"]
    test = result["test"][best]
    lines = [
        "",
        f"Development selected **{best}**. The final test batch covers {test['sentences']} odd JSUT sentences.",
        "",
        "| Test model | Annotation | Measured Qwen | S |",
        "| --- | ---: | ---: | ---: |",
    ]
    for name in ["dictionary", "qwen2"]:
        r = result["test"][name]
        lines.append(f"| {name} | {r['annotation']:.4f} | {r['measured_qwen']:.4f} | {r['S']:.4f} |")
    previous = json.loads((HERE / "results/qwen3.json").read_text())
    a = previous["distance"]["gold"]["qwen3"]["movement_distance"]
    q = previous["distance"]["qwen_measured"]["qwen3"]["movement_distance"]
    lines.append(f"| Frozen qwen-3 (earlier look) | {a:.4f} | {q:.4f} | {a + q / 4:.4f} |")
    verdict = "beats" if test["S"] < 0.914 else "does not beat"
    lines.extend(
        [
            "",
            f"The winner {verdict} the stated test benchmark S = 0.914. "
            f"Eight candidate test looks in one final batch bring the shared counter to **{result['cumulative_movement_test_looks']}**. "
            "All candidates and the winner were frozen before checks or test; test scores did not change selection.",
        ]
    )
    return lines


def development_table(result):
    lines = [
        "",
        "Development selection (same 166 sentences for every candidate):",
        "",
        "| Candidate | Annotation | Measured Qwen | S |",
        "| --- | ---: | ---: | ---: |",
    ]
    for row in result["candidates"]:
        lines.append(f"| {row['name']} | {row['annotation']:.4f} | {row['measured_qwen']:.4f} | {row['S']:.4f} |")
    return lines


def check_table(result):
    extra_seconds = sum(result[k] for k in ["refinement_seconds", "anchored_shape_seconds", "annotation_only_seconds"])
    winner = next(c for c in result["candidates"] if c["name"] == result["best"])
    lines = ["", "| Best candidate check | Distance |", "| --- | ---: |"]
    for r in winner["checks"]:
        lines.append(f"| {r['check_index']}: {r['word']} | {r['distance']:.4f} |")
    lines.extend(
        [
            "",
            f"The check mean is {winner['mean_check_distance']:.4f}. "
            f"There were {result['development_trials']} development settings: "
            "72 main epoch checkpoints, 60 refinement/adapter checkpoints, and 17 gain settings. "
            f"Main run wall time was {result['compute']['seconds'] / 60:.1f} minutes; "
            f"recorded refinement/adapter time was {extra_seconds / 60:.1f} minutes.",
            "",
            "Selected weights: `work/continuation_best.pt`, with raw float32 weights and metadata alongside it. "
            "Full measurements: [results/qwen4.json](results/qwen4.json).",
            "",
            "Next step: use a separate development set with held-out verb lemmas to choose inflection retrieval "
            "and relative-entry positions; keep these test sentences and confirmed checks for final reporting.\n",
        ]
    )
    return lines


def findings(result):
    return [
        "",
        "No candidate beats S = 0.914, and the selected model's checks remain far. "
        "Gain calibration and the bounded adapter slightly improve test S over qwen4. "
        "Inflection teachers reduce report-only check mean from 1.0120 to 0.5721; "
        "attention reduces it further to 0.5327, while worsening S. "
        "The unanchored shape branch and both whole-model refinements do not improve S. "
        "No new candidate is better on both teacher distances than the dictionary or qwen2.",
        "",
        "All eight float32 exports match their checkpoints exactly on development probes, "
        "all saved selection scores reproduce, and 11,711 held-out memory vectors stay unchanged. "
        "The split and generated-request exclusion audits pass. "
        "All inference payloads and individual checkpoints are below 100 decimal MB.",
    ]


def main():
    result = json.loads((HERE / "results/qwen4.json").read_text())
    lines = candidate_table(result) + development_table(result) + test_table(result) + findings(result) + check_table(result)
    path = HERE / "README.md"
    marker = "\n### Measured continuation results\n"
    text = path.read_text().split(marker)[0]
    path.write_text(text + "\n".join(lines))


if __name__ == "__main__":
    main()
