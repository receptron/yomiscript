"""Fit the Japanese pitch model (packages/core/src/ja_contour.ts) to Qwen's pitch (work/rows.json from rows.mjs).

The model is the one of D29 with new coefficients: each mora's three values (start, middle, end) are a linear
function of the feature rows of the mora and the CTX morae on each side (zero past the sentence's ends), plus an
intercept per point. Fitted by ridge regression, the strength chosen by 5-fold cross-validation on the training half
(the even JSUT ids); the test half (the odd ids) is never seen while fitting.

Score: on the target morae of each test sentence, the root mean square distance in semitones between the model's
values and Qwen's, each side centred on its own mean over those morae (the Katarite moves a section to the engine's
level, so only the shape counts). The same for the shipped coefficients (D29).

usage: ../prosody_ref/.venv/bin/python fit.py   -> work/fit.json (the coefficients), work/fit_report.json
"""

import json
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
CTX = 2
LAMBDAS = [0.1, 1, 3, 10, 30, 100, 300]


def design(data, feats):
    """X (one row per target mora), Y (its three values), the sentence of each row, and D29's values"""
    X, Y, sid, D = [], [], [], []
    for s, d in enumerate(data):
        k = 0
        for rows in d["sentences"]:
            M = np.array([[r.get(f, 0.0) for f in feats] for r in rows])
            pad = np.vstack([np.zeros((CTX, len(feats))), M, np.zeros((CTX, len(feats)))])
            for i in range(len(rows)):
                t = d["target"][k + i]
                if t is not None:
                    X.append(pad[i : i + 2 * CTX + 1].reshape(-1))
                    Y.append(t)
                    sid.append(s)
                    D.append(d["d29"][k + i])
            k += len(rows)
    return np.array(X), np.array(Y), np.array(sid), np.array(D)


def ridge(X, Y, lam):
    """weights (with the intercept last, not penalised) for each of the three points"""
    Xa = np.hstack([X, np.ones((len(X), 1))])
    P = lam * np.eye(Xa.shape[1])
    P[-1, -1] = 0
    return np.linalg.solve(Xa.T @ Xa + P, Xa.T @ Y)


def predict(X, B):
    return np.hstack([X, np.ones((len(X), 1))]) @ B


def score(P, Y, sid):
    """rmse in semitones, each sentence's prediction and target centred on their own means"""
    err = []
    for s in np.unique(sid):
        m = sid == s
        err.append(((P[m] - P[m].mean()) - (Y[m] - Y[m].mean())).reshape(-1))
    return float(np.sqrt(np.mean(np.concatenate(err) ** 2)))


def choose(X, Y, sid):
    folds = np.unique(sid) % 5
    cv = {}
    for lam in LAMBDAS:
        errs = []
        for f in range(5):
            test = np.isin(sid, np.unique(sid)[folds == f])
            errs.append(score(predict(X[test], ridge(X[~test], Y[~test], lam)), Y[test], sid[test]))
        cv[lam] = float(np.mean(errs))
    return min(cv, key=cv.get), cv


def coefficients(B, feats):
    # ja_contour.ts's layout: W[feature][(d + CTX) * 3 + point]
    n = len(feats)
    W = {f: [round(float(B[(d * n) + j, p]), 4) for d in range(2 * CTX + 1) for p in range(3)] for j, f in enumerate(feats)}
    return {"POINT": [round(float(x), 4) for x in B[-1]], "W": W}


def main():
    data = json.loads((HERE / "work/rows.json").read_text())
    feats = sorted({f for d in data for rows in d["sentences"] for r in rows for f in r})
    odd = [int(d["name"].split("_")[1]) % 2 == 1 for d in data]
    train = [d for d, o in zip(data, odd, strict=True) if not o]
    test = [d for d, o in zip(data, odd, strict=True) if o]
    Xtr, Ytr, Str, _ = design(train, feats)
    Xte, Yte, Ste, Dte = design(test, feats)
    lam, cv = choose(Xtr, Ytr, Str)
    B = ridge(Xtr, Ytr, lam)
    report = {
        "features": len(feats),
        "train": {"sentences": len(train), "morae": len(Ytr)},
        "test": {"sentences": len(test), "morae": len(Yte)},
        "lambda": lam,
        "cv": cv,
        "rmse_test": {"d29": score(Dte, Yte, Ste), "refit": score(predict(Xte, B), Yte, Ste), "flat": score(np.zeros_like(Yte), Yte, Ste)},
    }
    (HERE / "work/fit.json").write_text(json.dumps(coefficients(ridge(np.vstack([Xtr, Xte]), np.vstack([Ytr, Yte]), lam), feats)))
    (HERE / "work/fit_report.json").write_text(json.dumps(report, indent=1))
    print(json.dumps(report, indent=1))


if __name__ == "__main__":
    main()
