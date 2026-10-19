// Voice commands (catalog 124): Web Speech API where the browser supports it (Chrome, Edge, Safari).
// Speech is turned into a command line entry; nothing runs until the owner presses GO or Enter.
type Rec = { lang: string; interimResults: boolean; maxAlternatives: number; start(): void; abort(): void; onresult: ((e: { results: { 0: { transcript: string } }[] }) => void) | null; onerror: (() => void) | null; onend: (() => void) | null };

export function speechSupported(): boolean {
  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition);
}

const WORDS: [RegExp, string][] = [
  [/\b(price )?chart\b/, 'GP'], [/\bintraday\b/, 'GIP'], [/\bnews\b/, 'CN'], [/\bdescription|profile|about\b/, 'DES'],
  [/\bfinancials?\b/, 'FA'], [/\bfilings?\b/, 'CF'], [/\bsupply chain|suppliers?\b/, 'SPLC'], [/\bportfolio\b/, 'PORT'],
  [/\balerts?\b/, 'ALRT'], [/\boptions?( chain)?\b/, 'OMON'], [/\bvaluation\b/, 'VAL'], [/\bpredict(ion)?s?\b/, 'PRED'],
  [/\binsiders?\b/, 'INS'], [/\bheat ?map\b/, 'HEAT'], [/\bscreener\b/, 'EQS'], [/\bhelp\b/, 'HELP'], [/\bmorning brief|brief\b/, 'BRIF'],
];

/** "apple chart" -> "AAPL GP" using a ticker resolver; unknown words pass through for fuzzy autocomplete. */
export function spokenToCommand(text: string, nameToTicker: (name: string) => string | null): string {
  let t = text.toLowerCase().replace(/[.,!?]/g, ' ').trim();
  let fn = '';
  for (const [re, code] of WORDS) if (re.test(t)) { fn = code; t = t.replace(re, ' ').trim(); break; }
  t = t.replace(/\b(show|me|open|the|for|of|please|get)\b/g, ' ').replace(/\s+/g, ' ').trim();
  const sym = t ? nameToTicker(t) ?? (/^[a-z]{1,5}$/.test(t.replace(/ /g, '')) ? t.replace(/ /g, '').toUpperCase() : null) : null;
  return [sym, fn].filter(Boolean).join(' ') || text.toUpperCase();
}

export function listen(onText: (t: string) => void, onEnd: () => void): () => void {
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  const C = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!C) { onEnd(); return () => undefined; }
  const r = new C();
  r.lang = 'en-US';
  r.interimResults = false;
  r.maxAlternatives = 1;
  r.onresult = (e) => onText(e.results[0]?.[0]?.transcript ?? '');
  r.onerror = () => onEnd();
  r.onend = () => onEnd();
  r.start();
  return () => r.abort();
}
