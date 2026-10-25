/**
 * Tema sağlayıcısı. PerdeGo marka gereği yalnızca koyu temayla çalışır;
 * sistem açık temada olsa bile uygulama koyu kalır (bkz. docs/DESIGN.md).
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { theme, type Theme } from './tokens';

interface ThemeContextValue {
  theme: Theme;
}

const ThemeContext = createContext<ThemeContextValue>({ theme });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const value = useMemo(() => ({ theme }), []);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
