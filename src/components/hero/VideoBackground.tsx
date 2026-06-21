"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Fullscreen face-particle video background with a CROSS-FADED loop.
 *
 * Why two stacked <video>s: a single `<video loop>` (or a manual seek-to-0) shows
 * a visible jump / "rewind" at the loop seam unless the file is frame-perfect.
 * Instead we run two copies of the same clip and, ~0.45s before the active one
 * ends, start the other from 0 and cross-fade between them — which hides the
 * seam entirely, regardless of how the video was encoded.
 */
export function VideoBackground({ src }: { src: string }) {
  const aRef = useRef<HTMLVideoElement>(null);
  const bRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const a = aRef.current;
    const b = bRef.current;
    if (!a || !b) return;

    const FADE = 0.45; // seconds of cross-fade at the loop seam
    let raf = 0;
    let active = a;
    let standby = b;
    let fading = false;

    a.style.opacity = "1";
    b.style.opacity = "0";
    try {
      a.currentTime = 0;
      b.currentTime = 0;
    } catch {
      /* not seekable yet — fine */
    }
    a.play().catch(() => {
      /* autoplay can be blocked until interaction — safe to ignore */
    });

    const tick = () => {
      const d = active.duration;
      if (d && Number.isFinite(d) && d > FADE * 2 && !fading && active.currentTime >= d - FADE) {
        fading = true;
        const ending = active;
        const incoming = standby;
        try {
          incoming.currentTime = 0;
        } catch {
          /* ignore */
        }
        incoming.play().catch(() => {});
        ending.style.transition = `opacity ${FADE}s linear`;
        incoming.style.transition = `opacity ${FADE}s linear`;
        // Next frame so the browser actually animates the opacity change.
        requestAnimationFrame(() => {
          ending.style.opacity = "0";
          incoming.style.opacity = "1";
        });
        window.setTimeout(
          () => {
            ending.pause();
            try {
              ending.currentTime = 0;
            } catch {
              /* ignore */
            }
            ending.style.transition = "";
            incoming.style.transition = "";
            active = incoming;
            standby = ending;
            fading = false;
          },
          FADE * 1000 + 40,
        );
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(raf);
  }, [src]);

  const videoClass =
    "absolute inset-0 h-full w-full scale-[1.32] translate-y-[10%] object-cover";

  return (
    // Dark-navy placeholder shown INSTANTLY (matches the particle-face tone) so
    // the first paint looks intentional instead of a black "broken" screen while
    // the ~10MB clip buffers. The videos fade in on top once the first frame is
    // decoded.
    <div
      aria-hidden
      className="absolute inset-0"
      style={{
        background:
          "radial-gradient(120% 90% at 50% 32%, #0c1018 0%, #05070c 62%, #010204 100%)",
      }}
    >
      <div
        className={`absolute inset-0 transition-opacity duration-700 ${
          ready ? "opacity-100" : "opacity-0"
        }`}
      >
        <video
          ref={aRef}
          src={src}
          muted
          playsInline
          preload="auto"
          // loadeddata fires when the FIRST frame is ready — earlier than canplay
          // (which waits until it can play through), so the face appears sooner.
          onLoadedData={() => setReady(true)}
          onCanPlay={() => setReady(true)}
          className={videoClass}
          style={{ opacity: 1 }}
        />
        <video
          ref={bRef}
          src={src}
          muted
          playsInline
          preload="auto"
          className={videoClass}
          style={{ opacity: 0 }}
        />
      </div>
    </div>
  );
}
