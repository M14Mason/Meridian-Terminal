// Cross-window link sync for pop-outs (feature 117) over BroadcastChannel.
import type { LinkColor } from './types';

export interface LinkMessage {
  link: LinkColor;
  security: string;
}

const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('meridian-link');

export const linkChannel = {
  send(m: LinkMessage) {
    channel?.postMessage(m);
  },
  listen(fn: (m: LinkMessage) => void): () => void {
    if (!channel) return () => undefined;
    const h = (e: MessageEvent) => {
      const d = e.data as Partial<LinkMessage>;
      if (typeof d?.link === 'string' && typeof d.security === 'string' && /^[A-Z0-9.\-/]{1,10}$/.test(d.security)) fn(d as LinkMessage);
    };
    channel.addEventListener('message', h);
    return () => channel.removeEventListener('message', h);
  },
};
