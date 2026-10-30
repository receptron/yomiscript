// What every Katarite offers to the apps (CLI, MCP server, gui-chat-protocol plugin): YomiScript in, audio out,
// and when each <t:…> span (D23) is spoken, so the text can be shown and the current word highlighted.

export interface SpanTime {
  /** index into parse(ys).texts */
  span: number;
  /** seconds from the start of the audio */
  start: number;
  end: number;
}
export interface Speech {
  samples: Float32Array;
  sampleRate: number;
  /** the original text of each span (<t:…>), empty when the YomiScript has none */
  texts: string[];
  /** when each span is spoken; may be empty when the engine cannot tell */
  times: SpanTime[];
}
export interface Katarite {
  readonly name: string;
  /** the languages it speaks (BCP 47 primary tags) */
  readonly languages: readonly string[];
  speak(ys: string): Promise<Speech>;
}
