"use client";

import { VideoBackground } from "@/components/hero/VideoBackground";
import { TopNav } from "./TopNav";
import { useTheme } from "./ThemeProvider";

/**
 * Shared scaffold for the Profile / Projects / About routes: same particle-video
 * background + scrim + unified nav as the home page, with a centered glass panel.
 * Content is a "Coming soon" placeholder for now — theme-aware in light & dark.
 */
export function PageShell({ title }: { title: string }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const videoSrc = isDark ? "/hero/dark-bg.mp4" : "/hero/light-bg.mp4";

  const scrim = isDark
    ? "linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0) 35%, rgba(0,0,0,0) 60%, rgba(0,0,0,0.55) 100%)"
    : "linear-gradient(180deg, rgba(245,245,245,0.35) 0%, rgba(245,245,245,0) 35%, rgba(245,245,245,0) 60%, rgba(245,245,245,0.6) 100%)";

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
