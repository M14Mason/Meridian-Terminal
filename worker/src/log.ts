// Structured logs. Never pass tokens, keys, codes, request bodies or portfolio data here (2.3, 21.7).
export function log(event: string, fields: Record<string, string | number | boolean | null> = {}): void {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ t: new Date().toISOString(), event, ...fields }));
}
