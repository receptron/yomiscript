// Which span of the original text is being spoken at a time: the highlight in the view.
import type { SpanTime } from "@mulmovoice/core";

/** the span being spoken at time t (seconds from the start of the audio), or -1 between and outside spans */
export function spanAt(times: readonly SpanTime[], t: number): number {
  for (const x of times) if (t >= x.start && t < x.end) return x.span;
  return -1;
}

/** the original text split into the pieces the view shows, each with its span index */
export function pieces(texts: readonly string[]): { span: number; text: string }[] {
  return texts.map((text, span) => ({ span, text }));
}
