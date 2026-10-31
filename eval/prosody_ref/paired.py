"""Two runs of score.py compared on the items where their YomiScripts differ (results/<run>.json, audio/ours/<run>).

usage: .venv/bin/python paired.py <run> <a> <b>     e.g. tool d25 aux
"""

import json
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).parent


def changed(run, a, b):
    # the items whose YomiScript differs between the two variants
    da, db = HERE / "audio/ours" / run / a, HERE / "audio/ours" / run / b
    return [
        j.stem for j in sorted(da.glob("*.json")) if (db / j.name).exists() and json.loads(j.read_text())["ys"] != json.loads((db / j.name).read_text())["ys"]
    ]


def main():
    run, a, b = sys.argv[1:4]
    R = json.loads((HERE / "results" / f"{run.replace('/', '-')}.json").read_text())
    d = []
    for k in changed(run, a, b):
        x, y = R[a].get(k, {}).get("mean", {}).get("rmse"), R[b].get(k, {}).get("mean", {}).get("rmse")
        if x is not None and y is not None:
            d.append((y - x, k))
    v = np.array([x for x, _ in d])
    better, worse = int((v < -0.05).sum()), int((v > 0.05).sum())
    print(f"{len(d)} changed items: rmse {a} -> {b} mean {v.mean():+.3f} st (median {np.median(v):+.3f}); {b} closer in {better}, farther in {worse}")
    for x, k in sorted(d)[:5] + sorted(d)[-5:]:
        print(f"  {x:+.2f} {k}")


if __name__ == "__main__":
    main()
