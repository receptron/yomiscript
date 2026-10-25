#!/usr/bin/env bash
# Linux CPU 版 MLX (mlx-cpu wheel) は参照実装の netlib BLAS を同梱しており、行列積が ~6 GFLOPS しか出ない。
# OpenBLAS を LD_PRELOAD すると ~740 GFLOPS (8コア box) になる。使い方: source tools/cpu_env.sh
#   事前に: sudo apt-get install -y libopenblas0-pthread
for f in /usr/lib/x86_64-linux-gnu/openblas-pthread/libopenblas.so.0 /usr/lib/x86_64-linux-gnu/libopenblas.so.0; do
  if [ -e "$f" ]; then export LD_PRELOAD="$f${LD_PRELOAD:+:$LD_PRELOAD}"; echo "LD_PRELOAD=$f"; break; fi
done
