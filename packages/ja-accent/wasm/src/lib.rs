//! OpenJTalk's Japanese front end (jpreprocess, NAIST-JDIC) for JavaScript. `analyze` gives the words after the front
//! end's rules (NJD) and the full-context labels of a text, as OpenJTalk analyses it. For a YomiScript, whose words
//! and readings are already decided, the dictionary and the rules are used as tables instead (D31): `candidates`
//! lists every dictionary entry of the sentence (an entry may cross the YomiScript's word boundaries) with its morae
//! and costs, and OpenJTalk's own analysis of it; the caller finds the cheapest path whose morae read as the
//! YomiScript does (`conn` gives the connection costs); `label` runs the rules on that path. The dictionary is given
//! as bytes, so it runs where there is no file system (the browser).
use jpreprocess::normalize_text_for_naist_jdic;
use jpreprocess_core::{pos::POS, token::Token as _, word_entry::WordEntry as JEntry};
use jpreprocess_dictionary::{
    dictionary::{
        to_dict::JPreprocessDictionaryBuilder, word_encoding::JPreprocessDictionaryWordEncoding,
    },
    word_data::get_word_data,
};
use jpreprocess_njd::{NJDNode, NJD};
use lindera::{segmenter::Segmenter, tokenizer::Tokenizer};
use lindera_dictionary::{
    dictionary::{
        character_definition::CharacterDefinition, connection_cost_matrix::ConnectionCostMatrix,
        metadata::Metadata, prefix_dictionary::PrefixDictionary,
        unknown_dictionary::UnknownDictionary, Dictionary,
    },
    mode::Mode,
    viterbi::WordEntry as LEntry,
};
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

/// The number of dictionary files; their names and order are DICT_FILES in ../src/frontend.ts.
const FILES: usize = 8;

fn err(e: impl std::fmt::Display) -> JsError {
    JsError::new(&e.to_string())
}

/// One dictionary entry of the sentence: characters [s, e) of the normalized text, its morae as OpenJTalk phonemes
/// (`["k","o"]`, `["N"]`, `["cl"]`, `["-"]` for a long vowel; a mark with no sound has none), its word cost and
/// context ids (-1: an unknown word of OpenJTalk's analysis, whose costs are not known here).
#[derive(Serialize)]
struct Cand {
    s: usize,
    e: usize,
    ph: Vec<Vec<String>>,
    cost: i32,
    l: i32,
    r: i32,
}
#[derive(Serialize)]
struct Sentence {
    /// the words' texts normalized one by one and joined
    norm: String,
    /// the character where each word starts in norm, and the end
    starts: Vec<usize>,
    cands: Vec<Cand>,
    /// OpenJTalk's own analysis of norm, as indices into cands
    alone: Vec<usize>,
}
#[derive(Deserialize)]
struct LabelRequest {
    words: Vec<String>,
    path: Vec<usize>,
}

struct Entry {
    s: usize,
    e: usize,
    surface: String,
    lentry: Option<LEntry>,
    jentry: JEntry,
}

fn load_dictionary(bytes: Vec<u8>, lengths: &[u32]) -> Result<(Dictionary, Metadata), JsError> {
    if lengths.len() != FILES {
        return Err(JsError::new("expected the 8 dictionary files"));
    }
    if lengths.iter().map(|&n| n as usize).sum::<usize>() != bytes.len() {
        return Err(JsError::new(
            "the dictionary bytes do not match the lengths",
        ));
    }
    // split from the end, so no file is copied (the dictionary is about 80 MB)
    let mut rest = bytes;
    let mut parts: Vec<Vec<u8>> = Vec::with_capacity(FILES);
    for &n in lengths.iter().rev() {
        parts.push(rest.split_off(rest.len() - n as usize));
    }
    parts.reverse();
    let [metadata, char_def, matrix, da, vals, words_idx, words, unk]: [Vec<u8>; 8] = parts
        .try_into()
        .map_err(|_| JsError::new("expected the 8 dictionary files"))?;
    let metadata = Metadata::load(&metadata).map_err(err)?;
    let dictionary = Dictionary {
        metadata: metadata.clone(),
        prefix_dictionary: PrefixDictionary::load(da, vals, words_idx, words, true).map_err(err)?,
        connection_cost_matrix: ConnectionCostMatrix::load(matrix).map_err(err)?,
        character_definition: CharacterDefinition::load(&char_def).map_err(err)?,
        unknown_dictionary: UnknownDictionary::load(&unk).map_err(err)?,
    };
    Ok((dictionary, metadata))
}

