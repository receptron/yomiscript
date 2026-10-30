# Reading stability with and without accent marks (`node stability.mjs`)

| LLM | set | runs (none / every) | same reading: two runs without marks | two runs with marks | one of each | sentences with any difference: none / every / all runs |
|---|---|---|---|---|---|---|
| claude | hard | 5 / 5 | 95.9% (654/682) | 95.7% (670/700) | 94.5% (1630/1725) | 6 / 6 / 10 of 70 |
| claude | ja | 5 / 5 | 90.8% (218/240) | 96.3% (231/240) | 89.2% (535/600) | 4 / 1 / 5 of 24 |
| codex | hard | 5 / 5 | 99.4% (696/700) | 95.4% (649/680) | 96.3% (1662/1725) | 1 / 7 / 7 of 70 |
| codex | ja | 5 / 5 | 94.9% (224/236) | 90.0% (216/240) | 91.3% (543/595) | 2 / 4 / 4 of 24 |

## claude, hard: words read in more than one way

| sentence, word | without marks | with marks |
|---|---|---|
| h001 市 | itɕi 5 | ɕi 4, itɕi 1 |
| h001 売られて | ɯɾaɾete 5 | ɯɾaɾete 2, uɾaɾete 2 |
| h005 経済 | keːzai 3, keːdzai 2 | keːzai 1, keːdzai 1 |
| h005 日本経済 | - | ɲihoNkeːdzai 2, keːdzai 1 |
| h008 上手 | dʑoːzɯ 5 | dʑoːdzɯ 4, dʑoːzɯ 1 |
| h009 舞台 | bɯtai 5 | bɯtai 4, butai 1 |
| h010 上手 | ɯwate 5 | ɯwate 4, uwate 1 |
| h029 何本 | naNboN 3, naNbоN 1, naNbo​N 1 | naNboN 5 |
| h039 進んで | sɯsɯNde 4, sɯsuNde 1 | sɯsɯNde 5 |
| h047 世界遺産 | - | sekaiːsaN 2, isaN 1 |
| h051 6本 | ɾoppoN 3, roppoN 2 | ɾoppoN 5 |
| h055 10本 | dʑɯppoN 4, dʑippoN 1 | dʑɯppoN 5 |
| h062 2026年 | ɲidʑɯːɾokɯneN 1, neN 1 | ɲiseNɲidʑɯːɾokɯneN 2 |
| h065 30分 | saNdʑɯppɯN 3, saNdʑippɯN 2 | saNdʑɯppɯN 5 |
| h069 31年 | saNdʑɯːitɕineN 1, neN 1 | saNdʑɯːitɕineN 2 |

## claude, ja: words read in more than one way

| sentence, word | without marks | with marks |
|---|---|---|
| ka_question 明日 | aɕita 4, asɯ 1 | aɕita 5 |
| brackets 吾輩 | wagahai 3, waɡahai 1, ɡahai 1 | waɡahai 3 |
| numbers 2026年 | ɲiseNɲidʑɯːɾokɯneN 4, neN 1 | ɲiseNɲidʑɯːɾokɯneN 2 |
| numbers 29日 | ɲidʑɯːkɯɲitɕi 4, ɲitɕi 1 | ɲidʑɯːkɯɲitɕi 2, ɲitɕi 2 |
| numbers 15分 | dʑɯːɡoɸɯN 4, ɸɯN 1 | dʑɯːɡoɸɯN 2, ɸɯN 2 |
| numbers 850円 | happʲakɯɡodʑɯːeN 4, eN 1 | happʲakɯɡodʑɯːeN 2 |
| wave_dash 営業時間 | eːɡʲoːdʑikaN 1 | eːɡʲoːdʑikaN 3, dʑikaN 2 |
| kanji_names 清水寺 | kijomidzɯdeɾa 4, kʲomidzɯdeɾa 1 | kijomidzɯdeɾa 5 |
| long 吾輩 | wagahai 6, waɡahai 2, ɡahai 2 | waɡahai 10 |
| long 生れた | ɯmaɾeta 5 | ɯmaɾeta 3, umaɾeta 1 |
| long 人間中 | ɲiNɡeNdʑɯː 3, ɲiNɡeNtɕɯː 2 | ɲiNɡeNtɕɯː 2, ɲiNɡeNdʑɯː 1, tɕɯː 1 |
| long 種族 | ɕɯzokɯ 3, ɕɯdzokɯ 2 | ɕɯdzokɯ 4, ɕɯzokɯ 1 |
| long 捕えて | tsɯkamaete 5 | toɾaete 4, tsɯkamaete 1 |

## codex, hard: words read in more than one way

