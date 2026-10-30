// What the LLM passes to the tool, and what the view gets.

export interface SpeakArgs {
  /** the YomiScript the LLM wrote: the pronunciation, with the original text in <t:…> (D23) */
  yomiscript: string;
}
export interface SpeakData {
  yomiscript: string;
  /** the original text of each span, in order (empty when the YomiScript has no <t:…>) */
  texts: string[];
  /** the language tag of the utterance */
  lang: string;
}
