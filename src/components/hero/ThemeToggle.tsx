"use client";

import { Moon, Sun } from "./icons";

export type Theme = "dark" | "light";

/** Light / Dark pill toggle (top-right of the hero) — ported 1:1 from Hero.html. */
export function ThemeToggle({
  theme,
  setTheme,
}: {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}) {
  const isDark = theme === "dark";
  const baseBtn =
    "rounded-full px-4 py-1.5 text-sm font-medium flex items-center gap-2 transition-all";
  // In light mode the surrounding text is dark; in dark mode it's light.
  const activeStyle = isDark ? "bg-white text-black" : "bg-black text-white";
  const inactiveStyle = isDark
    ? "text-white/70 hover:text-white"
    : "text-black/60 hover:text-black";

  return (
    <div
      className={`liquid-glass ${isDark ? "" : "is-light"} flex items-center gap-1 rounded-full p-1`}
    >
      <button
        onClick={() => setTheme("light")}
        aria-pressed={!isDark}
        className={`${baseBtn} ${!isDark ? activeStyle : inactiveStyle}`}
      >
        <Sun size={14} />
        <span>Light</span>
      </button>
      <button
        onClick={() => setTheme("dark")}
        aria-pressed={isDark}
        className={`${baseBtn} ${isDark ? activeStyle : inactiveStyle}`}
      >
        <Moon size={14} />
        <span>Dark</span>
      </button>
    </div>
  );
}
