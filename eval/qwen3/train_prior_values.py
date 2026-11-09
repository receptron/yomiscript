"""Compare a values residual from pretrained word contours, using development only."""

import json
import random
import time

import torch
from memory import HERE
from train_values import TEACHER_SETTINGS, optimize, select
from values_data import load, training_split
from values_model import ValuesNet


def save_checkpoint(model, vocab, record, weights, path):
    saved = {"state": model.state_dict(), "vocab": vocab, "word_prior": True, "selection": record, "teacher_weights": weights}
    torch.save(saved, path)


def run(model, fit, dev, vocab):
    selected_path = HERE / "work/qwen3_movement.pt"
    prior_path = HERE / "work/qwen3_prior.pt"
    overall = torch.load(selected_path, weights_only=False)["selection"]["dev"]["movement_distance"]
    best, history, started = float("inf"), [], time.time()
    for phase, weights in enumerate(TEACHER_SETTINGS):
        if phase:
            model.load_state_dict(torch.load(prior_path, weights_only=False)["state"])
        optimizer = torch.optim.Adam(model.parameters(), lr=0.001 if phase == 0 else 0.0003)
        examples = [dict(s, y=y, weight=weights[k]) for s in fit for k, y in s["teachers"]]
        for epoch in range(6):
            loss = optimize(model, examples, optimizer)
            metrics = select(model, dev)
            record = {"phase": f"prior_{phase}", "epoch": epoch + 1, "loss": loss, "dev": metrics, "seconds": time.time() - started}
            history.append(record)
            print(json.dumps(record), flush=True)
            score = metrics["movement_distance"]
            if score < best:
                best = score
                save_checkpoint(model, vocab, record, weights, prior_path)
            if score < overall:
                overall = score
                save_checkpoint(model, vocab, record, weights, selected_path)
            (HERE / "work/values_prior_history.json").write_text(json.dumps(history, indent=1))


def main():
    torch.set_num_threads(6)
    torch.manual_seed(19)
    random.seed(19)
    rows, _, vocab, _, _ = load()
    model = ValuesNet({k: len(v) for k, v in vocab.items()}, word_prior=True)
    model.load_state_dict(torch.load(HERE / "work/values_movement_pretrain.pt", weights_only=True))
    fit, dev = training_split(rows)
    run(model, fit, dev, vocab)


if __name__ == "__main__":
    main()