/// the morae of an entry as OpenJTalk phonemes (a compound entry: the morae of all its words)
fn morae(j: &JEntry, surface: &str) -> Vec<Vec<String>> {
    let mut out = Vec::new();
    for (_, d) in j.get_with_string(surface) {
        for m in d.pron.moras() {
            let (c, v) = m.phonemes();
            let ph: Vec<String> = c
                .iter()
                .map(|c| c.to_string())
                .chain(v.iter().map(|v| v.to_string()))
                .collect();
            if !ph.is_empty() {
                out.push(ph);
            }
        }
    }
    out
}
fn entry_of(dict: &PrefixDictionary, id: u32) -> Option<JEntry> {
    let data = get_word_data(&dict.words_idx_data, &dict.words_data, Some(id as usize))?;
    JPreprocessDictionaryWordEncoding::deserialize(data).ok()
}
/// the rules (NJD) and the labels of a path of entries, as `[njd, labels]` JSON
fn rules(nodes: Vec<NJDNode>) -> Result<String, JsError> {
    let mut njd = NJD { nodes };
    njd.preprocess();
    let labels: Vec<String> = jpreprocess_jpcommon::njdnodes_to_features(&njd.nodes)
        .iter()
        .map(|l| l.to_string())
        .collect();
    let strings: Vec<String> = njd.into();
    serde_json::to_string(&(strings, labels)).map_err(err)
}

#[wasm_bindgen]
pub struct Frontend {
    tok: Tokenizer,
}

impl Frontend {
    /// every dictionary entry (system and user) of the text
    fn entries(&self, norm: &str) -> Vec<Entry> {
        let seg = &self.tok.segmenter;
        let mut dicts: Vec<&PrefixDictionary> = vec![&seg.dictionary.prefix_dictionary];
        if let Some(u) = &seg.user_dictionary {
            dicts.push(&u.dict);
        }
        let mut out = Vec::new();
        for (ci, (b, _)) in norm.char_indices().enumerate() {
            for d in &dicts {
                for (len, l) in d.prefix(&norm[b..]) {
                    let surface = norm[b..b + len].to_string();
                    let Some(j) = entry_of(d, l.word_id.id) else {
                        continue;
                    };
                    let e = ci + surface.chars().count();
                    out.push(Entry {
                        s: ci,
                        e,
                        surface,
                        lentry: Some(l),
                        jentry: j,
                    });
                }
            }
        }
        out
    }
    /// OpenJTalk's analysis of the text, entry by entry, as jpreprocess's DefaultTokenizer reads it: a known word's
    /// entry from its dictionary, an unknown word's from lindera's unknown-word features
    fn tokens(&self, norm: &str) -> Result<Vec<Entry>, JsError> {
        let seg = &self.tok.segmenter;
        let mut out = Vec::new();
        let mut at = 0;
        for mut t in self.tok.tokenize(norm).map_err(err)? {
            let n = t.surface.chars().count();
            let (lentry, jentry) = if t.word_id.is_unknown() {
                (None, t.fetch().map_err(err)?.1)
            } else {
                let dict = if t.word_id.is_system() {
                    &seg.dictionary.prefix_dictionary
                } else {
                    &seg.user_dictionary
                        .as_ref()
                        .ok_or_else(|| JsError::new("no user dictionary"))?
                        .dict
                };
                let j = entry_of(dict, t.word_id.id)
                    .ok_or_else(|| JsError::new("a word not in its dictionary"))?;
                let l = dict
                    .prefix(&t.surface)
                    .find(|(len, l)| *len == t.surface.len() && l.word_id == t.word_id)
                    .map(|(_, l)| l);
                (l, j)
            };
            out.push(Entry {
                s: at,
                e: at + n,
                surface: t.surface.to_string(),
                lentry,
                jentry,
            });
            at += n;
        }
        Ok(out)
    }
    fn sentence(
        &self,
        words: &[String],
    ) -> Result<(String, Vec<usize>, Vec<Entry>, Vec<usize>), JsError> {
        let mut norm = String::new();
        let mut starts = vec![0];
        for w in words {
            norm.push_str(&normalize_text_for_naist_jdic(w));
            starts.push(norm.chars().count());
        }
        let mut entries = self.entries(&norm);
        let mut alone = Vec::new();
        for t in self.tokens(&norm)? {
            let same = entries.iter().position(|x| {
                x.s == t.s
                    && x.e == t.e
                    && t.lentry.is_some()
                    && x.lentry.map(|l| l.word_id) == t.lentry.map(|l| l.word_id)
            });
            alone.push(same.unwrap_or_else(|| {
                entries.push(t);
                entries.len() - 1
            }));
        }
        Ok((norm, starts, entries, alone))
    }
}

