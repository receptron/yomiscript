// The user dictionary of the front end: rows in NAIST-JDIC's CSV format (surface, left / right context id, cost, the
// part of speech, base form, reading, pronunciation, accent/morae, chain rule). The accent is only used where the
// YomiScript reads a phrase the same way, so an entry here does not change what is spoken: it lets the dictionary
// agree with the reading LLMs write where NAIST-JDIC prefers another, so that the phrase gets its accent.
// Each row is NAIST-JDIC's own entry for that reading (its accent and context ids), with a cost below the entry it
// competes with. A new row is a decision about the dictionary (D27 in docs/decisions.md); measure it with
// eval/prosody_ref before adding it.
export const USER_DICT = `
# 日本: ニッポン (3606) wins over ニホン (10787); 日本経済, 日本の are read ニホン by LLMs
日本,1354,1354,3000,名詞,固有名詞,地域,国,*,*,日本,ニホン,ニホン,2/3,C1
# 日本人: ニッポンジン (-641) wins over ニホンジン (5840)
日本人,1345,1345,-1000,名詞,一般,*,*,*,*,日本人,ニホンジン,ニホンジン,4/5,C2
`;
