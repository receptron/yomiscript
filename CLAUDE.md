# CLAUDE.md — mulmovoice

Working notes for AI coding agents in this repo. Human-facing docs (what it is, the architecture, each part's setup)
live in **README.md** and the README of each directory — read them for anything not covered here. The coding rules
follow `../mulmoterminal/CLAUDE.md`, adapted to a JavaScript + Python repo.

## The center of the project
**YomiScript** (`spec/yomiscript/`) is the language-neutral hub. A **Yomite** turns text into YomiScript (an LLM,
Yomi-0, rules, a person); a **Katarite** turns YomiScript into sound (Kokoro-82M is the reference). Decisions are
numbered D1, D2, … in `docs/decisions.md`. A change to the notation or to who decides what is a new D entry, not a
silent edit.

## Stack & package manager
- **JavaScript**: ES modules with no build step. The browser demo (`demo/ys_web/web/`) is served as it is, and Node
  scripts import the same files, so there is no TypeScript and no bundler.
- **Python 3.11+**: each part keeps its own `requirements.txt` (`eval/`, `models/yomi/mlx/` with its own `.venv`).
  The Kokoro Yomites need `pip install kokoro "misaki[ja]"`.
- **yarn**, one `package.json` at the repository root. Use `yarn add`; don't hand-edit dependencies.
  `onnxruntime-web` is pinned to exactly **1.22.0**: the parity results in `eval/kokoro_parity` were measured with it,
  so a new version is a change to re-measure, not a routine bump.

## Run after changes
- `yarn format` runs Prettier (printWidth 160) on JS / HTML, then `ruff format` on Python. Markdown and JSON data
  are not formatted (`.prettierignore`).
- `yarn lint` runs ESLint (`eslint.config.js`), then `ruff check` (`pyproject.toml`).
- `yarn test` runs Vitest (`test/**/*.spec.js`). Tests run without models, Python, network or API keys. Mock
  external services; never call them.
- Yomi-0: `cd models/yomi/mlx && .venv/bin/python -m pytest -q tests`.
- When you touch the Kokoro Katarite (`demo/ys_web/web/ys.js`, `yomiscript.js`) or a Kokoro Yomite
  (`yomite/*_kokoro/`), `yarn test` checks the phoneme string and ids. The audio check is `eval/kokoro_parity`
  (README there). It needs the exported ONNX models and takes minutes; run it before claiming parity.

## Lint policy: every rule is an error
Same as mulmoterminal. The presets decide WHICH rules run, and every one of them runs at error, because a warning
reports a violation and ships it. A rule that genuinely must not apply somewhere is turned off **by name, for those
files, with the reason** in `eslint.config.js` or `pyproject.toml`. Don't use warn, and don't put a bare disable
comment in the code.

Size limits, the same in both languages: function length 60 lines / 60 statements, complexity 20, nesting depth 4,
6 parameters, 600 lines per file. When a function is over a limit, split it into named steps. Don't raise the limit.
One exemption exists: model constructors and loss functions in `models/yomi/mlx` and `tts/kokoro_ft` take their
hyperparameters from saved checkpoint configs, so their parameter counts are exempt.

Refactoring must not change behaviour. Check it against the committed version: the same output on the presets and
fixtures (JS), the same generated data or training losses with a fixed seed (Python). Say what you compared.

## No copies kept in sync by hand
A value or function two places need lives in ONE place, and both import it. Never mirror it with a "keep the two
copies in sync" comment. Examples already in the repo:
- `demo/ys_web/node.mjs` is the Node entry to the Katarite (vocab, ONNX engine); `yomite/kokoro_yomite.mjs` is what
  the Kokoro Yomites share.
- `VOWELS` lives in `yomiscript.js`, and `f0_override.py` is the one Python copy of the F0 rendering.
- Demo data (`data.json`, `presets.json`) exists only under `demo/ys_web/web/`.

If two sides genuinely differ, share the common core and keep each side's extras local.

## The Kokoro reference reproduces the original exactly (D21, D22)
The first target is a Yomite + Katarite that behaves exactly like the original Kokoro: same phoneme string, ids,
voice-pack entry, durations, F0, and audio within the original's own run-to-run spread. **Don't "fix" Kokoro's
behaviour on your own.** That includes its question intonation and the Japanese front end dropping 。 and 、. Report
what the original does, and propose a correction as a separate, explicit change.
`test/fixtures/kokoro_original.json` was recorded from the original pipeline. Regenerate it only from the original
(`eval/kokoro_parity/ref_kokoro.py`), never from our own output.

## No emojis
No emojis anywhere you write in this repository: code, comments, docs, commit messages, CLI output. Compact notation
stays text (`↘ ↗ ‖ ꜛ ꜜ` are YomiScript, not decoration).

## Documentation language
Documentation is in English. Japanese appears only in examples and data (readings, example sentences, dictionary
entries). Write new comments and docstrings in English too. Older Japanese comments in `models/yomi/mlx` and `tts/`
predate this rule.

## Layout
- `spec/`: YomiScript and lexicon specifications. `docs/`: decisions (D…) and hypotheses (H…).
- `demo/ys_web/`: the browser demo and the reference Katarite (`web/`). It also has the ONNX export
  (`export_split.py`, `exact_stft.py`).
- `yomite/`: the Kokoro-based Yomites (`en_kokoro`, `ja_kokoro`).
- `models/yomi/mlx/`: Yomi-0 and MoLD (training, tools, tests). `mold/`, `dict/`: lexicons and memories.
- `eval/`: benchmarks and investigations (`kokoro_parity`, `kokoro_questions`, `llm_yomite`, JSUT baselines).
- `tts/`: earlier Python Kokoro experiments (old notation). `tools/`: converters (kana labels → YomiScript).
- `test/`: Vitest specs and fixtures.
