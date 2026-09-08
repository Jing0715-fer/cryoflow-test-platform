"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Hourglass, Zap, Crown, Scale, Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { MergedJob } from "@/lib/job-catalog";
import type { JobLevel } from "@/lib/types";
import { cn } from "@/lib/utils";

function fmtDuration(sec: number): string {
  if (sec <= 0) return "—";
  if (sec < 60) return `${sec.toFixed(1)} s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

const LEVEL_STYLE: Record<JobLevel, { bar: string; dot: string; label: string }> = {
  real: { bar: "bg-teal-500/80", dot: "bg-teal-500", label: "真实 RELION 执行" },
  "external-app-real": { bar: "bg-cyan-500/80", dot: "bg-cyan-500", label: "外部应用真实执行" },
  "engine-native": { bar: "bg-violet-500/80", dot: "bg-violet-500", label: "引擎原生实现" },
  "input-unavailable": { bar: "bg-amber-500/70", dot: "bg-amber-500", label: "输入不可用（数据集不含）" },
  "external-unavailable": { bar: "bg-rose-400/70", dot: "bg-rose-400", label: "外部依赖不可用" },
  "sequential-limit": { bar: "bg-fuchsia-500/70", dot: "bg-fuchsia-500", label: "顺序模式限制" },
  "known-gap": { bar: "bg-pink-500/70", dot: "bg-pink-500", label: "引擎待实现" },
  pending: { bar: "bg-muted", dot: "bg-muted-foreground/40", label: "等待执行" },
};

type Filter = "all" | "real-only" | "spa" | "tomo";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "全部 36" },
  { key: "real-only", label: "仅真实执行" },
  { key: "spa", label: "SPA 流程" },
  { key: "tomo", label: "Tomo 流程" },
];

export function WalltimeSection({ jobs }: { jobs: MergedJob[] }) {
  const [filter, setFilter] = useState<Filter>("all");

  const executed = useMemo(
    () => jobs.filter((j) => typeof j.durationSec === "number" && j.durationSec > 0 && j.status !== "pending"),
    [jobs]
  );

  const filtered = useMemo(() => {
    switch (filter) {
      case "real-only":
        return executed.filter((j) => j.level === "real" || j.level === "external-app-real");
      case "spa":
        return executed.filter((j) => j.group === "SPA");
      case "tomo":
        return executed.filter((j) => j.group === "Tomo");
      default:
        return executed;
    }
  }, [executed, filter]);

  const sorted = useMemo(() => [...filtered].sort((a, b) => (b.durationSec ?? 0) - (a.durationSec ?? 0)), [filtered]);

  const stats = useMemo(() => {
    const all = executed.map((j) => j.durationSec ?? 0);
    const total = all.reduce((a, b) => a + b, 0);
    const realSec = executed
      .filter((j) => j.level === "real" || j.level === "external-app-real")
      .reduce((a, j) => a + (j.durationSec ?? 0), 0);
    const longest = sorted[0];
    const mid = [...all].sort((a, b) => a - b);
    const median = mid.length ? mid[Math.floor(mid.length / 2)] : 0;
    return { total, realSec, longest, median };
  }, [executed, sorted]);

  const maxSec = sorted[0]?.durationSec ?? 1;
  // log scale: import 0.5s … topaztrain 8485s would be invisible on a linear axis
  const widthFor = (sec: number) => `${(Math.log10(1 + sec) / Math.log10(1 + maxSec)) * 100}%`;

  const topazJob = executed.find((j) => j.key === "topaztrain");
  const topazShare = topazJob && stats.total > 0 ? (topazJob.durationSec ?? 0) / stats.total : 0;

  const insight = topazShare > 0.5 && (
    <div className="flex items-start gap-2 rounded-lg border border-cyan-300/50 bg-cyan-50/50 p-3 text-xs leading-relaxed text-cyan-900 dark:border-cyan-800/50 dark:bg-cyan-950/30 dark:text-cyan-200">
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <p>
        单个 <span className="font-mono font-semibold">topaztrain</span>（CPU torch）占总耗时{" "}
        <span className="font-mono font-semibold tabular-nums">{(topazShare * 100).toFixed(0)}%</span>
        。深度学习类 job 是 CPU 沙箱的主要时间成本——这正是 Section 4/5 中将其路由到 Slurm GPU
        分区（A100/H100，1 卡 ≈ 数十倍吞吐）的直接动因。
      </p>
    </div>
  );

  const statCards = [
    { icon: Hourglass, label: "累计执行耗时", value: fmtDuration(stats.total), sub: `${executed.length} 个已执行 job` },
    {
      icon: Zap,
      label: "真实二进制执行",
      value: fmtDuration(stats.realSec),
      sub: `占 ${stats.total > 0 ? ((stats.realSec / stats.total) * 100).toFixed(0) : 0}% · level=real`,
    },
    {
      icon: Crown,
      label: "最长单任务",
      value: fmtDuration(stats.longest?.durationSec ?? 0),
      sub: stats.longest?.name ?? "—",
    },
    { icon: Scale, label: "中位耗时", value: fmtDuration(stats.median), sub: "对数刻度下分布均匀" },
  ];

  return (
    <div className="space-y-4">
      {/* stat cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {statCards.map((s) => (
          <Card key={s.label} className="p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground">{s.label}</p>
              <s.icon className="h-4 w-4 text-primary" aria-hidden />
            </div>
            <p className="mt-2 font-mono text-xl font-bold tabular-nums tracking-tight text-foreground">
              {s.value}
            </p>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={s.sub}>
              {s.sub}
            </p>
          </Card>
        ))}
      </div>

      {insight}

      {/* filters + legend */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="耗时过滤">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
              className={cn(
                "min-h-9 rounded-full border px-3 text-xs font-medium transition-colors",
                filter === f.key
                  ? "border-primary/60 bg-primary/10 text-primary"
                  : "border-border/70 bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {(["real", "external-app-real", "engine-native", "input-unavailable"] as JobLevel[]).map((lv) => (
            <span key={lv} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className={cn("h-2 w-2 rounded-full", LEVEL_STYLE[lv].dot)} aria-hidden />
              {LEVEL_STYLE[lv].label}
            </span>
          ))}
        </div>
      </div>

      {/* bars */}
      <Card className="overflow-hidden p-0">
        <CardContent className="p-0">
          <div className="nice-scroll max-h-[26rem] overflow-y-auto">
            <ul className="divide-y divide-border/60">
              {sorted.map((job, i) => {
                const sec = job.durationSec ?? 0;
                const style = LEVEL_STYLE[job.level] ?? LEVEL_STYLE.pending;
                return (
                  <TooltipProvider key={job.key} delayDuration={120}>
                    <li>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="grid grid-cols-[minmax(7.5rem,11rem)_1fr_auto] items-center gap-3 px-4 py-2 transition-colors hover:bg-accent/40 sm:grid-cols-[minmax(10rem,14rem)_1fr_auto]">
                            <p className="truncate font-mono text-xs text-foreground/90" title={job.name}>
                              {job.name}
                            </p>
                            <div
                              className="h-4 overflow-hidden rounded-r-full rounded-l-sm bg-muted/60"
                              role="img"
                              aria-label={`${job.name} 耗时 ${fmtDuration(sec)}`}
                            >
                              <motion.div
                                className={cn("h-full", style.bar)}
                                initial={{ width: 0 }}
                                whileInView={{ width: widthFor(sec) }}
                                viewport={{ once: true, margin: "-20px" }}
                                transition={{ duration: 0.5, delay: Math.min(i * 0.02, 0.4), ease: "easeOut" }}
                              />
                            </div>
                            <p className="w-20 text-right font-mono text-xs tabular-nums text-muted-foreground">
                              {fmtDuration(sec)}
                            </p>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-md">
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="font-mono text-[10px]">
                                {job.key}
                              </Badge>
                              <span className={cn("flex items-center gap-1.5 text-[11px] text-muted-foreground")}>
                                <span className={cn("h-1.5 w-1.5 rounded-full", style.dot)} aria-hidden />
                                {style.label}
                              </span>
                            </div>
                            <p className="font-mono text-xs">
                              {fmtDuration(sec)} · status={job.status}
                              {job.command ? (
                                <span className="mt-1 block max-w-sm break-all text-[10px] text-muted-foreground">
                                  {job.command}
                                </span>
                              ) : null}
                            </p>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </li>
                  </TooltipProvider>
                );
              })}
              {sorted.length === 0 && (
                <li className="p-6 text-center text-sm text-muted-foreground">当前过滤条件下暂无已执行记录。</li>
              )}
            </ul>
          </div>
          <div className="flex items-center justify-between border-t border-border/60 bg-muted/30 px-4 py-2">
            <p className="text-[11px] text-muted-foreground">
              条宽 = log₁₀(1+秒) 对数刻度 · 按耗时降序 · {sorted.length} 条记录
            </p>
            <p className="font-mono text-[11px] text-muted-foreground">max {fmtDuration(maxSec)}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
