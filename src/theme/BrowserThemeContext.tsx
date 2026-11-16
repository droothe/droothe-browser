import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";

export const browserThemes = [
  { id: "droothe-signature", label: "Droothe Signature" },
  { id: "midnight-cyan", label: "Midnight Cyan" },
  { id: "obsidian-slate", label: "Obsidian Slate" },
] as const;

export type BrowserTheme = (typeof browserThemes)[number]["id"];

type BrowserThemeContextValue = {
  theme: BrowserTheme;
  setTheme: (theme: BrowserTheme) => void;
};

const STORAGE_KEY = "droothe-browser-theme";
const BrowserThemeContext = createContext<BrowserThemeContextValue | null>(null);

function isBrowserTheme(value: string | null): value is BrowserTheme {
  return browserThemes.some((theme) => theme.id === value);
}

export function BrowserThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<BrowserTheme>(() => {
    const storedTheme = window.localStorage.getItem(STORAGE_KEY);
    return isBrowserTheme(storedTheme) ? storedTheme : "droothe-signature";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const value = useMemo(() => ({ theme, setTheme }), [theme]);

  return <BrowserThemeContext.Provider value={value}>{children}</BrowserThemeContext.Provider>;
}

export function useBrowserTheme() {
  const context = useContext(BrowserThemeContext);
  if (!context) {
    throw new Error("useBrowserTheme must be used within a BrowserThemeProvider");
  }
  return context;
}
