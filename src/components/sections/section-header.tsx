"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface SectionHeaderProps {
  badge: string;
  title: string;
  subtitle?: string;
  align?: "center" | "start";
  className?: string;
}

export function SectionHeader({
  badge,
  title,
  subtitle,
  align = "center",
  className,
}: SectionHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className={cn(
        "max-w-2xl flex flex-col gap-3",
        align === "center" ? "mx-auto text-center items-center" : "text-start items-start",
        className
      )}
    >
      <span className="inline-flex items-center gap-1.5 rounded-full border border-copper/30 bg-copper/10 px-3 py-1 text-xs font-semibold tracking-wide text-copper">
        <span className="h-1.5 w-1.5 rounded-full bg-copper" />
        {badge}
      </span>
      <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-balance">
        {title}
      </h2>
      {subtitle && (
        <p className="text-base md:text-lg text-muted-foreground leading-relaxed text-balance">
          {subtitle}
        </p>
      )}
    </motion.div>
  );
}
