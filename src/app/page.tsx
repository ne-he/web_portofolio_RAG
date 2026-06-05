"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { InputBar } from "@/components/chat/InputBar";
import { HeroLanding } from "@/components/hero/HeroLanding";
import { VideoBackground } from "@/components/hero/VideoBackground";
import { TopNav } from "@/components/layout/TopNav";
import { useTheme } from "@/components/layout/ThemeProvider";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export default function Home() {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentStream, setCurrentStream] = useState("");
  const [thinking, setThinking] = useState(false);
  const [logoHover, setLogoHover] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the bottom whenever messages, the live stream, or thinking update.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, currentStream, thinking]);

  const sendMessage = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || isLoading) return;

      const nextMessages: ChatMessage[] = [...messages, { role: "user", content }];
      setMessages(nextMessages);
      setInputValue("");
      setIsLoading(true);
      setCurrentStream("");
      setThinking(true); // show think-dots until the first token lands

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: nextMessages }),
        });
        if (!res.ok || !res.body) {
          // Server rejected the request (rate limit, payload caps, etc.). The
          // body is JSON `{ error }` — surface it as a normal assistant bubble
          // instead of throwing (which would prepend "Gagal konek ke server").
          let serverMsg = "";
          try {
            const data = (await res.json()) as { error?: string };
            serverMsg = data.error ?? "";
          } catch {
            serverMsg = "";
          }
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content:
                serverMsg ||
                `⚠️ Server lagi error nih (HTTP ${res.status}) — coba lagi sebentar ya.`,
            },
          ]);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let assistant = "";
        let streamError = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // SSE events are separated by a blank line.
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";
          for (const evt of events) {
            const line = evt.trim();
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data) as { text?: string; error?: string };
              if (parsed.text) {
                assistant += parsed.text;
                setThinking(false); // first token arrived → swap dots for the stream
                setCurrentStream(assistant);
              } else if (parsed.error) {
                streamError = parsed.error;
              }
            } catch {
              // ignore partial / non-JSON frames
            }
          }
        }

        const finalText = streamError
          ? `⚠️ Error: ${streamError}`
          : assistant || "(maaf, jawaban kosong)";
        setMessages((prev) => [...prev, { role: "assistant", content: finalText }]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `⚠️ Gagal konek ke server: ${msg}` },
        ]);
      } finally {
        setIsLoading(false);
        setCurrentStream("");
        setThinking(false);
      }
    },
    [messages, isLoading],
  );

  // Back to the hero landing — clears the conversation.
  const resetToLanding = useCallback(() => {
    if (isLoading) return;
    setMessages([]);
    setCurrentStream("");
    setInputValue("");
    setThinking(false);
  }, [isLoading]);

  const inChat = messages.length > 0 || isLoading;
  const videoSrc = isDark ? "/hero/dark-bg.mp4" : "/hero/light-bg.mp4";

  // Top + bottom scrims; in chat we deepen the bottom so input & text stay readable.
  // A gentle veil that keeps the particle face visible while lifting text/glass
  // legibility over the bright video. Chat (base) veils a touch more than the
  // landing (hero), where the face stays most vivid.
  const baseScrim = isDark
    ? "linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.28) 32%, rgba(0,0,0,0.32) 58%, rgba(0,0,0,0.75) 100%)"
    : "linear-gradient(180deg, rgba(245,245,245,0.55) 0%, rgba(245,245,245,0.32) 32%, rgba(245,245,245,0.36) 58%, rgba(245,245,245,0.82) 100%)";
  const heroScrim = isDark
    ? "linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.12) 30%, rgba(0,0,0,0.2) 52%, rgba(0,0,0,0.26) 66%, rgba(0,0,0,0.5) 100%)"
    : "linear-gradient(180deg, rgba(245,245,245,0.5) 0%, rgba(245,245,245,0.16) 30%, rgba(245,245,245,0.28) 52%, rgba(245,245,245,0.34) 66%, rgba(245,245,245,0.62) 100%)";

  return (
    <div
      className={`relative flex h-dvh flex-col overflow-hidden ${
        isDark ? "bg-black" : "bg-[#f5f5f5]"
      }`}
    >
      {/* Particle face stays put across both states; only the scrim depth changes. */}
      <VideoBackground key={videoSrc} src={videoSrc} />
      <div className="scrim" style={{ background: inChat ? baseScrim : heroScrim }} />

      {/* "different world" wash — fades in while the Nemi logo is hovered */}
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-700 ease-out"
        aria-hidden
        style={{
          opacity: logoHover ? 1 : 0,
          background: isDark
            ? "radial-gradient(120% 90% at 10% 0%, rgba(170,222,255,0.26) 0%, rgba(120,180,255,0.10) 35%, rgba(0,0,0,0) 65%), radial-gradient(100% 100% at 100% 100%, rgba(40,80,160,0.22), rgba(0,0,0,0) 60%)"
            : "radial-gradient(120% 90% at 10% 0%, rgba(6,14,30,0.42) 0%, rgba(20,40,80,0.22) 35%, rgba(255,255,255,0) 65%), radial-gradient(100% 100% at 100% 100%, rgba(170,222,255,0.28), rgba(255,255,255,0) 60%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 mix-blend-overlay transition-opacity duration-700 ease-out"
        aria-hidden
        style={{
          opacity: logoHover ? 1 : 0,
          background: "radial-gradient(60% 60% at 12% 5%, rgba(170,222,255,0.5), rgba(0,0,0,0) 70%)",
        }}
      />

      {/* Unified nav — always visible on landing and in chat */}
      <TopNav
        onLogoClick={resetToLanding}
        onLogoHover={setLogoHover}
        showNewChat={inChat}
        onNewChat={resetToLanding}
      />

      {inChat ? (
        /* ---------------- CHAT ---------------- */
        <div className="relative z-10 flex min-h-0 flex-1 flex-col">
          <div ref={scrollRef} className="chat-scroll flex-1 overflow-y-auto px-5">
            <div className="mx-auto flex w-full max-w-2xl flex-col gap-7 py-6">
              {messages.map((m, i) => (
                <MessageBubble key={i} role={m.role} content={m.content} isDark={isDark} />
              ))}
              {isLoading && (
                <MessageBubble
                  role="assistant"
                  isDark={isDark}
                  thinking={thinking}
                  isStreaming={!thinking}
                  content={currentStream}
                />
              )}
            </div>
          </div>
          <div className="shrink-0 px-5 pb-7 pt-2">
            <div className="mx-auto w-full max-w-2xl">
              <InputBar
                value={inputValue}
                onChange={setInputValue}
                onSend={() => sendMessage(inputValue)}
                disabled={isLoading}
                isDark={isDark}
                placeholder="Ask Nemi anything…"
              />
            </div>
          </div>
        </div>
      ) : (
        /* ---------------- LANDING ---------------- */
        <HeroLanding
          isDark={isDark}
          value={inputValue}
          onChange={setInputValue}
          onSend={() => sendMessage(inputValue)}
          onSelectSuggestion={(q) => sendMessage(q)}
          disabled={isLoading}
        />
      )}
    </div>
  );
}
