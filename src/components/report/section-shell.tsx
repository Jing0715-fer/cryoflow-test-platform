"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function SectionShell({
  id,
  icon: Icon,
  eyebrow,
  title,
  description,
  children,
  className,
}: {
  id: string;
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className={cn("scroll-mt-24", className)}>
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
            <Icon className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary/80">{eyebrow}</p>
            <h2 id={`${id}-heading`} className="mt-1 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              {title}
            </h2>
            <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-muted-foreground">{description}</p>
          </div>
        </div>
        <div className="mt-6">{children}</div>
      </motion.div>
    </section>
  );
}

const emptySubscribe = () => () => {};

/** Hydration-safe "mounted" flag (avoids setState-in-effect). */
export function useMounted() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}
