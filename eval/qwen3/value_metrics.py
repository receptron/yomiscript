"""Shared movement distance for training, development, test, and checks."""

import numpy as np
import torch


def movement_distance(prediction, teacher):
    """Per-sentence fourth-power movement mean; join across missing values and pauses."""
    p, t = prediction.flatten(1), teacher.flatten(1)
    valid = torch.isfinite(t) & torch.isfinite(p)
    indices = torch.arange(t.shape[1], device=t.device).expand_as(t)
    previous = torch.where(valid, indices, -1).cummax(1).values
    previous = torch.cat([torch.full_like(previous[:, :1], -1), previous[:, :-1]], 1)
    pairs = valid & (previous >= 0)
    safe_p, safe_t = torch.nan_to_num(p), torch.nan_to_num(t)
    a = safe_p - safe_p.gather(1, previous.clamp(min=0))
    b = safe_t - safe_t.gather(1, previous.clamp(min=0))
    cost = (a - b).square() + 4 * (-a * b).clamp(min=0)
    mean = (cost.square() * pairs).sum(1) / pairs.sum(1).clamp(min=1)
    return torch.where(mean > 0, mean.clamp(min=torch.finfo(mean.dtype).tiny).pow(0.25), mean)


def distance(targets, predictions, masks=None):
    scores, count = [], 0
    for i, (t, p) in enumerate(zip(targets, predictions, strict=True)):
        t, p = np.asarray(t, dtype=float), np.asarray(p, dtype=float)
        valid = np.isfinite(t) & np.isfinite(p)
        if masks is not None:
            valid &= masks[i]
        if valid.sum() < 2:
            continue
        t = np.where(valid, t, np.nan)
        score = movement_distance(torch.tensor(p[None]), torch.tensor(t[None]))
        scores.append(score.item())
        count += int(valid.sum())
    return {"movement_distance": float(np.mean(scores)), "sentences": len(scores), "values": count}
