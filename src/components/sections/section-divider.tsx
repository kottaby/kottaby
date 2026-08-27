"use client";

import { motion } from "framer-motion";

/**
 * SectionDivider — a slim decorative copper flourish rendered between sections.
 *
 * Renders a centered horizontal line with a copper diamond ornament in the
 * middle. Fades + scales in on scroll-into-view.
 *
 * Usage: drop `<SectionDivider />` between two `<Section>` components in
 * `page.tsx` to visually bridge them.
 */
export function SectionDivider() {
  return (
    <div
      className="flex items-center justify-center py-2"
      aria-hidden
    >
      <motion.div
        initial={{ opacity: 0, scaleX: 0.8 }}
        whileInView={{ opacity: 1, scaleX: 1 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="flex items-center gap-3 text-copper/40"
      >
        {/* Left line */}
        <span className="h-px w-16 sm:w-24 bg-gradient-to-r from-transparent to-copper/40" />
        {/* Diamond ornament */}
        <span className="relative flex h-3 w-3 rotate-45 border border-copper/50">
          <span className="absolute inset-0.5 bg-copper/20" />
        </span>
        {/* Right line */}
        <span className="h-px w-16 sm:w-24 bg-gradient-to-l from-transparent to-copper/40" />
      </motion.div>
    </div>
  );
}
