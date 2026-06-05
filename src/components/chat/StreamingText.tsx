import type { ReactNode } from "react";

/**
 * Lightweight inline markdown → JSX for the bot's casual answers: **bold**,
 * *italic*, and `code`. Dependency-free on purpose (no react-markdown) so the
 * build stays lean; upgrade later if the bot starts emitting tables/links.
 */
function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Order matters: try **bold** before *italic* so `**` isn't eaten as two `*`.
  const regex = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`)/g;
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) {
      nodes.push(
        <strong key={key++} className="font-semibold">
          {tok.slice(2, -2)}
        </strong>,
      );
    } else if (tok.startsWith("`")) {
      nodes.push(
        <code
          key={key++}
          className="rounded-md px-1.5 py-0.5 text-[0.86em]"
          // Icy accent tint reads on both the dark and light glass cards; Geist Mono per spec.
          style={{ fontFamily: "var(--font-geist-mono), monospace", background: "rgba(170,222,255,0.14)" }}
        >
          {tok.slice(1, -1)}
        </code>,
      );
    } else {
      nodes.push(
        <em key={key++} className="italic opacity-90">
          {tok.slice(1, -1)}
        </em>,
      );
    }
    last = regex.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export interface StreamingTextProps {
  text: string;
  isStreaming?: boolean;
}

/** Inline-markdown text + a glowing icy cursor while streaming (per-token fade via .tok). */
export function StreamingText({ text, isStreaming }: StreamingTextProps) {
  return (
    <span className="tok whitespace-pre-wrap">
      {renderInline(text)}
      {isStreaming && <span className="stream-cursor" aria-hidden />}
    </span>
  );
}
