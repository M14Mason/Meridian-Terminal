// Synced settings (7.1). Stored as one record: settings/main.
import { sync, useRecord } from './sync';

export type ThemeName = 'classic' | 'dark' | 'light';

export interface Settings {
  theme: ThemeName;
  colorBlind: boolean;
  tickerTape: boolean;
  lowPower: 'auto' | 'on' | 'off';
  sounds: boolean;
  learnMode: boolean;
  /** Starred function codes, shown on the favorites bar and in the Launchpad. */
  favorites: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'classic',
  colorBlind: false,
  tickerTape: true,
  lowPower: 'auto',
  sounds: false,
  learnMode: false,
  favorites: ['WEI', 'GP', 'N', 'HEAT', 'GURU', 'TNKR'],
};

export function useSettings(): Settings {
  const s = useRecord<Partial<Settings>>('settings', 'main');
  return { ...DEFAULT_SETTINGS, ...s };
}

export function updateSettings(patch: Partial<Settings>): void {
  const cur = { ...DEFAULT_SETTINGS, ...sync.get<Partial<Settings>>('settings', 'main') };
  void sync.put('settings', 'main', { ...cur, ...patch });
}

/** Applies theme tokens. Themes change CSS variables only, never layout (9.1). */
export function applyTheme(s: Settings): void {
  const root = document.documentElement;
  root.dataset.theme = s.theme;
  root.dataset.cb = s.colorBlind ? '1' : '0';
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', s.theme === 'light' ? '#ffffff' : s.theme === 'dark' ? '#0b0b0b' : '#000000');
}
