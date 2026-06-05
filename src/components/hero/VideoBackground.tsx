"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Fullscreen face-particle video background.
 *
 * Playback: the `autoPlay` attribute isn't reliably honored after a client-side
 * (keyed) remount, so we also kick `.play()` off explicitly once data is ready
 * — mirrors the original Hero.html prototype, which is why the particles
 * actually animate instead of freezing on the first frame.
 *
 * Perf: the element starts at opacity-0 over the parent's solid bg and fades in
 * on `canplay`, so the rest of the UI renders immediately and is never blocked
 * on the video. The `translate-y-[17%]` framing matches Hero.html so the face
 * sits correctly.
 */
export function VideoBackground({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const tryPlay = () => {
      v.play().catch(() => {
        /* autoplay can be blocked until interaction — safe to ignore */
      });
    };
    v.load();
    v.addEventListener("loadeddata", tryPlay);
    tryPlay(); // in case it's already buffered (cached) before the listener attaches
    return () => v.removeEventListener("loadeddata", tryPlay);
  }, [src]);

  return (
    <video
      ref={videoRef}
      src={src}
      muted
      autoPlay
      loop
      playsInline
      preload="auto"
      aria-hidden
      onCanPlay={() => setReady(true)}
      className={`absolute inset-0 h-full w-full scale-[1.32] translate-y-[10%] object-cover transition-opacity duration-700 ${
        ready ? "opacity-100" : "opacity-0"
      }`}
    />
  );
}
