"""Infer float32 pitch values from mora rows using the exported key table only."""

import argparse
import json

import numpy as np
import torch
from experiment_models import ExperimentNet, Retrieval, predictions
from values_data import Encoder


def load_export(prefix):
    meta = json.loads(prefix.with_name(prefix.name + "_metadata.json").read_text())
    model = ExperimentNet({k: len(v) for k, v in meta["vocab"].items()}, meta["attention"], meta["structured"], meta.get("bounded_shape", False))
    flat = np.fromfile(prefix.with_suffix(".bin"), dtype="<f4")
    offset, state = 0, {}
    for key, shape in meta["tensors"]:
        count = int(np.prod(shape))
        state[key] = torch.from_numpy(flat[offset : offset + count].reshape(shape).copy())
        offset += count
    assert offset == len(flat)
    model.gain = meta.get("gain", 1.0)
    model.load_state_dict(state)
    return model, meta


def infer(prefix, rows):
    model, meta = load_export(prefix)
    encoder = Encoder(meta["vocab"])
    retrieval = Retrieval(encoder)
    for row in rows:
        retrieval.row(encoder.row(row))
    return predictions(model, rows)


def main():
    from pathlib import Path

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("rows", type=Path, help="Local JSON mora rows with word spans and supplied phrase positions")
    parser.add_argument("--model", type=Path, default=Path("work/continuation_best"))
    args = parser.parse_args()
    torch.set_num_threads(6)
    values = infer(args.model, json.loads(args.rows.read_text()))
    print(json.dumps([v.tolist() for v in values]))


if __name__ == "__main__":
    main()
