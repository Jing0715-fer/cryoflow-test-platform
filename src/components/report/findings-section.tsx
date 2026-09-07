"use client";

/**
 * Findings section — real bugs found & fixed during the comprehensive
 * EMPIAR-10017 test run (feeds from meta.findings in test-results.json).
 */

import { useMemo } from "react";
import { Bug, CheckCircle2, Wrench, Info, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useTestResults } from "@/hooks/use-test-results";
import type { Finding } from "@/lib/types";

const SEV_STYLE: Record<string, { label: string; cls: string }> = {
  high: { label: "HIGH", cls: "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300" },
  medium: { label: "MED", cls: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  info: { label: "INFO", cls: "border-slate-400/40 bg-slate-400/10 text-slate-600 dark:text-slate-300" },
};

const STATUS_STYLE: Record<string, { icon: typeof CheckCircle2; label: string; cls: string }> = {
  fixed: { icon: CheckCircle2, label: "已修复并提交", cls: "text-emerald-600 dark:text-emerald-400" },
  workaround: { icon: Wrench, label: "测试期绕过", cls: "text-amber-600 dark:text-amber-400" },
  "not-a-bug": { icon: Info, label: "环境特性（非缺陷）", cls: "text-slate-500 dark:text-slate-400" },
};

export function FindingsSection() {
  const { report } = useTestResults(5000);
  const findings = useMemo<Finding[]>(() => {
    const f = report.raw.meta?.findings;
    return Array.isArray(f) ? f : [];
  }, [report]);

  if (findings.length === 0) return null;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {findings.map((f) => {
        const sev = SEV_STYLE[f.severity] ?? SEV_STYLE.info;
        const st = STATUS_STYLE[f.status] ?? STATUS_STYLE["not-a-bug"];
        return (
          <article
            key={f.id}
            className="group rounded-xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
          >
            <header className="flex items-start gap-2">
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400">
                <Bug className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className={`px-1.5 text-[10px] font-semibold ${sev.cls}`}>
                    {sev.label}
                  </Badge>
                  <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${st.cls}`}>
                    <st.icon className="size-3" aria-hidden="true" />
                    {st.label}
                  </span>
                </div>
                <h3 className="mt-1.5 text-sm font-semibold leading-snug text-foreground">
                  {f.title}
                </h3>
              </div>
            </header>
            <dl className="mt-3 space-y-2.5 text-[12px] leading-relaxed">
              <div>
                <dt className="font-medium text-rose-600 dark:text-rose-400">症状</dt>
                <dd className="mt-0.5 font-mono text-[11px] text-muted-foreground">{f.symptom}</dd>
              </div>
              <div>
                <dt className="font-medium text-foreground/80">根因</dt>
                <dd className="mt-0.5 text-muted-foreground">{f.rootCause}</dd>
              </div>
              <div>
                <dt className="font-medium text-emerald-600 dark:text-emerald-400">处置</dt>
                <dd className="mt-0.5 text-muted-foreground">{f.fix}</dd>
              </div>
            </dl>
          </article>
        );
      })}
    </div>
  );
}
