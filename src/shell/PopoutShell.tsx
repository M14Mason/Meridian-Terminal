import { useEffect, useRef, useState } from 'react';
import { CommandLine } from './CommandLine';
import { linkChannel } from './linkChannel';
import { PanelHost } from './PanelHost';
import { AgeBadge, type PanelMeta } from './panelMeta';
import { findFunction } from './registry';
import { resolveCommand } from './runCommand';
import { LINK_COLORS, type LinkColor } from './types';

// A single panel in its own window (feature 117). Linked tickers sync over BroadcastChannel.
export function PopoutShell({ params }: { params: URLSearchParams }) {
  const [code, setCode] = useState(() => (findFunction(params.get('code') ?? '') ? params.get('code')!.toUpperCase() : 'HELP'));
  const [security, setSecurity] = useState(() => params.get('sec')?.toUpperCase() || undefined);
  const link = LINK_COLORS.includes(params.get('link') as LinkColor) ? (params.get('link') as LinkColor) : null;
  const cmdRef = useRef<HTMLInputElement>(null);
  const [meta, setMeta] = useState<PanelMeta | null>(null);

  useEffect(() => {
    if (!link) return;
    return linkChannel.listen((m) => m.link === link && setSecurity(m.security));
  }, [link]);

  useEffect(() => {
    document.title = `${security ? security + ' ' : ''}${code}`;
  }, [code, security]);

  function run(input: string): string | null {
    const r = resolveCommand(input, security);
    if (typeof r === 'string') return r;
    setCode(r.fn.code);
    setSecurity(r.security);
    if (link && r.security) linkChannel.send({ link, security: r.security });
    return null;
  }

  return (
    <div className="shell">
      <div className="topbar">
        {link && <span className={`frame__link link--${link}`}>●</span>}
        <CommandLine inputRef={cmdRef} onRun={(c) => run(c)} />
        <AgeBadge meta={meta} />
      </div>
      <div className="popout__body">
        <PanelHost onMeta={setMeta} panelId="popout" code={code} security={security} args={{}} run={(c) => void run(c)} />
      </div>
    </div>
  );
}
