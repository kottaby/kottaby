"use client";

import * as React from "react";

/**
 * ReadingProgressBar — a slim copper bar fixed to the top of the viewport
 * that fills as the user scrolls through the page. Respects reduced motion.
 * Hidden on print.
 */
export function ReadingProgressBar() {
  const [progress, setProgress] = React.useState(0);

  React.useEffect(() => {
    let ticking = false;
    const update = () => {
      const doc = document.documentElement;
      const scrollTop = doc.scrollTop || document.body.scrollTop;
      const height = doc.scrollHeight - doc.clientHeight;
      const pct = height > 0 ? Math.min(100, Math.max(0, (scrollTop / height) * 100)) : 0;
      setProgress(pct);
      ticking = false;
    };

    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(update);
      }
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div
      aria-hidden
      className="fixed top-0 inset-x-0 z-[60] h-[3px] pointer-events-none print:hidden"
    >
      <div
        className="h-full bg-gradient-to-r from-copper via-[#E0985C] to-[#B87333] shadow-[0_0_8px_rgba(224,152,92,0.6)] transition-[width] duration-75 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
