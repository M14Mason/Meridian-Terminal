import type { ComponentType } from 'react';

export type LinkColor = 'amber' | 'red' | 'green' | 'blue' | 'violet';
export const LINK_COLORS: LinkColor[] = ['amber', 'red', 'green', 'blue', 'violet'];

export type MobileTab = 'markets' | 'charts' | 'news' | 'maps' | 'portfolio' | 'more';

export interface PanelProps {
  panelId: string;
  code: string;
  security?: string;
  args: Record<string, string>;
  /**
   * Run a command from inside a panel. Opens a new panel by default (for example clicking a
   * function in HELP); `replace: true` reuses this panel (for example switching a note's ticker).
   */
  run: (command: string, opts?: { replace?: boolean }) => void;
}

export interface FunctionDef {
  code: string;
  aliases: string[];
  title: string;
  description: string;
  needsSecurity: boolean;
  /** Milestone that builds it. Functions without `load` are not built yet and say so. */
  milestone: string;
  category: string;
  load?: () => Promise<{ default: ComponentType<PanelProps> }>;
  /** Default frame size in grid units (48 columns, 16 px rows). */
  size?: { w: number; h: number };
  mobileTab?: MobileTab;
}
