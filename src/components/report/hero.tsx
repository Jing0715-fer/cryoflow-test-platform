"use client";

import { motion } from "framer-motion";
import { CheckCircle2, Cpu, FlaskConical, PackageX, Radar, Timer, Layers3, Database } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import type { TestReport } from "@/hooks/use-test-results";
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

const KPI_DEFS = [
  { key: "passed", label: "通过测试", sub: "全部 36 个 job 类型", icon: CheckCircle2, tone: "text-emerald-600 dark:text-emerald-400" },
  { key: "real", label: "真实 RELION 执行", sub: "level = real · 引擎调用 RELION 二进制", icon: FlaskConical, tone: "text-teal-600 dark:text-teal-400" },
  { key: "engineNative", label: "引擎原生实现", sub: "level = engine-native · TS 内置逻辑", icon: Cpu, tone: "text-violet-600 dark:text-violet-400" },
  { key: "external", label: "外部依赖不可用", sub: "level = external-unavailable · 环境缺依赖", icon: PackageX, tone: "text-amber-600 dark:text-amber-400" },
  { key: "totalSec", label: "累计真实耗时", sub: "已执行 job 时长汇总", icon: Timer, tone: "text-cyan-600 dark:text-cyan-400" },
] as const;

export function Hero({ report, isFetching }: { report: TestReport; isFetching: boolean }) {
  const { stats, raw, updatedAtLabel } = report;
  const env = raw.meta?.environment ?? {};
  // every non-pending/non-running record counts as executed — includes the
  // honest-failure reclassifications (sequential-limit, known-gap) which are
  // TESTED outcomes, not unfinished work
  const done = stats.total - stats.pending - stats.running;
  const progressPct = stats.total > 0 ? (done / stats.total) * 100 : 0;
  const running = stats.pending > 0;

  const envEntries: { icon: typeof Database; label: string; value?: string }[] = [
    { icon: FlaskConical, label: "RELION", value: env.relion },
    { icon: Radar, label: "Topaz", value: env.topaz },
    { icon: Layers3, label: "ctffind", value: env.ctffind },
    { icon: Cpu, label: "MPI", value: env.mpi },
    { icon: Database, label: "数据集", value: env.data },
    { icon: Database, label: "沙箱环境", value: env.host },
  ];

  return (
    <div className="hero-grid -mx-4 border-b border-primary/10 bg-gradient-to-b from-primary/[0.07] via-transparent to-transparent px-4 pb-10 pt-12 sm:-mx-6 sm:px-6 md:pt-16">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="mx-auto max-w-3xl text-center"
      >
        <Badge variant="outline" className="mb-4 gap-1.5 border-primary/40 bg-primary/10 text-primary">
          <span className={cn("h-1.5 w-1.5 rounded-full bg-primary", isFetching && "soft-pulse")} aria-hidden />
          实时测试报告 · 5s 轮询同步主代理
        </Badge>
        <h1 className="text-balance text-3xl font-bold leading-tight tracking-tight sm:text-4xl md:text-5xl">
          CryoFlow 全面测试与{" "}
          <span className="bg-gradient-to-r from-teal-500 to-cyan-500 bg-clip-text text-transparent dark:from-teal-400 dark:to-cyan-400">
            HPC 调度设计
          </span>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
          36 个 cryo-EM job 类型（26 SPA + 10 Tomo）在真实工具链上的逐项验证报告，
          以及面向 Slurm 多 GPU 集群的调度架构设计、交互式模拟器与 SBATCH 生成器。
        </p>
      </motion.div>

      {/* environment badge cards */}
      <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {envEntries.map((e) => (
          <Card key={e.label} className="border-border/70 bg-card/80 p-4 backdrop-blur">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <e.icon className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{e.label}</p>
                <p className="mt-1 break-words font-mono text-xs leading-relaxed text-foreground">
                  {e.value ?? "等待主代理写入…"}
                </p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* KPI cards */}
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {KPI_DEFS.map((kpi, i) => (
          <motion.div
            key={kpi.key}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 + i * 0.05, duration: 0.35 }}
          >
            <Card className="h-full border-border/70 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-muted-foreground">{kpi.label}</p>
                <kpi.icon className={cn("h-4 w-4 shrink-0", kpi.tone)} aria-hidden />
              </div>
              <p className={cn("mt-2 font-mono text-2xl font-bold tabular-nums tracking-tight", kpi.tone)}>
                {kpi.key === "passed"
                  ? `${stats.passed}/${stats.total}`
                  : kpi.key === "totalSec"
                    ? fmtDuration(stats.totalSec)
                    : stats[kpi.key]}
              </p>
              <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{kpi.sub}</p>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* verdict banner */}
      <Card
        className={cn(
          "mt-4 overflow-hidden border p-0",
          running
            ? "border-teal-300/60 bg-teal-50/70 dark:border-teal-800/50 dark:bg-teal-950/30"
            : "border-emerald-300/60 bg-emerald-50/70 dark:border-emerald-800/50 dark:bg-emerald-950/30"
        )}
      >
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 p-4 sm:p-6">
          <span
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
              running ? "bg-teal-500/15 text-teal-600 dark:text-teal-400" : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
            )}
          >
            <Radar className={cn("h-5 w-5", running && "soft-pulse")} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base">
              {running ? "测试进行中 — 主代理正在逐个执行 job" : "全部测试已执行完毕"}
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {done}/{stats.total} 已执行 · {stats.passed} 通过 · {stats.failed} 失败 · {stats.pending} 等待 ·
              数据更新于 {updatedAtLabel}
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-1.5 p-4 pt-0 sm:p-6 sm:pt-0">
          <Progress value={progressPct} className="h-2" aria-label="测试进度" />
          <p className="text-right text-[11px] tabular-nums text-muted-foreground">{progressPct.toFixed(1)}%</p>
        </CardContent>
      </Card>
    </div>
  );
}
