"""JSON-lines inference using only the saved network and its memory keys."""

import json
import sys

import torch
from memory import HERE
from values_data import Encoder
from values_model import ValuesNet, predict


def main():
    torch.set_num_threads(4)
    saved = torch.load(HERE / "work/qwen3.pt", map_location="cpu", weights_only=False)
    vocab = saved["vocab"]
    encoder = Encoder(vocab)
    model = ValuesNet({k: len(v) for k, v in vocab.items()}, saved.get("word_prior", False))
    model.load_state_dict(saved["state"])
    for line in sys.stdin:
        rows = json.loads(line)
        print(json.dumps([v.round(3).tolist() for v in predict(model, [encoder.row(r) for r in rows])]), flush=True)


if __name__ == "__main__":
    main()
