# Contributing Guide

Contributions to yomiscript are welcome.

## Process

1. Start with an Issue for proposals and questions. Changes to the spec (YomiScript) are discussed in an Issue before a PR.
2. Branch off `main` and submit PRs in small units.
3. Design decisions are appended to [`docs/decisions.md`](docs/decisions.md) (with a D number).
4. Before a PR: `yarn format`, `yarn lint`, `yarn typecheck` and `yarn test` pass (JS: Prettier, ESLint, tsc, Vitest; Python: ruff). The coding rules are in [`CLAUDE.md`](CLAUDE.md).

## Development setup

Requirements:

- Node.js 22.12 or later and Yarn Classic (v1). The repository is a yarn workspace (`packages/*`).
- [ruff](https://docs.astral.sh/ruff/) on your `PATH` (`brew install ruff`, `pipx install ruff` or `uv tool install ruff`).
  It is not an npm dependency, so `yarn install` does not install it, but `yarn format` and `yarn lint` call it.
  Its settings are in `pyproject.toml`.
- Python 3.11 or later, only for the Python parts you work on (see below).

```sh
yarn install
yarn build        # compiles packages/* to dist/; the demo and the Node scripts in eval/ and yomite/ use the built packages
yarn test         # Vitest; runs without models, Python, network or API keys
```

Commands:

| Command             | What it runs                                                       |
| ------------------- | ------------------------------------------------------------------ |
| `yarn format`       | Prettier on TS / JS / HTML, then `ruff format` on Python           |
| `yarn format:check` | the same, checking only                                            |
| `yarn lint`         | ESLint (`eslint.config.js`), then `ruff check`                     |
| `yarn build`        | `tsc -b` on the packages, then the gui-chat-plugin build           |
| `yarn typecheck`    | `tsc -b` on the packages                                           |
| `yarn test`         | Vitest (`test/`, `packages/*/test/`)                               |

Every lint rule is an error; the size limits and the policy are in [`CLAUDE.md`](CLAUDE.md).

Python parts each keep their own `requirements.txt` and are set up from their README:

- `models/yomi/mlx/` (Yomi-0, MoLD): its own `.venv`; tests with `.venv/bin/python -m pytest -q tests`.
- `eval/` and its subdirectories: benchmarks and investigations.
- `yomite/*_kokoro/`: `pip install kokoro "misaki[ja]"`.

The browser demo is in `demo/ys_web/` (served with `python serve.py 8000 web` after `yarn build`; see its README).

## Terminology (D9)

Documents use "lexicon (辞書)", "Memory (メモリ)" and "memory write (書き込み)". The term 「記憶」 is not used.

## License

- By contributing, you agree that code is provided under Apache-2.0 and everything under `spec/` under CC BY 4.0.
- When adding lexicons or data, state the source and license. Do not add data whose license is unclear, such as research-only data.

## Documentation language

Documentation is written in English. Japanese appears only in examples and data (readings, example sentences, dictionary entries).
