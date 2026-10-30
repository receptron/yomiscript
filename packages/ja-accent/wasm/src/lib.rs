//! OpenJTalk's Japanese front end (jpreprocess, NAIST-JDIC) for JavaScript: the words after the front end's rules
//! (NJD) and the full-context labels of a text. The dictionary is given as bytes, so it runs where there is no file
//! system (the browser).
use jpreprocess::{DefaultTokenizer, Dictionary, JPreprocess};
use lindera_dictionary::dictionary::{
    character_definition::CharacterDefinition, connection_cost_matrix::ConnectionCostMatrix,
    metadata::Metadata, prefix_dictionary::PrefixDictionary, unknown_dictionary::UnknownDictionary,
};
use wasm_bindgen::prelude::*;

/// The number of dictionary files; their names and order are DICT_FILES in ../src/frontend.ts.
const FILES: usize = 8;

fn err(e: impl std::fmt::Display) -> JsError {
    JsError::new(&e.to_string())
}

#[wasm_bindgen]
pub struct Frontend(JPreprocess<DefaultTokenizer>);

#[wasm_bindgen]
impl Frontend {
    /// `bytes`: the dictionary files one after another (in the order of DICT_FILES); `lengths`: the length of each.
    #[wasm_bindgen(constructor)]
    pub fn new(bytes: Vec<u8>, lengths: Vec<u32>) -> Result<Frontend, JsError> {
        if lengths.len() != FILES {
            return Err(JsError::new("expected the 8 dictionary files"));
        }
        let total: usize = lengths.iter().map(|&n| n as usize).sum();
        if total != bytes.len() {
            return Err(JsError::new("the dictionary bytes do not match the lengths"));
        }
        // split from the end, so no file is copied (the dictionary is about 80 MB)
        let mut rest = bytes;
        let mut parts: Vec<Vec<u8>> = Vec::with_capacity(FILES);
        for &n in lengths.iter().rev() {
            let tail = rest.split_off(rest.len() - n as usize);
            parts.push(tail);
        }
        parts.reverse();
        let [metadata, char_def, matrix, da, vals, words_idx, words, unk]: [Vec<u8>; 8] =
            parts.try_into().map_err(|_| JsError::new("expected the 8 dictionary files"))?;
        let dictionary = Dictionary {
            metadata: Metadata::load(&metadata).map_err(err)?,
            prefix_dictionary: PrefixDictionary::load(da, vals, words_idx, words, true).map_err(err)?,
            connection_cost_matrix: ConnectionCostMatrix::load(matrix).map_err(err)?,
            character_definition: CharacterDefinition::load(&char_def).map_err(err)?,
            unknown_dictionary: UnknownDictionary::load(&unk).map_err(err)?,
        };
        Ok(Frontend(JPreprocess::with_dictionaries(dictionary, None)))
    }

    /// `[njd, labels]` as JSON: the NJD features of each word (CSV, as pyopenjtalk's run_frontend prints them) and
    /// the full-context label of each phoneme.
    pub fn analyze(&self, text: &str) -> Result<String, JsError> {
        let njd = self.0.run_frontend(text).map_err(err)?;
        let labels: Vec<String> = self.0.make_label(njd.clone()).iter().map(|l| l.to_string()).collect();
        serde_json::to_string(&(njd, labels)).map_err(err)
    }
}
