"use client";

import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";
import type { Theme } from "@/components/hero/ThemeToggle";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Holds the light/dark choice in the root layout so it survives client-side
 * navigation between the home chat and the /profile /projects /about pages —
 * every screen reads the same theme via {@link useTheme}.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");
  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
