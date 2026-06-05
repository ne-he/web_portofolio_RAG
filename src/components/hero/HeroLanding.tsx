"use client";

import { Github, Instagram, WhatsApp } from "./icons";
import { InputBar } from "@/components/chat/InputBar";
import { SuggestedQuestions } from "@/components/chat/SuggestedQuestions";

/**
 * The landing (zero-message) state: the "Ask Nemi everything." headline, the
 * shared chat InputBar as the entry point, suggested-question pills, and the
 * social footer. The unified top nav lives in TopNav (rendered by the page).
 */
export function HeroLanding({
  isDark,
  value,
  onChange,
  onSend,
  onSelectSuggestion,
  disabled,
}: {
  isDark: boolean;
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onSelectSuggestion: (question: string) => void;
  disabled: boolean;
}) {
  const txt = isDark ? "text-white" : "text-black";
  const glassMod = isDark ? "" : "is-light";
  const social = isDark
    ? "text-white/80 hover:bg-white/5 hover:text-white"
    : "text-black/70 hover:bg-black/5 hover:text-black";

  return (
    <div className={`relative z-10 flex flex-1 flex-col ${txt}`}>
      <div className="flex flex-1 -translate-y-[10%] flex-col items-center justify-center px-6 py-12 text-center">
        <h1
          className="mb-10 whitespace-nowrap text-4xl tracking-tight sm:text-5xl md:text-6xl lg:text-7xl"
          style={{
            fontFamily: "var(--font-space-grotesk), system-ui, sans-serif",
            fontWeight: 400,
            letterSpacing: "-0.045em",
            // Soft halo so the headline stays legible over the bright moving video.
            textShadow: isDark
              ? "0 1px 32px rgba(0,0,0,0.55), 0 1px 4px rgba(0,0,0,0.4)"
              : "0 1px 32px rgba(245,245,245,0.85), 0 1px 4px rgba(245,245,245,0.7)",
          }}
        >
          Ask Nemi{" "}
          <span style={{ fontStyle: "italic", fontWeight: 300, opacity: 0.85 }}>
            everything.
          </span>
        </h1>

        <div className="w-full max-w-xl space-y-5 pt-12 md:pt-16">
          <InputBar
            value={value}
            onChange={onChange}
            onSend={onSend}
            disabled={disabled}
            isDark={isDark}
            placeholder="Enter your question"
          />
          <SuggestedQuestions
            onSelect={onSelectSuggestion}
            disabled={disabled}
            isDark={isDark}
          />
        </div>
      </div>

      {/* Social footer */}
      <div className="flex shrink-0 justify-center gap-4 pb-12">
        <a
          href="https://instagram.com/nehemiah_wj"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Instagram"
          className={`liquid-glass ${glassMod} rounded-full p-4 transition-all ${social}`}
        >
          <Instagram size={20} />
        </a>
        <a
          href="https://github.com/ne-he"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="GitHub"
          className={`liquid-glass ${glassMod} rounded-full p-4 transition-all ${social}`}
        >
          <Github size={20} />
        </a>
        <a
          href="https://wa.me/6281911497766"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="WhatsApp"
          className={`liquid-glass ${glassMod} rounded-full p-4 transition-all ${social}`}
        >
          <WhatsApp size={20} />
        </a>
      </div>
    </div>
  );
}
