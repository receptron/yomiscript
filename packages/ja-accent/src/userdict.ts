// The user dictionary of the front end: rows in NAIST-JDIC's CSV format (surface, left / right context id, cost, the
// part of speech, base form, reading, pronunciation, accent/morae, chain rule). The accent is only used where the
// YomiScript reads a phrase the same way, so an entry here does not change what is spoken: it lets the dictionary
// agree with the reading LLMs write where NAIST-JDIC prefers another, so that the phrase gets its accent.
// Each row is NAIST-JDIC's own entry for that reading (its accent and context ids), with a cost below the entry it
// competes with. A new row is a decision about the dictionary (D27 in docs/decisions.md); measure it with
// eval/prosody_ref before adding it. A row may also correct an entry's accent, as heard (D38).
export const USER_DICT = `
# 日本: ニッポン (3606) wins over ニホン (10787); 日本経済, 日本の are read ニホン by LLMs
日本,1354,1354,3000,名詞,固有名詞,地域,国,*,*,日本,ニホン,ニホン,2/3,C1
# 日本人: ニッポンジン (-641) wins over ニホンジン (5840)
日本人,1345,1345,-1000,名詞,一般,*,*,*,*,日本人,ニホンジン,ニホンジン,4/5,C2
# ぴかぴか: NAIST-JDIC has no fall (5055, 5052), where くるくる and the like fall on the first mora (D38)
ぴかぴか,1341,1341,5000,副詞,一般,*,*,*,*,ぴかぴか,ピカピカ,ピカピカ,1/4,*
ピカピカ,1341,1341,5000,副詞,一般,*,*,*,*,ピカピカ,ピカピカ,ピカピカ,1/4,*
# 当軒: not in NAIST-JDIC, read as 当 + 軒 with the fall after トー; heard as better falling after ト (results/listening_token.json)
当軒,1345,1345,3000,名詞,一般,*,*,*,*,当軒,トウケン,トーケン,1/4,C1
# 室 read へや and 扉 read と, as in the books' ruby: NAIST-JDIC has neither, and the phrase was left with no accent, with the words before
# it. Each has 部屋's or 戸's accent, and a high cost: it is taken only where the YomiScript reads it so.
室,1345,1345,9000,名詞,一般,*,*,*,*,室,ヘヤ,ヘヤ,2/2,C2
扉,1345,1345,9000,名詞,一般,*,*,*,*,扉,ト,ト,0/1,C3
`;
