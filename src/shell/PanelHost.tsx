import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react';
import { ErrorBoundary } from './ErrorBoundary';
import { PanelMetaContext, type PanelMeta } from './panelMeta';
import { PlannedPanel } from './panels/PlannedPanel';
import { findFunction, FUNCTIONS } from './registry';
import type { PanelProps } from './types';

// Each panel's code loads only when first rendered (21.2). The lazy wrappers are created once.
const LAZY: Record<string, LazyExoticComponent<ComponentType<PanelProps>>> = Object.fromEntries(
  FUNCTIONS.filter((f) => f.load).map((f) => [f.code, lazy(f.load!)]),
);

const noop = () => undefined;

export function PanelHost({ onMeta, ...props }: PanelProps & { onMeta?: (m: PanelMeta | null) => void }) {
  const fn = findFunction(props.code);
  if (!fn) return <div className="panel-error down">Unknown function {props.code}</div>;
  const Panel = LAZY[fn.code];
  return (
    <PanelMetaContext.Provider value={onMeta ?? noop}>
    <ErrorBoundary label={fn.code} key={`${fn.code}:${props.security ?? ''}`}>
      {Panel ? (
        <Suspense fallback={<div className="skeleton" aria-busy="true" />}>
          <Panel {...props} />
        </Suspense>
      ) : (
        <PlannedPanel fn={fn} security={props.security} />
      )}
    </ErrorBoundary>
    </PanelMetaContext.Provider>
  );
}
