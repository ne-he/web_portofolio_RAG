"use client";

import { useEffect, useRef } from "react";
import type { KeyboardEvent } from "react";
import { ArrowRight } from "lucide-react";

export interface InputBarProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  isDark?: boolean;
  placeholder?: string;
}

export function InputBar({
  value,
  onChange,
  onSend,
  disabled,
  isDark = true,
  placeholder = "Ask Nemi anything…",
}: InputBarProps) {
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow the textarea up to a max height, then it scrolls internally.
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [value]);

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter submits; Shift+Enter inserts a newline.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && value.trim()) onSend();
    }
  }

  const sendReady = value.trim().length > 0 && !disabled;
  const txt = isDark ? "text-white" : "text-zinc-900";
  const ph = isDark ? "placeholder:text-white/35" : "placeholder:text-black/35";

  return (
    <div
      className={`liquid-glass accent-focus ${isDark ? "" : "is-light"} flex items-end gap-3 rounded-3xl py-2.5 pl-5 pr-2.5`}
    >
      <textarea
        ref={taRef}
        rows={1}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={`max-h-40 flex-1 resize-none bg-transparent py-1.5 text-[15px] leading-relaxed outline-none ${txt} ${ph}`}
      />
      <button
        type="button"
        onClick={() => sendReady && onSend()}
        disabled={!sendReady}
        aria-label="Kirim"
        className="shrink-0 rounded-2xl p-2.5 transition-all duration-300"
        // Send turns icy + glows once there's text to send.
        style={
          sendReady
            ? { background: "rgba(170,222,255,1)", color: "#04121c", boxShadow: "0 0 22px -4px rgba(170,222,255,0.85)" }
            : {
                background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
                color: isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)",
              }
        }
      >
        <ArrowRight size={18} />
      </button>
    </div>
  );
}
