"use client";

import { Box } from "@mui/material";
import type { ReactNode } from "react";

// ─── Hero particles ──────────────────────────────────────────────

interface Particle {
  readonly id: number;
  readonly left: string;
  readonly top: string;
  readonly size: number;
  readonly delay: string;
  readonly duration: string;
}

const HERO_PARTICLES: readonly Particle[] = Array.from({ length: 25 }, (_, i) => ({
  id: i,
  left: `${(i * 37 + 13) % 100}%`,
  top: `${(i * 53 + 7) % 100}%`,
  // 2px base — a size of 1 would serialize as "100%" in MUI sx
  // (number 1 is treated as a fraction), which rendered full-hero
  // copper circles. Explicit px strings keep the intent unambiguous.
  size: 2 + (i % 3),
  delay: `${(i * 0.7) % 4}s`,
  duration: `${2 + (i % 3)}s`,
}));

export function HeroParticles(): ReactNode {
  return (
    <Box
      aria-hidden
      sx={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 0,
        // One keyframes declaration on the parent; declaring it per-particle
        // would serialize the identical rule 25 times.
        "@keyframes twinkle": {
          "0%": { opacity: 0 },
          "50%": { opacity: 0.8 },
          "100%": { opacity: 0 },
        },
      }}
    >
      {HERO_PARTICLES.map(p => (
        <Box
          key={p.id}
          sx={{
            position: "absolute",
            left: p.left,
            top: p.top,
            width: `${p.size}px`,
            height: `${p.size}px`,
            borderRadius: "50%",
            bgcolor: "var(--mui-palette-secondary-light)",
            animation: `twinkle ${p.duration} ease-in-out ${p.delay} infinite`,
          }}
        />
      ))}
    </Box>
  );
}
