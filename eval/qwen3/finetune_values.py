"""Optional annotation-only fine-tuning, selected using the same development metric."""

import json
import random
import time

import torch
from memory import HERE
from train_values import optimize, select
from values_data import load, training_split
from values_model import ValuesNet


def main():
    torch.set_num_threads(6)
    torch.manual_seed(23)
    random.seed(23)
    path = HERE / "work/qwen3_movement.pt"
    saved = torch.load(path, weights_only=False)
    model = ValuesNet({k: len(v) for k, v in saved["vocab"].items()}, saved.get("word_prior", False))
    model.load_state_dict(saved["state"])
    rows, _, _, _, _ = load()
    fit_rows, dev = training_split(rows)
    fit = [dict(s, y=y) for s in fit_rows for k, y in s["teachers"] if k == "gold"]
    history_path = HERE / "work/values_movement_history.json"
    history = json.loads(history_path.read_text())
    best = saved["selection"]["dev"]["movement_distance"]
    optimizer = torch.optim.Adam(model.parameters(), lr=0.0002)
    started = time.time()
    for epoch in range(20):
        loss = optimize(model, fit, optimizer)
        metrics = select(model, dev)
        record = {"phase": 2, "epoch": epoch + 1, "loss": loss, "dev": metrics, "fine_tune_seconds": time.time() - started}
        history.append(record)
        print(json.dumps(record), flush=True)
        if metrics["movement_distance"] < best:
            best = metrics["movement_distance"]
            torch.save(
                {
                    "state": model.state_dict(),
                    "word_prior": model.word_prior,
                    "vocab": saved["vocab"],
                    "selection": record,
                    "teacher_weights": {"gold": 1.0, "dict": 0.0, "qwen": 0.0},
                },
                path,
            )
        history_path.write_text(json.dumps(history, indent=1))


if __name__ == "__main__":
    main()
