import type { DataState } from '../data/useData';

// Loading, empty, stale and error states with retry, shared by every data panel (21.4).
export function DataStatus<T>({ state, empty, keyName }: { state: DataState<T>; empty?: boolean; keyName?: string }) {
  if (state.missingKey) {
    return (
      <div className="state">
        <div className="warn">{keyName ?? 'A provider'} key is not set.</div>
        <div className="muted">Add it in SET &gt; Keys. It is stored encrypted in your proxy, never on this device.</div>
      </div>
    );
  }
  if (state.error && state.data === undefined) {
    return (
      <div className="state">
        <div className={state.error.startsWith('No data yet') ? 'muted' : 'down'}>{state.error.startsWith('No data yet') ? state.error : `Could not load: ${state.error}`}</div>
        <button onClick={state.refresh}>RETRY</button>
      </div>
    );
  }
  if (state.data === undefined) return <div className="skeleton" aria-busy="true" />;
  if (empty) return <div className="state muted">No data.</div>;
  if (state.error) return <div className="muted">Showing cached data. Last refresh failed: {state.error}</div>;
  return null;
}
