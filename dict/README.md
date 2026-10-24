# 辞書 (.koedict)

KOE-IRの辞書 (Lexicon) ファイルです。書式は [`spec/koe-ir/grammar.md`](../spec/koe-ir/grammar.md) の `@lexicon` と同じです。

- 分野別の辞書（医療・IT・地名など）をコミュニティで作り、セマンティックバージョニングで管理します（例：`medical@1.2.koedict`）。
- 各ファイルの先頭にライセンスと作者を書きます。
- `.koedict` を `@import` すると、MoLD ではその内容がメモリへ書き込まれます（H10・H12）。

サンプル：[`sample.koedict`](sample.koedict)
