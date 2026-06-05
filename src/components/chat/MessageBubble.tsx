import { cn } from "@/lib/utils";
import { StreamingText } from "./StreamingText";

export interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  /** While true, the assistant card shows three pulsing think-dots instead of text. */
  thinking?: boolean;
  isDark?: boolean;
}

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1.5 py-1">
      <span className="think-dot" />
      <span className="think-dot" style={{ animationDelay: "0.18s" }} />
      <span className="think-dot" style={{ animationDelay: "0.36s" }} />
    </div>
  );
}

export function MessageBubble({
  role,
  content,
  isStreaming,
  thinking,
  isDark = true,
}: MessageBubbleProps) {
  if (role === "user") {
    return (
      <div className="msg-enter flex justify-end">
        <div
          data-role="user"
          className={cn(
            "glass-accent max-w-[80%] rounded-3xl rounded-br-lg px-5 py-3 text-[15px] leading-relaxed",
            isDark ? "text-white" : "text-zinc-900",
          )}
        >
          <span className="whitespace-pre-wrap">{content}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="msg-enter flex items-start gap-3.5">
      <div className="particle-dot mt-1.5 size-3.5 shrink-0 rounded-full" aria-hidden />
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "mb-1.5 text-[11px] uppercase tracking-[0.22em]",
            isDark ? "text-white/40" : "text-black/40",
          )}
          style={{ fontFamily: "var(--font-space-grotesk), sans-serif" }}
        >
          Nemi
        </div>
        <div
          data-role="assistant"
          className={cn(
            "glass-soft rounded-3xl rounded-tl-lg px-5 py-3.5 text-[15px] leading-[1.7]",
            !isDark && "is-light",
            isDark ? "text-white/90" : "text-zinc-800",
          )}
        >
          {thinking ? (
            <ThinkingDots />
          ) : (
            <StreamingText text={content} isStreaming={isStreaming} />
          )}
        </div>
      </div>
    </div>
  );
}
