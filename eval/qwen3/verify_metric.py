"""Analytical checks of movement direction, missing-value joins, and gradients."""

import torch
from value_metrics import distance, movement_distance


def main():
    t = torch.tensor([[[0.1, 0.2, float("nan")], [0.3, 0.4, 0.5]]], dtype=torch.float64)
    p = torch.tensor([[[0.8, 0.9, 99.0], [1.0, 1.1, 1.2]]], dtype=torch.float64, requires_grad=True)
    assert movement_distance(p, t).item() < 1e-12
    reverse = torch.tensor([[[0.2, 0.1]]], dtype=torch.float64, requires_grad=True)
    teacher = torch.tensor([[[0.1, 0.2]]], dtype=torch.float64)
    score = movement_distance(reverse, teacher)
    assert abs(score.item() - (0.08**0.5)) < 1e-12
    score.backward()
    assert torch.isfinite(reverse.grad).all()
    joined = distance([[[0.0, None, 2.0]]], [[[0.0, 100.0, 0.0]]])
    assert joined["movement_distance"] == 2.0
    corpus = distance([[[0.0, 1.0]], [[0.0, 0.0, 0.0]]], [[[0.0, 0.0]], [[0.0, 0.0, 0.0]]])
    assert corpus["movement_distance"] == 0.5
    zero = torch.zeros(1, 2, 3, requires_grad=True)
    movement_distance(zero, zero.detach()).sum().backward()
    assert torch.isfinite(zero.grad).all()
    print("Movement invariance, opposite direction, missing joins, and gradients passed")


if __name__ == "__main__":
    main()
