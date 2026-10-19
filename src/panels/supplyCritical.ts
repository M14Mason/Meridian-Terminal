// "Critical" marker for SPLC: a relationship the company says it depends on, judged ONLY from the filing's
// own words (evidence quote and description) or a disclosed share of 10% or more. Never an opinion.
export interface CritInput { k: string; share?: number | null; ev?: string; what?: string }

const RULES: [RegExp, string][] = [
  [/\b(sole|single)[- ]source|sole supplier|only supplier|only source/i, 'sole or single source'],
  [/\bsubstantially all\b|\ball (?:of (?:our|the) )?wafers\b|\bmajority of\b/i, 'supplies most or all of an input'],
  [/\b(we|company) (?:depends?|relies|rely) (?:heavily |significantly |primarily )?on\b|\bdependent on\b|\bwe rely on\b/i, 'company says it depends on it'],
  [/\blimited number of\b/i, 'one of a limited number of suppliers'],
];

/** Returns the reason a relationship is critical, or null. Applies to suppliers and to customers with a big share. */
export function criticalReason(r: CritInput): string | null {
  if (r.share != null && r.share >= 10) return `${r.share}% ${r.k === 'customer' ? 'of revenue' : 'of purchases'}`;
  if (r.k !== 'supplier') return null;
  const text = `${r.ev ?? ''} ${r.what ?? ''}`;
  for (const [re, why] of RULES) if (re.test(text)) return why;
  return null;
}
