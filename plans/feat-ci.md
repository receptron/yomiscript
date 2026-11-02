# CI for format, lint, typecheck, build and test (#31)

## Goal
Run on every pull request to `main` and every push to `main` what `CONTRIBUTING.md` asks for before a PR:
`yarn format:check`, `yarn lint`, `yarn typecheck`, `yarn build`, `yarn test`.

## Decisions
- One job on ubuntu. The tests are pure TypeScript with no file system or path handling worth a win / mac matrix
  on every PR; a matrix can be added later as a scheduled run.
- `format:check`, not `format`: CI reports, it does not rewrite.
- ruff is not an npm dependency. It is installed with `astral-sh/ruff-action`, pinned to the version the local
  tools use (0.15.20), so a new ruff release cannot turn CI red by itself. Raising it is a deliberate change.
- The files `ruff format --check` flagged are reformatted in a separate commit. The diff was the same with ruff
  0.15.20 and 0.17.3 (unformatted files, not version drift); the AST of each file is unchanged.
- `yarn build` runs too: the gui-chat-plugin build is not covered by `typecheck`.
- `permissions: contents: read`, `persist-credentials: false` on checkout.
- `concurrency` cancels a superseded run on the same PR, never a run on `main`.

## Out of scope
- Python tests (`models/yomi/mlx` needs MLX on Apple silicon), the Kokoro parity check (needs exported models).
