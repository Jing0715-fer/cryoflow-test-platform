"use client";

import { cn } from "@/lib/utils";
import { CATEGORY_TONE, LEVEL_LABEL } from "@/lib/job-catalog";
import type { JobLevel, JobStatus } from "@/lib/types";
import { CheckCircle2, XCircle, CircleDashed } from "lucide-react";

export function CategoryBadge({ category, className }: { category: string; className?: string }) {
  const tone = CATEGORY_TONE[category] ?? CATEGORY_TONE["External"];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium leading-tight whitespace-nowrap",
        tone,
        className
      )}
    >
      {category}
    </span>
  );
}

export function LevelBadge({ level }: { level: JobLevel }) {
  const map: Record<JobLevel, string> = {
    real: "border-teal-300/70 bg-teal-50 text-teal-700 dark:border-teal-700/60 dark:bg-teal-950/50 dark:text-teal-300",
    "engine-native":
      "border-violet-300/70 bg-violet-50 text-violet-700 dark:border-violet-700/60 dark:bg-violet-950/50 dark:text-violet-300",
    "external-unavailable":
      "border-amber-300/70 bg-amber-50 text-amber-700 dark:border-amber-700/60 dark:bg-amber-950/50 dark:text-amber-300",
    "input-unavailable":
      "border-orange-300/70 bg-orange-50 text-orange-700 dark:border-orange-700/60 dark:bg-orange-950/50 dark:text-orange-300",
    pending: "border-slate-300/70 bg-slate-100 text-slate-500 dark:border-slate-700/60 dark:bg-slate-800/60 dark:text-slate-400",
  };
  return (
    <span
      title={LEVEL_LABEL[level]}
      className={cn(
        "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium leading-tight whitespace-nowrap",
        map[level]
      )}
    >
      {LEVEL_LABEL[level]}
    </span>
  );
}

export function StatusBadge({ status, compact = false }: { status: JobStatus; compact?: boolean }) {
  if (status === "pass") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-emerald-300/70 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:border-emerald-700/60 dark:bg-emerald-950/50 dark:text-emerald-300">
        <CheckCircle2 className="h-3 w-3" aria-hidden />
        {compact ? "PASS" : "通过"}
      </span>
    );
  }
  if (status === "fail") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-rose-300/70 bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 dark:border-rose-700/60 dark:bg-rose-950/50 dark:text-rose-300">
        <XCircle className="h-3 w-3" aria-hidden />
        {compact ? "FAIL" : "失败"}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-300/70 bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:border-slate-700/60 dark:bg-slate-800/60 dark:text-slate-400">
      <CircleDashed className="h-3 w-3 soft-pulse" aria-hidden />
      {compact ? "PENDING" : "等待"}
    </span>
  );
}
