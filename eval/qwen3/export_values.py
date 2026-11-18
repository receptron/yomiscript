"""Export the selected float32 weights and UTF-8 memory keys for dependency-free JS inference."""

import json

import numpy as np
import torch
from memory import HERE
from rows import IPA_KANA


def main():
    saved = torch.load(HERE / "work/qwen3.pt", weights_only=False, map_location="cpu")
    tensors = []
    with (HERE / "work/qwen3.bin").open("wb") as out:
        for name, tensor in saved["state"].items():
            data = tensor.numpy().astype(np.dtype("<f4"))
            out.write(data.tobytes())
            tensors.append([name, list(data.shape)])
    meta = {"word_prior": saved.get("word_prior", False), "vocab": saved["vocab"], "ipa_kana": IPA_KANA, "tensors": tensors}
    (HERE / "work/qwen3.json").write_text(json.dumps(meta, ensure_ascii=False, separators=(",", ":")))
    print("Exported float32 JS model")


if __name__ == "__main__":
    main()
