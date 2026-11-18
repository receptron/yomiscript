"""Check exported JS arithmetic and input encoding against PyTorch on development inputs."""

import json
import subprocess

import numpy as np
import torch
from memory import HERE
from values_data import Encoder, held, read
from values_model import ValuesNet, predict


def main():
    torch.set_num_threads(4)
    saved = torch.load(HERE / "work/qwen3.pt", weights_only=False, map_location="cpu")
    encoder = Encoder(saved["vocab"])
    rows = [r for r in read(HERE.parent / "qwen_prosody/work/pitch_rows.json") if not r.get("test") and held(r["name"])][:5]
    for row in rows:
        encoder.row(row)
    model = ValuesNet({k: len(v) for k, v in saved["vocab"].items()}, saved.get("word_prior", False))
    model.load_state_dict(saved["state"])
    expected = predict(model, rows)
    probe = [{"morae": r["morae"], "x": r["x"].tolist(), "values": v.tolist()} for r, v in zip(rows, expected, strict=True)]
    result = subprocess.run(["node", "verify_values.mjs"], input=json.dumps(probe), text=True, capture_output=True, check=True, cwd=HERE)
    verification = json.loads(result.stdout)
    pretrained = torch.load(HERE / "work/values_movement_pretrain.pt", weights_only=True)
    updated = (model.memory.weight.detach() != pretrained["memory.weight"]).any(1).sum().item()
    assert updated > 0
    verification["memory_vectors_updated_in_sentence_training"] = updated
    assert verification["maximum_value_difference"] < 1e-4
    assert verification["encoding_matches"]
    print(json.dumps(verification))
    (HERE / "work/runtime_verification.json").write_text(json.dumps(verification, indent=2) + "\n")
    assert all(np.isfinite(v).all() for v in expected)


if __name__ == "__main__":
    main()
