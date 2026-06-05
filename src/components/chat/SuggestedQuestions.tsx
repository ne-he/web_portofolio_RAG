"use client";

import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  "Apa pengalaman kerja Nehemiah?",
  "Project AI/ML apa yang udah Nemi bikin?",
  "Nemi orangnya gimana sih?",
  "Nemi suka makanan apa?",
];

export interface SuggestedQuestionsProps {
  onSelect: (question: string) => void;
  disabled?: boolean;
  isDark?: boolean;
}

export function SuggestedQuestions({ onSelect, disabled, isDark = true }: SuggestedQuestionsProps) {
  return (
    <div className="flex flex-wrap justify-center gap-2.5">
      {SUGGESTIONS.map((q) => (
        <button
          key={q}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(q)}
          className={cn(
            "liquid-glass rounded-full px-4 py-2 text-[13px] transition-all disabled:opacity-40",
            isDark
              ? "text-white/75 hover:bg-white/5 hover:text-white"
              : "is-light text-black/70 hover:bg-black/5 hover:text-black",
          )}
        >
          {q}
        </button>
      ))}
    </div>
  );
}
