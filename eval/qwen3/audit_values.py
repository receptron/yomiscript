"""Audit splits and measure dictionary development distance without test inspection."""

import json

from memory import HERE
from rows import words_of
from value_metrics import distance
from values_data import load, training_split


def main():
    rows, words, vocab, encoder, checks = load()
    fit, dev = training_split(rows)
    names = {s["name"] for s in fit + dev}
    assert not names.intersection(s["name"] for s in checks)
    assert all(int(s["name"].split("_")[-1]) % 2 == 0 for s in fit + dev if s["name"].startswith("BASIC5000_"))
    assert len(names) == len(fit) + len(dev)
    total = sum(len(words_of(s)) for s in fit)
    found = sum(int(s["x"][w["at"], 0] > 0) for s in fit for w in words_of(s))
    report = {
        "fit_sentences": len(fit),
        "annotated_dev_sentences": len(dev),
        "fit_corpora": {k: sum(s["name"].startswith(k + "_") for s in fit) for k in ["BASIC5000", "WIKI", "WIKI2", "JKYB"]},
        "fit_teachers": {k: sum(t == k for s in fit for t, _ in s["teachers"]) for k in ["gold", "dict", "qwen"]},
        "word_keys": len(vocab["keys"]),
        "word_teachers": len(words),
        "word_surrogates": sum(bool(w.get("surrogate")) for w in words),
        "memory_lookup_coverage_fit": found / total,
        "dictionary_dev": distance([s["comparison"]["gold"] for s in dev], [s["comparison"]["dict"] for s in dev]),
        "odd_jsut_in_fit_or_dev": 0,
        "checks_in_fit_or_dev": 0,
    }
    del encoder
    (HERE / "work/data_audit.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report))


if __name__ == "__main__":
    main()
