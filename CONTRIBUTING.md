# Contributing Guide

Contributions to mulmovoice are welcome.

## Process

1. Start with an Issue for proposals and questions. Changes to the spec (YomiScript) are discussed in an Issue before a PR.
2. Branch off `main` and submit PRs in small units.
3. Design decisions are appended to [`docs/decisions.md`](docs/decisions.md) (with a D number).
4. Before a PR: `yarn format`, `yarn lint` and `yarn test` pass (JS: Prettier, ESLint, Vitest; Python: ruff). The coding rules are in [`CLAUDE.md`](CLAUDE.md).

## Terminology (D9)

Documents use "lexicon (辞書)", "Memory (メモリ)" and "memory write (書き込み)". The term 「記憶」 is not used.

## License

- By contributing, you agree that code is provided under Apache-2.0 and everything under `spec/` under CC BY 4.0.
- When adding lexicons or data, state the source and license. Do not add data whose license is unclear, such as research-only data.

## Documentation language

Documentation is written in English. Japanese appears only in examples and data (readings, example sentences, dictionary entries).
