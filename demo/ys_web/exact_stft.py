"""STFT / iSTFT for Kokoro's decoder that match torch.stft / torch.istft (what the original KModel uses) and export to
ONNX (no complex tensors).

kokoro's own ONNX-friendly CustomSTFT (KModel(disable_complex=True)) is an approximation: replicate instead of reflect
padding, tiny non-zero imaginary parts in the DC / Nyquist bins (so the phase the decoder network reads flips between
+π and -π), and an approximate inverse. Its audio differs clearly from the original (correlation ≈ 0.88 with the same
random seed). This module reproduces torch's results; use it in place of decoder.generator.stft when exporting.
"""
import numpy as np
import torch
import torch.nn.functional as F


class ExactSTFT(torch.nn.Module):
    def __init__(self, filter_length=800, hop_length=200, win_length=800):
        super().__init__()
        self.n_fft, self.hop, self.win = filter_length, hop_length, win_length
        assert win_length == filter_length and filter_length % 2 == 0
        N, K = filter_length, filter_length // 2 + 1
        w = torch.hann_window(win_length, periodic=True, dtype=torch.float64).numpy()
        n, k = np.arange(N), np.arange(K)
        ang = 2 * np.pi * np.outer(k, n) / N
        re, im = np.cos(ang), -np.sin(ang)
        im[0, :] = 0; im[-1, :] = 0                                   # DC and Nyquist are exactly real
        self.register_buffer("f_re", torch.from_numpy(re * w).float().unsqueeze(1))
        self.register_buffer("f_im", torch.from_numpy(im * w).float().unsqueeze(1))
        # inverse real DFT of a one-sided spectrum: x[n] = 1/N (X0 + (-1)^n X_{N/2} + 2 Σ Re(X_k e^{j2πkn/N}))
        c = np.full(K, 2.0); c[0] = c[-1] = 1.0
        b_re = (c[:, None] * np.cos(ang)) / N * w                     # multiplied by the synthesis window
        b_im = (-c[:, None] * np.sin(ang)) / N * w
        b_im[0, :] = 0; b_im[-1, :] = 0                               # imaginary DC / Nyquist are ignored (as irfft)
        self.register_buffer("b_re", torch.from_numpy(b_re).float().unsqueeze(1))
        self.register_buffer("b_im", torch.from_numpy(b_im).float().unsqueeze(1))
        self.register_buffer("w2", torch.from_numpy(w * w).float().view(1, 1, -1))

    def transform(self, x):
        p = self.n_fft // 2
        x = F.pad(x.unsqueeze(1), (p, p), mode="reflect")
        re = F.conv1d(x, self.f_re, stride=self.hop)
        im = F.conv1d(x, self.f_im, stride=self.hop)
        mag = torch.sqrt(re * re + im * im)
        # torch.angle = atan2(imag, real). In the exactly-real bins torch's imag is +0.0, so a negative real part gives π;
        # the convolution can give -0.0 there (atan2 -> -π), so set those to π as torch does.
        phase = torch.atan2(im, re)
        phase = torch.where((im == 0) & (re < 0), torch.full_like(phase, np.pi), phase)
        return mag, phase

    def inverse(self, mag, phase):
        re, im = mag * torch.cos(phase), mag * torch.sin(phase)
        y = F.conv_transpose1d(re, self.b_re, stride=self.hop) + F.conv_transpose1d(im, self.b_im, stride=self.hop)
        ones = torch.ones(1, 1, mag.shape[-1], dtype=mag.dtype, device=mag.device)
        env = F.conv_transpose1d(ones, self.w2, stride=self.hop)     # overlap-added squared window
        p = self.n_fft // 2
        y, env = y[..., p:-p], env[..., p:-p]
        return y / env                                               # (B, 1, T), like TorchSTFT.inverse

    def forward(self, x):
        mag, phase = self.transform(x)
        return self.inverse(mag, phase)


def use_exact_stft(kmodel):
    """replace the decoder's STFT of a KModel (any disable_complex setting) with ExactSTFT"""
    g = kmodel.decoder.generator
    s = g.stft
    g.stft = ExactSTFT(s.filter_length if hasattr(s, "filter_length") else s.n_fft, s.hop_length, s.win_length)
    return kmodel
