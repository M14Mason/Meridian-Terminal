// Cashtag extraction for SOCL (pure, tested).
const TAG = /(?:^|[^\w$])\$([A-Z]{1,5}(?:\.[A-Z])?)(?![\w$])/g;

/** Unique $TICKER cashtags in a post. Numbers like $100 and lowercase words are ignored. */
export function cashtags(text: string): string[] {
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  TAG.lastIndex = 0;
  while ((m = TAG.exec(text))) out.add(m[1]!);
  return [...out];
}
