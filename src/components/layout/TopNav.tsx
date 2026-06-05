"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { Sparkles } from "@/components/hero/icons";
import { ThemeToggle } from "@/components/hero/ThemeToggle";
import { useTheme } from "./ThemeProvider";

export interface TopNavProps {
  /** When provided (home page), the logo is a button that clears the chat. Otherwise it links to "/". */
  onLogoClick?: () => void;
  /** Drives the home page's "different world" hover wash. */
  onLogoHover?: (hovering: boolean) => void;
  /** Show the "+ New" button (home page, while in chat). */
  showNewChat?: boolean;
  onNewChat?: () => void;
}

/** Unified top nav shared by the home chat and the Profile / Projects / About pages. */
export function TopNav({ onLogoClick, onLogoHover, showNewChat, onNewChat }: TopNavProps) {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  const txt = isDark ? "text-white" : "text-black";
  const txtMuted = isDark ? "text-white/80 hover:text-white" : "text-black/70 hover:text-black";
  const glassMod = isDark ? "" : "is-light";
  const world = isDark ? "dark" : "light";

  const logoClass = `nemi-logo ${world} ${txt} flex items-center gap-2`;
  const logoInner = (
    <>
      <Sparkles size={20} />
      <span className="text-base font-semibold tracking-tight">Nemi</span>
    </>
  );

  return (
    <nav className="relative z-20 shrink-0 px-6 py-6">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
        <div className={`liquid-glass ${glassMod} flex items-center gap-1 rounded-full py-2 pl-3 pr-3`}>
          {onLogoClick ? (
            <button
              type="button"
              onClick={onLogoClick}
              onMouseEnter={() => onLogoHover?.(true)}
              onMouseLeave={() => onLogoHover?.(false)}
              className={logoClass}
            >
              {logoInner}
            </button>
          ) : (
            <Link
              href="/"
              onMouseEnter={() => onLogoHover?.(true)}
              onMouseLeave={() => onLogoHover?.(false)}
              className={logoClass}
            >
              {logoInner}
            </Link>
          )}
          <div className="ml-1 hidden items-center gap-0.5 md:flex">
            <Link href="/profile" className={`nav-link ${world} ${txtMuted} text-sm font-medium`}>
              Profile
            </Link>
            <Link href="/projects" className={`nav-link ${world} ${txtMuted} text-sm font-medium`}>
              Projects
            </Link>
            <Link href="/about" className={`nav-link ${world} ${txtMuted} text-sm font-medium`}>
              About
            </Link>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {showNewChat && onNewChat && (
            <button
              type="button"
              onClick={onNewChat}
              className={`liquid-glass ${glassMod} flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm transition-all ${
                isDark ? "text-white/80 hover:text-white" : "text-black/70 hover:text-black"
              }`}
            >
              <Plus size={15} /> New
            </button>
          )}
          <ThemeToggle theme={theme} setTheme={setTheme} />
        </div>
      </div>
    </nav>
  );
}
