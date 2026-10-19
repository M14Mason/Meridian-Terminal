import type { FunctionDef } from '../types';

// Shown for registered functions that are not built yet. Never pretends to have data (3.3).
export function PlannedPanel({ fn, security }: { fn: FunctionDef; security?: string }) {
  return (
    <div className="planned">
      <div className="planned__code">
        {security ? `${security} ` : ''}
        {fn.code}
      </div>
      <div>{fn.title}</div>
      <p className="muted">{fn.description}</p>
      <p className="warn">Not built yet. Arrives in milestone {fn.milestone}.</p>
    </div>
  );
}
