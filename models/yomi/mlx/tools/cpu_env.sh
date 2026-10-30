#!/usr/bin/env bash
# The Linux CPU build of MLX (mlx-cpu wheel) bundles the reference netlib BLAS, so matrix multiplication reaches only ~6 GFLOPS.
# LD_PRELOADing OpenBLAS brings it to ~740 GFLOPS (8-core box). Usage: source tools/cpu_env.sh
#   Beforehand: sudo apt-get install -y libopenblas0-pthread
for f in /usr/lib/x86_64-linux-gnu/openblas-pthread/libopenblas.so.0 /usr/lib/x86_64-linux-gnu/libopenblas.so.0; do
  if [ -e "$f" ]; then export LD_PRELOAD="$f${LD_PRELOAD:+:$LD_PRELOAD}"; echo "LD_PRELOAD=$f"; break; fi
done
