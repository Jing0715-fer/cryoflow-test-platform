"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Play,
  Pause,
  RotateCcw,
  Zap,
  Server,
  Clock,
  Gauge,
  ListOrdered,
  Timer,
  Cpu,
  Gpu,
  Layers2,
  GitCompare,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { WORKFLOW_JOBS } from "@/lib/hpc/workflow";
import type { GpuModel, SimulateResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ClusterForm {
  partitions: number;
  nodes: number;
  gpusPerNode: number;
  gpuModel: GpuModel;
  defaultTimeMin: number;
}

const ROW_H = 22;
const LABEL_W = 148;

function depNames(deps: string[]): string {
  return deps.length === 0 ? "—" : deps.join(" & ");
}

export function SlurmSimulator() {
  const { toast } = useToast();
  const [cluster, setCluster] = useState<ClusterForm>({
    partitions: 1,
    nodes: 1,
    gpusPerNode: 4,
    gpuModel: "A100",
    defaultTimeMin: 60,
  });
  const [enabled, setEnabled] = useState<Set<string>>(() => new Set(WORKFLOW_JOBS.map((j) => j.key)));
  const [backfill, setBackfill] = useState(true);
  const [ab, setAb] = useState<{ on: SimulateResponse; off: SimulateResponse } | null>(null);
  const [abRunning, setAbRunning] = useState(false);
  const [result, setResult] = useState<SimulateResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [clock, setClock] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<1 | 8>(1);
  const [selected, setSelected] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const makespan = result?.stats.makespanMin ?? 0;

  // ---- playback clock -------------------------------------------------------
  useEffect(() => {
    if (!playing || !result) return;
    const id = setInterval(() => {
      setClock((c) => {
        const next = c + 0.2 * speed;
        if (next >= makespan) {
          setPlaying(false);
          return makespan;
        }
        return next;
      });
    }, 100);
    return () => clearInterval(id);
  }, [playing, speed, result, makespan]);

  // ---- auto scroll event log ------------------------------------------------
  const visibleEvents = useMemo(
    () => (result ? result.events.filter((e) => e.t <= clock + 1e-9) : []),
    [result, clock]
  );
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [visibleEvents.length]);

  // ---- queue cascade toggles -------------------------------------------------
  const dependentsOf = (key: string): string[] =>
    WORKFLOW_JOBS.filter((j) => j.deps.includes(key)).map((j) => j.key);

  const cascadeOff = (key: string) => {
    setEnabled((prev) => {
      const next = new Set(prev);
      const stack = [key];
      while (stack.length) {
        const k = stack.pop()!;
        if (!next.has(k)) continue;
        next.delete(k);
        stack.push(...dependentsOf(k));
      }
      return next;
    });
  };

  const cascadeOn = (key: string) => {
    setEnabled((prev) => {
      const next = new Set(prev);
      const stack = [key];
      while (stack.length) {
        const k = stack.pop()!;
        if (next.has(k)) continue;
        next.add(k);
        const job = WORKFLOW_JOBS.find((j) => j.key === k);
        if (job) stack.push(...job.deps);
      }
      return next;
    });
  };

  // ---- submit -----------------------------------------------------------------
  const submit = async () => {
    setSubmitting(true);
    try {
      const jobs = WORKFLOW_JOBS.filter((j) => enabled.has(j.key)).map(({ color: _c, ...rest }) => rest);
      const res = await fetch("/api/hpc/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cluster: { ...cluster, defaultTimeMin: Math.max(cluster.defaultTimeMin, 10) },
          jobs,
          backfill,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "模拟失败", description: data?.error ?? `HTTP ${res.status}`, variant: "destructive" });
        return;
      }
      setResult(data as SimulateResponse);
      setSelected(null);
      setClock(0);
      setPlaying(true);
      toast({
        title: "工作流已提交（模拟）",
        description: `${data.stats.totalJobs} 个 Slurm 作业进入调度器 · makespan ${data.stats.makespanMin} min · ${data.stats.backfilledJobs} 次 backfill 回填`,
      });
    } catch {
      toast({ title: "网络错误", description: "无法连接 /api/hpc/simulate", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  // ---- A/B comparison: same config, backfill OFF vs ON ------------------------
  const runAB = async () => {
    setAbRunning(true);
    try {
      const jobs = WORKFLOW_JOBS.filter((j) => enabled.has(j.key)).map(({ color: _c, ...rest }) => rest);
      const base = { cluster: { ...cluster, defaultTimeMin: Math.max(cluster.defaultTimeMin, 10) }, jobs };
      const [offRes, onRes] = await Promise.all([
        fetch("/api/hpc/simulate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...base, backfill: false }),
        }),
        fetch("/api/hpc/simulate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...base, backfill: true }),
        }),
      ]);
      const off = await offRes.json();
      const on = await onRes.json();
      if (!offRes.ok || !onRes.ok) {
        toast({ title: "A/B 对比失败", description: off?.error ?? on?.error ?? `HTTP ${offRes.status}`, variant: "destructive" });
        return;
      }
      setAb({ off, on });
      // keep the main visualization on the backfill-ON run
      setResult(on as SimulateResponse);
      setSelected(null);
      setClock(0);
      setPlaying(true);
      const dOn = on.stats;
      const dOff = off.stats;
      toast({
        title: "A/B 对比完成（双跑）",
        description: `makespan ${dOff.makespanMin}′ → ${dOn.makespanMin}′ · 排队等待 ${dOff.avgQueueWaitMin}′ → ${dOn.avgQueueWaitMin}′ · 回填 ${dOn.backfilledJobs} 次`,
      });
    } catch {
      toast({ title: "网络错误", description: "A/B 双跑请求失败", variant: "destructive" });
    } finally {
      setAbRunning(false);
    }
  };

  // ---- derived live stats ----------------------------------------------------
  const tasks = result?.tasks ?? [];
  const runningNow = tasks.filter((t) => t.startMin <= clock + 1e-9 && t.endMin > clock + 1e-9);
  const doneNow = tasks.filter((t) => t.endMin <= clock + 1e-9);
  const selectedTask = tasks.find((t) => t.jobId === selected) ?? null;

  const pct = (min: number) => (makespan > 0 ? Math.min(100, (min / makespan) * 100) : 0);

  // tick labels
  const ticks = useMemo(() => {
    if (makespan <= 0) return [] as number[];
    const step = Math.max(1, Math.round(makespan / 8));
    const out: number[] = [];
    for (let t = 0; t <= makespan; t += step) out.push(t);
    if (out[out.length - 1] < makespan) out.push(makespan);
    return out;
  }, [makespan]);

  // GPU utilization series up to clock
  const gpuSeries = useMemo(() => {
    if (!result) return [];
    const end = Math.min(Math.floor(clock), result.utilizationSeries.length - 1);
    return result.utilizationSeries.slice(0, Math.max(2, end + 1));
  }, [result, clock]);

  const gpuPath = useMemo(() => {
    if (gpuSeries.length < 2) return { area: "", line: "" };
    const W = 640;
    const H = 120;
    const maxY = Math.max(1, result?.stats.clusterGpuCapacity ?? 1);
    const pts = gpuSeries.map((p) => {
      const x = (p.t / Math.max(1, makespan)) * W;
      const y = H - (p.busy / maxY) * (H - 10) - 5;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const lastX = (gpuSeries[gpuSeries.length - 1].t / Math.max(1, makespan)) * W;
    return {
      line: `M${pts.join(" L")}`,
      area: `M0,${H} L${pts.join(" L")} L${lastX.toFixed(1)},${H} Z`,
    };
  }, [gpuSeries, makespan, result]);

  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
      {/* ================= left: config panel ================= */}
      <div className="min-w-0 space-y-4">
        <Card className="min-w-0 border-border/70">
          <CardHeader className="p-4 pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Server className="h-4 w-4 text-primary" aria-hidden /> 集群配置
            </CardTitle>
            <CardDescription className="text-xs">Slurm gpu 分区资源池（模拟 CPU 分区并发 = 分区数 × 10）</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 p-4 pt-1">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label2>GPU 型号</Label2>
                <Select
                  value={cluster.gpuModel}
                  onValueChange={(v) => setCluster((c) => ({ ...c, gpuModel: v as GpuModel }))}
                >
                  <SelectTrigger className="mt-1 h-10 w-full" aria-label="GPU 型号">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A100">NVIDIA A100 (1.0×)</SelectItem>
                    <SelectItem value="H100">NVIDIA H100 (0.6×)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label2>分区数</Label2>
                <Select
                  value={String(cluster.partitions)}
                  onValueChange={(v) => setCluster((c) => ({ ...c, partitions: Number(v) }))}
                >
                  <SelectTrigger className="mt-1 h-10 w-full" aria-label="分区数">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1（gpu+cpu 合一）</SelectItem>
                    <SelectItem value="2">2（gpu / cpu 分离）</SelectItem>
                    <SelectItem value="4">4（多队列）</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label2>计算节点数</Label2>
                <span className="font-mono text-xs tabular-nums text-primary">{cluster.nodes}</span>
              </div>
              <Slider
                className="mt-2"
                min={1}
                max={8}
                step={1}
                value={[cluster.nodes]}
                onValueChange={([v]) => setCluster((c) => ({ ...c, nodes: v }))}
                aria-label="计算节点数"
              />
            </div>
            {/* backfill strategy switch */}
            <div className="flex items-start justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <Layers2 className="h-3.5 w-3.5 text-primary" aria-hidden />
                  Backfill 碎片回填
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  EASY 算法 + 资源预约安全：队首阻塞时，更短的后排作业可插队填补空闲 GPU——但必须先于队首预约启动点完成（绝不推迟队首）。
                  试试 1 节点×4 GPU 下切换对比。
                </p>
              </div>
              <Switch
                checked={backfill}
                onCheckedChange={setBackfill}
                aria-label="启用 backfill 碎片回填调度"
                className="mt-0.5 shrink-0"
              />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label2>每节点 GPU 数</Label2>
                <span className="font-mono text-xs tabular-nums text-primary">{cluster.gpusPerNode}</span>
              </div>
              <Slider
                className="mt-2"
                min={1}
                max={8}
                step={1}
                value={[cluster.gpusPerNode]}
                onValueChange={([v]) => setCluster((c) => ({ ...c, gpusPerNode: v }))}
                aria-label="每节点 GPU 数"
              />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label2>默认时限（分钟）</Label2>
                <span className="font-mono text-xs tabular-nums text-primary">{cluster.defaultTimeMin}</span>
              </div>
              <Slider
                className="mt-2"
                min={10}
                max={480}
                step={10}
                value={[cluster.defaultTimeMin]}
                onValueChange={([v]) => setCluster((c) => ({ ...c, defaultTimeMin: v }))}
                aria-label="默认时限"
              />
            </div>
            <div className="rounded-lg border border-primary/25 bg-primary/5 p-3 text-[11px] leading-relaxed text-muted-foreground">
              集群 GPU 容量：
              <span className="font-mono font-semibold text-primary">
                {" "}
                {cluster.nodes * cluster.gpusPerNode} × {cluster.gpuModel}
              </span>
              {cluster.gpuModel === "H100" && "（H100 加速比 0.6×：作业时长按 A100×0.6 估算）"}
            </div>
            <Button
              className="h-11 w-full gap-2"
              size="lg"
              onClick={submit}
              disabled={submitting || abRunning || enabled.size === 0}
            >
              <Zap className="h-4 w-4" aria-hidden />
              {submitting ? "调度计算中…" : `Submit Workflow（${enabled.size} 作业）`}
            </Button>
            <Button
              variant="outline"
              className="h-11 w-full gap-2"
              size="lg"
              onClick={runAB}
              disabled={submitting || abRunning || enabled.size === 0}
            >
              <GitCompare className="h-4 w-4" aria-hidden />
              {abRunning ? "A/B 双跑中…" : "A/B 对比（FIFO vs Backfill）"}
            </Button>
          </CardContent>
        </Card>

        {/* queue */}
        <Card className="min-w-0 border-border/70">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <ListOrdered className="h-4 w-4 text-primary" aria-hidden /> 作业队列（依赖 DAG）
            </CardTitle>
            <CardDescription className="text-xs">
              EMPIAR-10017 全流程 · hashtuple 依赖 → sbatch --dependency=afterok
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <div className="nice-scroll max-h-80 space-y-1.5 overflow-y-auto pr-1">
              {WORKFLOW_JOBS.map((job) => {
                const on = enabled.has(job.key);
                return (
                  <div
                    key={job.key}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg border p-2.5 transition-opacity",
                      on ? "border-border/70 bg-card" : "border-dashed border-border/50 bg-muted/30 opacity-60"
                    )}
                  >
                    <Switch
                      checked={on}
                      onCheckedChange={(v) => (v ? cascadeOn(job.key) : cascadeOff(job.key))}
                      aria-label={`启用 ${job.name}`}
                      className="shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-xs font-semibold">{job.name}</span>
                        <span
                          className={cn(
                            "rounded border px-1 py-px font-mono text-[9px]",
                            job.gpus === 0
                              ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              : "border-violet-400/40 bg-violet-500/10 text-violet-600 dark:text-violet-400"
                          )}
                        >
                          {job.gpus === 0 ? "CPU" : `${job.gpus} GPU`}
                        </span>
                        {job.arrayCount && (
                          <span className="rounded border border-border bg-muted px-1 py-px font-mono text-[9px]">
                            array×{job.arrayCount}
                          </span>
                        )}
                        <span className="ml-auto font-mono text-[10px] tabular-nums text-muted-foreground">
                          {job.durationMin}min
                        </span>
                      </div>
                      <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground/80">
                        deps: {depNames(job.deps)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
              提示：关闭某作业会级联关闭其下游；重新开启会级联补齐上游依赖。
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ================= right: results ================= */}
      <div className="min-w-0 space-y-4">
        {!result ? (
          <Card className="flex min-h-[420px] flex-col items-center justify-center gap-3 border-dashed border-border/70 p-8 text-center">
            <Gauge className="h-10 w-10 text-muted-foreground/40" aria-hidden />
            <p className="text-sm font-medium text-muted-foreground">尚未提交工作流</p>
            <p className="max-w-sm text-xs leading-relaxed text-muted-foreground/80">
              调整左侧集群配置与作业队列后点击 <span className="font-semibold text-primary">Submit Workflow</span>，
              事件驱动调度器将在服务端计算时间轴（优先级 FIFO + 依赖 DAG + GPU 资源池），并在此渲染 Gantt 与 GPU 占用率动画。
            </p>
          </Card>
        ) : (
          <>
            {/* A/B comparison snapshot */}
            {ab && <AbCompareCard off={ab.off} on={ab.on} />}

            {/* stats */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
              <StatCell icon={Timer} label="makespan" value={`${result.stats.makespanMin} min`} tone="text-primary" />
              <StatCell
                icon={Gauge}
                label="GPU 利用率"
                value={`${(result.stats.gpuUtilization * 100).toFixed(1)}%`}
                tone="text-teal-600 dark:text-teal-400"
              />
              <StatCell
                icon={Clock}
                label="平均排队等待"
                value={`${result.stats.avgQueueWaitMin} min`}
                tone="text-cyan-600 dark:text-cyan-400"
              />
              <StatCell icon={ListOrdered} label="Slurm 作业数" value={String(result.stats.totalJobs)} tone="text-violet-600 dark:text-violet-400" />
              <StatCell icon={Layers2} label="backfill 回填" value={`${result.stats.backfilledJobs} 次`} tone="text-cyan-600 dark:text-cyan-400" />
              <StatCell icon={Gpu} label="GPU·分钟" value={result.stats.gpuMinutes.toFixed(0)} tone="text-amber-600 dark:text-amber-400" />
              <StatCell
                icon={Play}
                label="模拟时钟"
                value={`T+${clock.toFixed(0)} / ${makespan} min`}
                sub={`${runningNow.length} 运行 · ${doneNow.length} 完成`}
                tone="text-emerald-600 dark:text-emerald-400"
                pulse
              />
            </div>

            {/* gantt */}
            <Card className="overflow-hidden border-border/70 p-4 sm:p-5">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <CardTitle className="text-sm">Slurm 作业 Gantt 时间轴</CardTitle>
                <div className="ml-auto flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-11 w-11"
                    onClick={() => setPlaying((p) => !p)}
                    aria-label={playing ? "暂停" : "播放"}
                    disabled={clock >= makespan}
                  >
                    {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-11 w-11"
                    onClick={() => {
                      setClock(0);
                      setPlaying(true);
                    }}
                    aria-label="重播"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                  <div className="flex overflow-hidden rounded-lg border" role="group" aria-label="播放速度">
                    {([1, 8] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSpeed(s)}
                        className={cn(
                          "flex h-11 min-w-12 items-center justify-center px-2 font-mono text-xs font-semibold transition-colors",
                          speed === s
                            ? "bg-primary text-primary-foreground"
                            : "bg-background text-muted-foreground hover:text-foreground"
                        )}
                        aria-pressed={speed === s}
                      >
                        {s}×
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="nice-scroll max-h-[440px] overflow-auto rounded-lg border border-border/60 bg-muted/20">
                <div className="min-w-[600px]">
                  {/* time axis */}
                  <div className="flex border-b border-border/60 bg-background/80">
                    <div className="shrink-0 border-r border-border/60 px-2 py-1 font-mono text-[9px] text-muted-foreground" style={{ width: LABEL_W }}>
                      job / task
                    </div>
                    <div className="relative h-6 flex-1">
                      {ticks.map((t) => (
                        <span
                          key={t}
                          className="absolute top-1 -translate-x-1/2 font-mono text-[9px] tabular-nums text-muted-foreground"
                          style={{ left: `${pct(t)}%` }}
                        >
                          {t}′
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* rows */}
                  <div className="flex">
                    {/* labels */}
                    <div className="shrink-0 border-r border-border/60" style={{ width: LABEL_W }}>
                      {tasks.map((t) => (
                        <button
                          key={t.jobId}
                          type="button"
                          onClick={() => setSelected(t.jobId)}
                          className={cn(
                            "flex w-full items-center gap-1.5 px-2 text-left transition-colors hover:bg-accent/50",
                            selected === t.jobId && "bg-accent"
                          )}
                          style={{ height: ROW_H }}
                          title={`${t.label} · ${t.gpus === 0 ? "CPU" : t.gpus + " GPU"}`}
                        >
                          <span
                            className={cn(
                              "font-mono text-[9px] tabular-nums",
                              t.endMin <= clock + 1e-9 ? "text-foreground" : "text-muted-foreground"
                            )}
                          >
                            {t.jobId}
                          </span>
                          <span
                            className={cn(
                              "truncate font-mono text-[10px]",
                              t.startMin <= clock + 1e-9 ? "text-foreground" : "text-muted-foreground/60"
                            )}
                          >
                            {t.label}
                          </span>
                        </button>
                      ))}
                    </div>

                    {/* bar area + playhead */}
                    <div className="relative flex-1">
                      {tasks.map((t) => {
                        const started = t.startMin <= clock + 1e-9;
                        const finished = t.endMin <= clock + 1e-9;
                        const progress = finished ? 1 : started ? (clock - t.startMin) / (t.endMin - t.startMin) : 0;
                        const color = WORKFLOW_JOBS.find((j) => j.key === t.jobKey)?.color ?? "bg-slate-500/80";
                        return (
                          <div
                            key={t.jobId}
                            className="relative border-b border-border/30"
                            style={{ height: ROW_H }}
                          >
                            <div
                              className={cn(
                                "absolute top-[3px] h-4 rounded border transition-opacity",
                                color,
                                !started ? "opacity-15" : "opacity-90",
                                selected === t.jobId && "ring-2 ring-primary ring-offset-1"
                              )}
                              style={{
                                left: `${pct(t.startMin)}%`,
                                width: `${Math.max(0.8, pct(t.endMin) - pct(t.startMin))}%`,
                              }}
                              title={`${t.label} [${t.jobId}]\n${t.gpus === 0 ? "CPU" : t.gpuIds.join(" ")}\n${t.startMin}′ → ${t.endMin}′ · ${t.waitReason}`}
                            >
                              <div
                                className="h-full rounded-[3px] bg-white/35"
                                style={{ width: `${(1 - progress) * 100}%`, marginLeft: "auto" }}
                              />
                            </div>
                          </div>
                        );
                      })}
                      {/* playhead */}
                      <div
                        className="pointer-events-none absolute top-0 bottom-0 w-px bg-primary"
                        style={{ left: `${pct(clock)}%` }}
                      >
                        <span className="absolute -top-0.5 -left-[3px] h-1.5 w-1.5 rounded-full bg-primary" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* selected task detail */}
              {selectedTask && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-3 rounded-lg border border-primary/25 bg-primary/5 p-3"
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-mono font-semibold text-primary">{selectedTask.jobId}</span>
                    <span className="font-semibold">{selectedTask.label}</span>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {selectedTask.gpus === 0 ? "CPU" : selectedTask.gpuIds.join(" ")}
                    </Badge>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {selectedTask.startMin}′ → {selectedTask.endMin}′（等待 {selectedTask.waitMin}′）
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">排队原因：{selectedTask.waitReason}</p>
                </motion.div>
              )}
            </Card>

            {/* GPU utilization + event log */}
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="border-border/70">
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Cpu className="h-4 w-4 text-primary" aria-hidden /> GPU 池占用率
                  </CardTitle>
                  <CardDescription className="text-xs">
                    busy GPU 数 / 容量 {result.stats.clusterGpuCapacity}（随播放推进）
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-1">
                  <div className="overflow-hidden rounded-lg border border-border/60 bg-background">
                    <svg viewBox="0 0 640 120" className="h-32 w-full" role="img" aria-label="GPU 占用率曲线">
                      <defs>
                        <linearGradient id="gpuArea" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.45" />
                          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.05" />
                        </linearGradient>
                      </defs>
                      {[0.25, 0.5, 0.75, 1].map((f) => {
                        const y = 120 - f * 110 - 5;
                        return (
                          <line
                            key={f}
                            x1="0"
                            y1={y}
                            x2="640"
                            y2={y}
                            stroke="currentColor"
                            className="text-border"
                            strokeWidth="1"
                            strokeDasharray="3 5"
                          />
                        );
                      })}
                      <line
                        x1="0"
                        y1="5"
                        x2="640"
                        y2="5"
                        stroke="currentColor"
                        className="text-muted-foreground/50"
                        strokeWidth="1"
                      />
                      {gpuPath.area && <path d={gpuPath.area} fill="url(#gpuArea)" />}
                      {gpuPath.line && (
                        <path
                          d={gpuPath.line}
                          fill="none"
                          stroke="var(--primary)"
                          strokeWidth="2"
                          vectorEffect="non-scaling-stroke"
                        />
                      )}
                    </svg>
                  </div>
                  <div className="mt-1.5 flex justify-between font-mono text-[9px] tabular-nums text-muted-foreground">
                    <span>0′</span>
                    <span>{Math.round(makespan / 2)}′</span>
                    <span>{makespan}′</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/70">
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-primary" aria-hidden /> 调度事件流（squeue 视角）
                  </CardTitle>
                  <CardDescription className="text-xs">
                    已发生 {visibleEvents.length}/{result.events.length} 事件
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-1">
                  <div ref={logRef} className="nice-scroll max-h-44 space-y-1 overflow-y-auto pr-1">
                    {visibleEvents.map((e, i) => (
                      <div key={`${e.t}-${e.jobId}-${i}`} className="flex items-baseline gap-2 font-mono text-[10px]">
                        <span className="w-10 shrink-0 tabular-nums text-muted-foreground">{e.t.toFixed(0)}′</span>
                        <span
                          className={cn(
                            "shrink-0 rounded px-1 text-[9px] font-bold",
                            e.type === "COMPLETED"
                              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                              : e.type === "BACKFILL"
                                ? "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400"
                                : e.type === "RESERVED"
                                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-500"
                                  : e.type === "RUNNING" || e.type === "ALLOCATED"
                                    ? "bg-teal-500/15 text-teal-600 dark:text-teal-400"
                                    : e.type === "DEPS-CLEARED"
                                      ? "bg-violet-500/15 text-violet-600 dark:text-violet-400"
                                      : "bg-muted text-muted-foreground"
                          )}
                        >
                          {e.type}
                        </span>
                        <span className="min-w-0 text-foreground/80">
                          <span className="font-semibold text-foreground">{e.jobId}</span> {e.detail}
                        </span>
                      </div>
                    ))}
                    {visibleEvents.length === 0 && (
                      <p className="py-4 text-center text-[11px] text-muted-foreground">等待播放开始…</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* semantics card */}
            <Card className="border-border/70">
              <CardHeader className="p-4 pb-2 sm:p-5 sm:pb-2">
                <CardTitle className="text-sm">模拟器语义 ↔ 真实 Slurm 映射</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 p-4 pt-1 sm:grid-cols-2 sm:p-5 sm:pt-1">
                <ul className="space-y-1.5 text-[11px] leading-relaxed text-muted-foreground">
                  <li>
                    <code className="font-mono text-foreground">--dependency=afterok:ID₁:ID₂</code> → 依赖 DAG 边；array 作业全部子任务完成后才放行下游
                  </li>
                  <li>
                    <code className="font-mono text-foreground">--array=0-9%4</code> → 每片独立调度（%N 为并发上限，模拟器按 GPU 池动态并发）
                  </li>
                  <li>
                    <code className="font-mono text-foreground">--gres=gpu:N</code> → GPU 池分配；跨节点作业以 mpirun 跨节点散射
                  </li>
                  <li>
                    <code className="font-mono text-foreground">squeue</code> PENDING(Reason=Dependencies/Resources) / RUNNING → 等待原因字段
                  </li>
                  <li>
                    <code className="font-mono text-foreground">sched/backfill</code> → EASY 回填：队首 RESERVED 预约后，短作业 BACKFILL 插队且先于预约点完成
                  </li>
                </ul>
                <ul className="space-y-1.5 text-[11px] leading-relaxed text-muted-foreground">
                  {result.notes.map((n, i) => (
                    <li key={i} className="flex gap-1.5">
                      <span className="text-primary">•</span>
                      <span>{n}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

function Label2({ children }: { children: React.ReactNode }) {
  return <span className="text-xs font-medium text-muted-foreground">{children}</span>;
}

function StatCell({
  icon: Icon,
  label,
  value,
  sub,
  tone,
  pulse,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
  sub?: string;
  tone: string;
  pulse?: boolean;
}) {
  return (
    <Card className="border-border/70 p-3">
      <div className="flex items-center justify-between gap-1.5">
        <p className="truncate text-[10px] font-medium text-muted-foreground">{label}</p>
        <Icon className={cn("h-3.5 w-3.5 shrink-0", tone, pulse && "soft-pulse")} aria-hidden />
      </div>
      <p className={cn("mt-1 truncate font-mono text-sm font-bold tabular-nums", tone)}>{value}</p>
      {sub && <p className="mt-0.5 truncate text-[10px] tabular-nums text-muted-foreground">{sub}</p>}
    </Card>
  );
}

function AbCompareCard({ off, on }: { off: SimulateResponse; on: SimulateResponse }) {
  const rows: { label: string; off: number; on: number; fmt: (v: number) => string; better: "lower" | "higher" }[] = [
    {
      label: "makespan",
      off: off.stats.makespanMin,
      on: on.stats.makespanMin,
      fmt: (v) => `${v} min`,
      better: "lower",
    },
    {
      label: "平均排队等待",
      off: off.stats.avgQueueWaitMin,
      on: on.stats.avgQueueWaitMin,
      fmt: (v) => `${v} min`,
      better: "lower",
    },
    {
      label: "GPU 利用率",
      off: off.stats.gpuUtilization * 100,
      on: on.stats.gpuUtilization * 100,
      fmt: (v) => `${v.toFixed(1)}%`,
      better: "higher",
    },
    {
      label: "backfill 回填次数",
      off: off.stats.backfilledJobs,
      on: on.stats.backfilledJobs,
      fmt: (v) => `${v} 次`,
      better: "higher",
    },
  ];
  const makespanTie = off.stats.makespanMin === on.stats.makespanMin;
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <Card className="border-primary/25 bg-primary/[0.04]">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
            <GitCompare className="h-4 w-4 text-primary" aria-hidden /> A/B 对比 · 严格 FIFO vs EASY Backfill
            <Badge variant="outline" className="font-mono text-[10px] font-normal text-muted-foreground">
              同配置双跑快照
            </Badge>
          </CardTitle>
          <CardDescription className="text-xs">
            {makespanTie
              ? "makespan 持平（关键路径不受碎片影响）——收益体现在排队等待与碎片利用率，GPU 作业越密集差异越大。"
              : "backfill 收紧了时间轴：更短的 makespan 来自对 GPU 空闲碎片的填充。"}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-1">
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th scope="col" className="p-2 text-left font-medium text-muted-foreground">指标</th>
                  <th scope="col" className="p-2 text-right font-medium text-muted-foreground">严格 FIFO</th>
                  <th scope="col" className="p-2 text-right font-medium text-muted-foreground">EASY Backfill</th>
                  <th scope="col" className="p-2 text-right font-medium text-muted-foreground">Δ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const onWins =
                    r.better === "lower" ? r.on < r.off : r.on > r.off;
                  const delta = r.on - r.off;
                  const deltaTxt =
                    r.label === "backfill 回填次数"
                      ? delta === 0
                        ? "—"
                        : `+${delta}`
                      : `${delta > 0 ? "+" : ""}${r.label === "GPU 利用率" ? delta.toFixed(1) : delta.toFixed(1)}${r.label.includes("等待") || r.label === "makespan" ? " min" : "%"}`;
                  return (
                    <tr key={r.label} className="border-b last:border-0">
                      <td className="p-2 font-medium">{r.label}</td>
                      <td className="p-2 text-right font-mono tabular-nums text-muted-foreground">{r.fmt(r.off)}</td>
                      <td
                        className={cn(
                          "p-2 text-right font-mono font-semibold tabular-nums",
                          onWins ? "text-primary" : "text-foreground"
                        )}
                      >
                        {r.fmt(r.on)}
                      </td>
                      <td
                        className={cn(
                          "p-2 text-right font-mono tabular-nums",
                          onWins ? "text-primary font-semibold" : "text-muted-foreground"
                        )}
                      >
                        {onWins ? deltaTxt : delta === 0 ? "—" : deltaTxt}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            主可视化（Gantt/事件流）展示 Backfill-ON 侧；调度语义差异见下方映射卡与事件流中的 RESERVED / BACKFILL 事件。
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
}
