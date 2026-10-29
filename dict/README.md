# Dictionaries (.koedict)

Lexicon files for Yomite (text → YomiScript). Lexicons are not part of YomiScript itself (D14). Format: [`spec/lexicon/`](../spec/lexicon/README.md).

- Domain dictionaries (medical, IT, place names, etc.) are built by the community and managed with semantic versioning (e.g. `medical@1.2.koedict`).
- Each file starts with its license and author.
- When a `.koedict` is loaded with `@import`, MoLD performs a memory write of its contents into Memory (H10, H12).

Sample: [`sample.koedict`](sample.koedict)