#[wasm_bindgen]
impl Frontend {
    /// `bytes`: the dictionary files one after another (in the order of DICT_FILES); `lengths`: the length of each;
    /// `user`: a user dictionary, rows in the system dictionary's CSV format (one per line, `#` comments), whose
    /// entries take part next to the system dictionary's.
    #[wasm_bindgen(constructor)]
    pub fn new(
        bytes: Vec<u8>,
        lengths: Vec<u32>,
        user: Option<String>,
    ) -> Result<Frontend, JsError> {
        let (dictionary, metadata) = load_dictionary(bytes, &lengths)?;
        let user_dictionary = match user {
            Some(csv) => {
                let rows: Vec<Vec<&str>> = csv
                    .lines()
                    .map(str::trim)
                    .filter(|l| !l.is_empty() && !l.starts_with('#'))
                    .map(|l| l.split(',').collect())
                    .collect();
                Some(
                    JPreprocessDictionaryBuilder::new(metadata)
                        .build_user_dict_from_data(rows)
                        .map_err(err)?,
                )
            }
            None => None,
        };
        Ok(Frontend {
            tok: Tokenizer::new(Segmenter::new(Mode::Normal, dictionary, user_dictionary)),
        })
    }

    /// `[njd, labels]` as JSON: the NJD features of each word (CSV, as pyopenjtalk's run_frontend prints them) and
    /// the full-context label of each phoneme, for the text as OpenJTalk analyses it
    pub fn analyze(&self, text: &str) -> Result<String, JsError> {
        let nodes = self
            .tokens(&normalize_text_for_naist_jdic(text))?
            .iter()
            .flat_map(|x| NJDNode::load(&x.surface, &x.jentry))
            .collect();
        rules(nodes)
    }

    /// `words`: the text of each word of a YomiScript (JSON array of strings) -> a Sentence as JSON
    pub fn candidates(&self, words: &str) -> Result<String, JsError> {
        let words: Vec<String> = serde_json::from_str(words).map_err(err)?;
        let (norm, starts, entries, alone) = self.sentence(&words)?;
        let cands = entries
            .iter()
            .map(|x| Cand {
                s: x.s,
                e: x.e,
                ph: morae(&x.jentry, &x.surface),
                cost: x.lentry.map_or(0, |l| l.word_cost as i32),
                l: x.lentry.map_or(-1, |l| l.left_id() as i32),
                r: x.lentry.map_or(-1, |l| l.right_id() as i32),
            })
            .collect();
        serde_json::to_string(&Sentence {
            norm,
            starts,
            cands,
            alone,
        })
        .map_err(err)
    }

    /// the connection cost from an entry with right id `r` to one with left id `l` (0: the start or end of the
    /// sentence; -1: an unknown word, 0 cost)
    pub fn conn(&self, r: i32, l: i32) -> i32 {
        if r < 0 || l < 0 {
            return 0;
        }
        self.tok
            .segmenter
            .dictionary
            .connection_cost_matrix
            .cost(r as u32, l as u32)
    }

    /// `request`: `{ words, path }`, the words as given to `candidates` and the chosen entries in order (indices into
    /// its cands) -> `[njd, labels]` as `analyze` returns them. An entry that starts inside a word of the YomiScript
    /// (and each later part of a compound entry) joins the accent phrase before, so a word is never split between
    /// two phrases; marks keep OpenJTalk's rule.
    pub fn label(&self, request: &str) -> Result<String, JsError> {
        let req: LabelRequest = serde_json::from_str(request).map_err(err)?;
        let (_, starts, entries, _) = self.sentence(&req.words)?;
        let mut nodes = Vec::new();
        for &i in &req.path {
            let x = entries
                .get(i)
                .ok_or_else(|| JsError::new("label: no such entry"))?;
            let first = nodes.len();
            nodes.extend(NJDNode::load(&x.surface, &x.jentry));
            let inside = !starts.contains(&x.s);
            for (k, n) in nodes.iter_mut().enumerate().skip(first) {
                if (inside || k > first) && !matches!(n.get_pos(), POS::Kigou(_)) {
                    n.set_chain_flag(true);
                }
            }
        }
        rules(nodes)
    }
}
