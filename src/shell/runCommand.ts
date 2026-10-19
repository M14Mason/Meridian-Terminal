// Turns command text into a layout action. Shared by desktop, mobile and pop-out shells.
import { parseCommand } from './command';
import { findFunction } from './registry';
import type { FunctionDef } from './types';

export interface Resolved {
  fn: FunctionDef;
  security?: string;
}

/** Returns the resolved function, or an error message for the command line. */
export function resolveCommand(input: string, contextSecurity?: string): Resolved | string {
  const p = parseCommand(input);
  if (p.error === 'empty') return 'Type a command';
  if (p.error || !p.code) return p.error ?? 'unknown command';
  const fn = findFunction(p.code)!;
  const security = p.security ?? (fn.needsSecurity ? contextSecurity : undefined);
  if (fn.needsSecurity && !security) return `${fn.code} needs a ticker, for example AAPL ${fn.code}`;
  return { fn, security: security ?? undefined };
}
