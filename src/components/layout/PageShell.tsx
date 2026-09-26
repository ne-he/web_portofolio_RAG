"use client";

import type { ReactNode } from "react";
import { VideoBackground } from "@/components/hero/VideoBackground";
import { TopNav } from "./TopNav";
import { useTheme } from "./ThemeProvider";

/**
 * Shared scaffold for the Profile / Projects / About routes: same particle-video
 * background + scrim + unified nav as the home page.
 *
 * - No `children` → centered "Coming soon" placeholder.
 * - With `children` → scrollable content layout: the video sits as a fixed
 *   backdrop behind a readability veil, content scrolls over it.
 */
export function PageShell({ title, children }: { title: string; children?: ReactNode }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const videoSrc = isDark ? "/hero/dark-bg.mp4" : "/hero/light-bg.mp4";

  const scrim = isDark
    ? "linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0) 35%, rgba(0,0,0,0) 60%, rgba(0,0,0,0.55) 100%)"
    : "linear-gradient(180deg, rgba(245,245,245,0.35) 0%, rgba(245,245,245,0) 35%, rgba(245,245,245,0) 60%, rgba(245,245,245,0.6) 100%)";

  if (!children) {
    return (
      <div
        className={`relative flex h-dvh flex-col overflow-hidden ${isDark ? "bg-black" : "bg-[#f5f5f5]"}`}
      >
        <VideoBackground key={videoSrc} src={videoSrc} />
        <div className="scrim" style={{ background: scrim }} />
        <TopNav />
        <div
          className={`relative z-10 flex flex-1 items-center justify-center px-6 pb-16 ${
            isDark ? "text-white" : "text-black"
          }`}
        >
          <div
            className={`glass-soft ${isDark ? "" : "is-light"} w-full max-w-lg rounded-3xl px-8 py-14 text-center`}
          >
            <h1
              className="text-3xl md:text-4xl"
              style={{
                fontFamily: "var(--font-space-grotesk), system-ui, sans-serif",
                fontWeight: 500,
                letterSpacing: "-0.03em",
              }}
            >
              {title}
            </h1>
            <p className={`mt-3 text-sm ${isDark ? "text-white/60" : "text-black/60"}`}>
              Coming soon.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative h-dvh overflow-y-auto ${isDark ? "bg-black text-white" : "bg-[#f5f5f5] text-black"}`}
    >
      {/* Fixed particle-video backdrop + readability veil */}
      <div className="fixed inset-0 z-0 overflow-hidden">
        <VideoBackground key={videoSrc} src={videoSrc} />
        <div className="scrim" style={{ background: scrim }} />
        <div className={`absolute inset-0 ${isDark ? "bg-black/55" : "bg-white/60"}`} />
      </div>

      <div className="relative z-10">
        <div className="sticky top-0 z-30">
          <TopNav />
        </div>
        <main className="mx-auto w-full max-w-3xl px-6 pb-24 pt-2">
          <h1
            className="mb-8 text-4xl md:text-5xl"
            style={{
              fontFamily: "var(--font-space-grotesk), system-ui, sans-serif",
              fontWeight: 500,
              letterSpacing: "-0.03em",
            }}
          >
            {title}
          </h1>
          <div className="space-y-5">{children}</div>
        </main>
      </div>
    </div>
  );
}
