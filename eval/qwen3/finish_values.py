"""Finish the planned development comparisons, verify runtime, then test once."""

import json
import shutil
import subprocess
import sys
import time

from memory import HERE
from train_values import DIRECT_EPOCHS


def run(name):
    command = ["node", name] if name.endswith(".mjs") else [sys.executable, "-u", name]
    subprocess.run(command, cwd=HERE, check=True)


def main():
    history = HERE / "work/values_movement_history.json"
    while True:
        records = json.loads(history.read_text()) if history.exists() else []
        if any(r["phase"] == 1 and r["epoch"] == DIRECT_EPOCHS for r in records):
            break
        time.sleep(10)
    print("Starting word-value residual comparison", flush=True)
    run("train_prior_values.py")
    print("Starting annotation-only teacher-weight candidate", flush=True)
    run("finetune_values.py")
    shutil.copyfile(HERE / "work/qwen3_movement.pt", HERE / "work/qwen3.pt")
    for name in ["export_values.py", "verify_metric.py", "verify_values.py", "check_teachers.mjs", "evaluate_values.py"]:
        run(name)
    print("Finished; results/qwen3.json is the final test evaluation", flush=True)


if __name__ == "__main__":
    main()
