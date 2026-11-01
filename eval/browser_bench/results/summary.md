# Browser deployment of the Kokoro Katarite (w16), 2026-11-01

MacBook Pro (Mac14,5), Apple M2 Max, 12 (8 performance and 4 efficiency) cores, 96 GB, macOS 15.6.1 (24G90); headless HeadlessChrome/130.0.6723.31; Playwright Chromium, Node v24.19.0. Medians over 3 runs. Times in seconds from the start of the navigation; memory in MB.

## Loading, first audio and memory

| condition | cache | ready | download | sessions | warm-up | first audio | transferred | renderer RSS at ready | peak renderer RSS | peak total RSS | peak GPU RSS | peak JS heap |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| wasm-1 | cold | 2.31 | 0.25 | 1.02 | 0.95 | 5.51 | 186 | 1712 | 1796 | 2081 | 103 | 4 |
| wasm-1 | warm | 2.17 | 0.18 | 0.98 | 0.94 | 5.33 | 107 | 1740 | 1823 | 2110 | 103 | 4 |
| wasm-1 | restart | 2.23 | 0.17 | 0.98 | 0.96 | 5.42 | 107 | 1728 | 1812 | 2204 | 102 | 4 |
| wasm-4 | cold | 1.71 | 0.25 | 1.01 | 0.37 | 2.80 | 186 | 1728 | 1781 | 2065 | 102 | 5 |
| wasm-4 | warm | 1.63 | 0.20 | 0.98 | 0.37 | 2.72 | 107 | 1730 | 1787 | 2071 | 102 | 5 |
| wasm-4 | restart | 1.60 | 0.18 | 0.98 | 0.37 | 2.69 | 107 | 1742 | 1794 | 2185 | 102 | 5 |
| wasm-4-cs | cold | 2.12 | 0.65 | 1.02 | 0.38 | 3.23 | 186 | 1737 | 1884 | 2176 | 102 | 5 |
| wasm-4-cs | warm | 1.57 | 0.11 | 1.00 | 0.38 | 2.71 | 0 | 1736 | 1796 | 2084 | 102 | 5 |
| wasm-4-cs | restart | 1.57 | 0.10 | 1.00 | 0.38 | 2.67 | 0 | 1735 | 1786 | 2179 | 102 | 5 |
| webgpu | cold | 1.79 | 0.28 | 1.04 | 0.40 | 1.97 | 186 | 1705 | 1705 | 2125 | 296 | 14 |
| webgpu | warm | 1.54 | 0.20 | 1.02 | 0.25 | 1.72 | 107 | 1713 | 1713 | 2144 | 291 | 13 |
| webgpu | restart | 1.56 | 0.21 | 1.01 | 0.26 | 1.74 | 107 | 1722 | 1722 | 2230 | 278 | 12 |
| webgpu-dec | cold | 1.69 | 0.26 | 1.09 | 0.26 | 1.86 | 186 | 1724 | 1739 | 2199 | 303 | 12 |
| webgpu-dec | warm | 1.50 | 0.19 | 1.08 | 0.16 | 1.65 | 107 | 1718 | 1752 | 2217 | 294 | 11 |
| webgpu-dec | restart | 1.49 | 0.17 | 1.08 | 0.15 | 1.65 | 107 | 1732 | 1763 | 2326 | 290 | 11 |

## Real-time factor (synthesis time / audio length; below 1 is faster than real time)

| condition | RTF sentences | synth s | audio s | RTF paragraphs | synth s | audio s | RTF pooled | n |
|---|---|---|---|---|---|---|---|---|
| wasm-1 | 1.60 | 4.64 | 2.90 | 1.59 | 20.86 | 13.15 | 1.60 | 162 |
| wasm-4 | 0.54 | 1.57 | 2.90 | 0.52 | 6.85 | 13.15 | 0.54 | 162 |
| wasm-4-cs | 0.55 | 1.59 | 2.90 | 0.53 | 6.94 | 13.15 | 0.55 | 162 |
| webgpu | 0.12 | 0.18 | 1.52 | 0.05 | 0.40 | 7.97 | 0.08 | 162 |
| webgpu-dec | 0.07 | 0.19 | 2.90 | 0.06 | 0.73 | 13.15 | 0.06 | 162 |

## Output check against wasm-4 (first run, cold page)

| condition | sentences of the same length | audio length / reference (median) | envelope correlation (same length, median) |
|---|---|---|---|
| wasm-1 | 18 / 18 | 1.00 | 1.000 |
| wasm-4 | 18 / 18 | 1.00 | 1.000 |
| wasm-4-cs | 18 / 18 | 1.00 | 1.000 |
| webgpu | 0 / 18 | 0.57 | - |
| webgpu-dec | 18 / 18 | 1.00 | 1.000 |

