"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, FileText, ScrollText, TerminalSquare, Filter, Inbox } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { CategoryBadge, LevelBadge, StatusBadge } from "./badges";
import { CATEGORY_ORDER, type MergedJob } from "@/lib/job-catalog";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

function fmtSec(sec?: number): string {
  if (sec == null) return "—";
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}m${s ? ` ${s}s` : ""}`;
}

export function TestMatrix({ jobs }: { jobs: MergedJob[] }) {
  const [activeCat, setActiveCat] = useState<string>("全部");
  const [onlyFailed, setOnlyFailed] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const categories = useMemo(() => {
    const present = new Set(jobs.map((j) => j.category));
    return ["全部", ...CATEGORY_ORDER.filter((c) => present.has(c))];
  }, [jobs]);

  const filtered = useMemo(() => {
    let out = jobs;
    if (activeCat !== "全部") out = out.filter((j) => j.category === activeCat);
    if (onlyFailed) out = out.filter((j) => j.status === "fail");
    return out;
  }, [jobs, activeCat, onlyFailed]);

  const groups = useMemo(() => {
    const map = new Map<string, MergedJob[]>();
    for (const job of filtered) {
      if (!map.has(job.category)) map.set(job.category, []);
      map.get(job.category)!.push(job);
    }
    return [...map.entries()].sort(
      (a, b) => CATEGORY_ORDER.indexOf(a[0] as never) - CATEGORY_ORDER.indexOf(b[0] as never)
    );
  }, [filtered]);

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const copyCommand = (job: MergedJob) => {
    if (!job.command) return;
    navigator.clipboard
      .writeText(job.command)
      .then(() => toast({ title: "命令已复制", description: `${job.name} 的执行命令已复制到剪贴板` }))
      .catch(() => toast({ title: "复制失败", variant: "destructive" }));
  };

  return (
    <div className="space-y-4">
      {/* filter bar */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <Filter className="h-3.5 w-3.5" aria-hidden /> 类别
          </span>
          <div className="nice-scroll flex max-w-full flex-wrap gap-1.5 overflow-x-auto pb-0.5">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCat(cat)}
                className={cn(
                  "flex min-h-11 shrink-0 items-center rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
                  activeCat === cat
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
                )}
                aria-pressed={activeCat === cat}
              >
                {cat}
                <span className="ml-1.5 tabular-nums opacity-70">
                  {cat === "全部" ? jobs.length : jobs.filter((j) => j.category === cat).length}
                </span>
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Switch id="only-failed" checked={onlyFailed} onCheckedChange={setOnlyFailed} />
            <Label htmlFor="only-failed" className="cursor-pointer text-xs font-medium text-muted-foreground">
              只看失败
            </Label>
          </div>
        </div>
      </Card>

      {/* matrix */}
      <Card className="overflow-hidden p-0">
        <div className="nice-scroll max-h-[72vh] overflow-y-auto">
          {groups.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-10 text-muted-foreground">
              <Inbox className="h-8 w-8" aria-hidden />
              <p className="text-sm">该筛选下暂无 job</p>
            </div>
          ) : (
            groups.map(([cat, groupJobs]) => (
              <div key={cat}>
                <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background/95 px-4 py-2 backdrop-blur">
                  <span className="flex items-center gap-2">
                    <CategoryBadge category={cat} />
                    <span className="text-xs font-semibold text-foreground">{cat}</span>
                  </span>
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {groupJobs.filter((j) => j.status === "pass").length}/{groupJobs.length} 通过
                  </span>
                </div>

                {groupJobs.map((job) => {
                  const isOpen = expanded.has(job.key);
                  const hasDetail = Boolean(job.command || (job.logs && job.logs.length) || (job.artifacts && job.artifacts.length) || job.notes);
                  return (
                    <div key={job.key} className="border-b border-border/60 last:border-b-0">
                      <button
                        type="button"
                        onClick={() => hasDetail && toggleExpand(job.key)}
                        aria-expanded={isOpen}
                        className={cn(
                          "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors",
                          hasDetail ? "cursor-pointer hover:bg-accent/60" : "cursor-default",
                          job.status === "pending" && "opacity-70"
                        )}
                      >
                        <ChevronDown
                          className={cn(
                            "mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                            isOpen && "rotate-180",
                            !hasDetail && "invisible"
                          )}
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <StatusBadge status={job.status} compact />
                            <LevelBadge level={job.level} />
                            <span className="text-sm font-medium text-foreground">{job.name}</span>
                            <span className="font-mono text-[10px] text-muted-foreground/70">{job.key}</span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                            <span className="tabular-nums">耗时 {fmtSec(job.durationSec)}</span>
                            <span className="tabular-nums">
                              产物 {job.artifacts?.length ?? 0}
                            </span>
                            {job.result && (
                              <span className="max-w-[46ch] truncate sm:max-w-[72ch]" title={job.result}>
                                {job.result}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>

                      <AnimatePresence initial={false}>
                        {isOpen && hasDetail && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2, ease: "easeOut" }}
                            className="overflow-hidden"
                          >
                            <div className="grid gap-4 bg-muted/40 px-4 pb-4 pt-1 md:grid-cols-3 md:px-6">
                              <div>
                                <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                                  <TerminalSquare className="h-3.5 w-3.5" aria-hidden /> 执行命令
                                </p>
                                <pre className="nice-scroll max-h-48 overflow-auto rounded-lg border bg-background p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all">
                                  {job.command ?? "（无命令记录）"}
                                </pre>
                                {job.command && (
                                  <button
                                    type="button"
                                    onClick={() => copyCommand(job)}
                                    className="mt-1.5 text-[11px] font-medium text-primary hover:underline"
                                  >
                                    复制命令
                                  </button>
                                )}
                              </div>
                              <div>
                                <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                                  <FileText className="h-3.5 w-3.5" aria-hidden /> 产物文件（{job.artifacts?.length ?? 0}）
                                </p>
                                {job.artifacts?.length ? (
                                  <ul className="nice-scroll max-h-48 space-y-1 overflow-y-auto">
                                    {job.artifacts.map((a) => (
                                      <li
                                        key={a}
                                        className="truncate rounded-md border bg-background px-2 py-1 font-mono text-[11px]"
                                        title={a}
                                      >
                                        {a}
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="text-[11px] text-muted-foreground">暂无产物</p>
                                )}
                                {job.notes && (
                                  <p className="mt-2 rounded-md border border-primary/20 bg-primary/5 px-2 py-1.5 text-[11px] leading-relaxed text-foreground/80">
                                    备注：{job.notes}
                                  </p>
                                )}
                              </div>
                              <div>
                                <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                                  <ScrollText className="h-3.5 w-3.5" aria-hidden /> 日志尾部
                                </p>
                                {job.logs?.length ? (
                                  <pre className="nice-scroll max-h-48 overflow-auto rounded-lg border bg-zinc-950 p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all text-zinc-200">
                                    {job.logs.join("\n")}
                                  </pre>
                                ) : (
                                  <p className="text-[11px] text-muted-foreground">暂无日志（未执行或日志未落盘）</p>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
