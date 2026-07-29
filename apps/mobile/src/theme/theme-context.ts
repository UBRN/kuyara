import { createContext, use } from 'react';

import type { KuyaraTheme } from './theme.ts';

export const KuyaraThemeContext = createContext<KuyaraTheme | null>(null);

export function useKuyaraTheme(): KuyaraTheme {
  const theme = use(KuyaraThemeContext);

  if (!theme) {
    throw new Error('useKuyaraTheme must be used within KuyaraThemeProvider');
  }

  return theme;
}