| sentence, word | without marks | with marks |
|---|---|---|
| h006 一日 | tsɯitatɕi 5 | tsɯitɕitatɕi 2, tsɯitatɕi 2, tsɯitɕi 1 |
| h012 彼女 | kanodʑo 5 | kanodʑo 4, kaɾodʑo 1 |
| h015 学ぶ。 | manabɯ 5 | manabɯ 4, bɯ 1 |
| h023 目下 | meɕita 5 | meɕita 4, meɕta 1 |
| h036 導入 | doːɲɯː 4, doːɲʲɯː 1 | doːɲɯː 5 |
| h041 探査機 | ki 4, taNsaki 1 | taNsaki 5 |
| h049 1500人 | seNɡoçakɯɲiN 3, kɯɲiN 1, ɡoçakɯɲiN 1 | seNɡoçakɯɲiN 3, ɡoçakɯɲiN 2 |
| h050 1万2000円 | itɕimaNɲiseɴeN 4, eN 1 | itɕimaNɲiseɴeN 3, eN 1, ɲiseɴeN 1 |
| h053 25.5度 | ɲidʑɯːɡoteNɡodo 4, do 1 | ɲidʑɯːɡoteNɡodo 2, ɡodo 2, do 1 |
| h058 第3章 | daisaNɕoː 4, saNɕoː 1 | daisaNɕoː 4, saNɕoː 1 |
| h060 1日 | tsɯitatɕi 4 | tsɯitatɕi 2, tsɯitɕitatɕi 1, tsɯitɕi 1 |
| h060 4月1日 | tsɯitatɕi 1 | tsɯitɕitatɕi 1 |
| h062 2026年 | ɲiseNɲidʑɯːɾokɯneN 4 | ɲiseNɲidʑɯːɾokɯneN 3, ɲidʑɯːɾokɯneN 1 |
| h065 30分 | saNdʑɯppɯN 4 | saNdʑɯppɯN 3, saNdʑɯppoN 1 |
| h070 行う。 | okonaɯ 5 | okonaɯ 2, custoNnaɯ 1, aɯ 1, okonavɯ 1 |

## codex, ja: words read in more than one way

| sentence, word | without marks | with marks |
|---|---|---|
| comma 出かけます。 | - | dekakemasɯ 2, dekakemɯsɯ 1 |
| numbers 2026年 | ɲiseNɲɯːdʑɯːɾokɯneN 2, ɲɯːdʑɯːɾokɯneN 1, ɲidʑɯːɾokɯneN 1, neN 1 | neN 2, ɲiseNɲidʑɯːɾokɯneN 2, ɲɯːɾokɯneN 1 |
| numbers 10月 | dʑɯːɡatsɯ 4, ɡatsɯ 1 | dʑɯːɡatsɯ 3, ɡatsɯ 2 |
| numbers 29日 | ɲidʑɯːkɯɲitɕi 4, ɲitɕi 1 | ɲidʑɯːkɯɲitɕi 3, ɲitɕi 2 |
| numbers 3時 | saNdʑi 4, dʑi 1 | saNdʑi 3, dʑi 2 |
| numbers 15分 | dʑɯːɡoɸɯN 4, ɸɯN 1 | dʑɯːɡoɸɯN 3, ɸɯN 2 |
| numbers 850円 | happʲakɯɡodʑɯːeN 2, ɡodʑɯːeN 2, eN 1 | eN 2, happʲakɯɡodʑɯːeN 2, ɡodʑɯːeN 1 |
| moraic_n 本屋さん | saN 1 | hoNjasaN 2 |
| loanwords 楽しんだ。 | tanoɕiNda 5 | tanoɕiNda 3, taɲoɕiNda 2 |
| wave_dash 9時 | kɯdʑi 4, dʑi 1 | kɯdʑi 3, dʑi 2 |
| wave_dash 17時 | dʑɯːɕitɕidʑi 4, dʑi 1 | dʑɯːɕitɕidʑi 3, dʑi 2 |
| wave_dash 営業時間 | dʑikaN 1 | dʑikaN 3, eːɡʲoːdʑikaN 1 |
| kanji_names 清水寺 | kijomidzɯdeɾa 2, kʲijomidzɯdeɾa 2, deɾa 1 | kijomidzɯdeɾa 4, kʲijomidzɯdeɾa 1 |
| newline 今日 | kʲoː 5 | kʲoː 4, >kʲoː 1 |
| long 人間中 | ɲiNɡeNtɕɯː 5 | ɲiNɡeNtɕɯː 4, ɲiNɡeNdʑɯː 1 |
| long 話 | hanaɕi 5 | hanaɕi 4, aɕi 1 |
| long 掌 | tenoçiɾa 10 | tenokokoɾo 4, tenoçiɾa 4, tenokoɾo 2 |
| long 装飾 | soːɕokɯ 5 | soːɕokɯ 4, ɕoːɕokɯ 1 |
