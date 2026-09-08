"use client";

import { motion } from "framer-motion";
import { ServerCog, CircleCheck, CircleX, FlaskConical, FolderKanban } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useEngineStatus } from "@/hooks/use-engine-status";
import { cn } from "@/lib/utils";

/** Live heartbeat strip for the real cryoflow engine running at :3001. */
export function EngineStatusStrip() {
  const { status, query } = useEngineStatus(5000);
  const online = status.online;
  const relion = status.relion;
  const projects = status.projects?.items ?? [];
  const jobs = status.jobs;

  const probedLabel = status.probedAt
    ? new Date(status.probedAt).toLocaleTimeString("zh-CN", { hour12: false })
    : "—";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
    >
      <Card
        className={cn(
          "overflow-hidden border p-0 transition-colors",
          online
            ? "border-teal-300/50 bg-teal-50/40 dark:border-teal-800/50 dark:bg-teal-950/20"
            : "border-rose-300/60 bg-rose-50/50 dark:border-rose-800/50 dark:bg-rose-950/20"
        )}
      >
        <CardContent className="flex flex-wrap items-center gap-x-5 gap-y-3 p-4">
          {/* liveness */}
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ServerCog className="h-4.5 w-4.5" aria-hidden />
            </span>
            <div>
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                引擎实时状态
                <span
                  className={cn(
                    "inline-flex h-2 w-2 rounded-full",
                    online ? "bg-emerald-500 soft-pulse" : "bg-rose-500"
                  )}
                  aria-hidden
                />
                <span className="sr-only">{online ? "在线" : "离线"}</span>
              </p>
              <p className="text-[11px] text-muted-foreground">
                cryoflow · :3001 · 探测于 {probedLabel}
                {query.isFetching ? " · 同步中…" : ""}
              </p>
            </div>
          </div>

          {/* RELION detection */}
          {relion ? (
            <div className="hidden items-center gap-2 border-l border-border/60 pl-5 sm:flex">
              {relion.found ? (
                <FlaskConical className="h-4 w-4 text-teal-600 dark:text-teal-400" aria-hidden />
              ) : (
                <CircleX className="h-4 w-4 text-rose-500" aria-hidden />
              )}
              <div>
                <p className="font-mono text-xs font-semibold">
                  RELION {relion.version ?? "?"}
                  <span className="ml-1.5 font-normal text-muted-foreground">({relion.execution})</span>
                </p>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p className="max-w-56 cursor-help truncate text-[11px] text-muted-foreground" tabIndex={0}>
                        {relion.path ?? "—"}
                      </p>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-sm">
                      <p className="break-all font-mono text-xs">{relion.path}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
          ) : null}

          {/* engine-side job counters */}
          {jobs ? (
            <div className="flex flex-wrap items-center gap-1.5 border-l border-border/60 pl-5 sm:pl-5">
              <Badge variant="secondary" className="gap-1 font-mono">
                <FolderKanban className="h-3 w-3" aria-hidden />
                {status.projects?.count ?? 0} 项目
              </Badge>
              <Badge variant="outline" className="font-mono tabular-nums">
                {jobs.total} job
              </Badge>
              {jobs.running > 0 && (
                <Badge className="gap-1 bg-teal-500/15 font-mono tabular-nums text-teal-700 hover:bg-teal-500/15 dark:text-teal-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-teal-500 soft-pulse" aria-hidden />
                  {jobs.running} 运行
                </Badge>
              )}
              {jobs.completed > 0 && (
                <Badge className="gap-1 bg-emerald-500/15 font-mono tabular-nums text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300">
                  <CircleCheck className="h-3 w-3" aria-hidden />
                  {jobs.completed} 完成
                </Badge>
              )}
              {jobs.failed > 0 && (
                <Badge variant="destructive" className="font-mono tabular-nums">
                  {jobs.failed} 失败
                </Badge>
              )}
            </div>
          ) : null}

          {/* project names (wrap as muted chips) */}
          {projects.length > 0 && (
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
              {projects.slice(0, 4).map((p) => (
                <span
                  key={p.id}
                  className="max-w-56 truncate rounded-md bg-card px-2 py-0.5 font-mono text-[11px] text-muted-foreground"
                  title={`${p.name} (${p.mode}) · ${p.stats.total} job`}
                >
                  {p.name}
                </span>
              ))}
            </div>
          )}

          {!online && (
            <p className="text-xs text-rose-600 dark:text-rose-400">
              引擎探测失败：{status.error ?? "未知错误"}（报告数据不受影响，来自落盘 JSON）
            </p>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
