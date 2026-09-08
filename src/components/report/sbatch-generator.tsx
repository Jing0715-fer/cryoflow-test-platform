"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { FileCode2, Copy, Wand2, ListChecks, Timer, FlaskConical, ArrowRight, CircleCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { SBATCH_JOB_TYPES } from "@/lib/hpc/sbatch";
import type { SbatchEstimate, SbatchJobType, SbatchResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

const ARRAY_TYPES = new Set<SbatchJobType>(["motioncorr-array", "class3d-screening", "ctffind-array"]);

const DEFAULTS: Record<SbatchJobType, { gpus: number; nodes: number; timeLimitMin: number; arraySlices: number }> = {
  "motioncorr-array": { gpus: 1, nodes: 1, timeLimitMin: 30, arraySlices: 10 },
  topaztrain: { gpus: 1, nodes: 1, timeLimitMin: 60, arraySlices: 1 },
  class2d: { gpus: 2, nodes: 1, timeLimitMin: 120, arraySlices: 1 },
  refine3d: { gpus: 4, nodes: 1, timeLimitMin: 180, arraySlices: 1 },
  "class3d-screening": { gpus: 4, nodes: 1, timeLimitMin: 120, arraySlices: 4 },
  "ctffind-array": { gpus: 0, nodes: 1, timeLimitMin: 20, arraySlices: 10 },
};

export function SbatchGenerator() {
  const { toast } = useToast();
  const [jobType, setJobType] = useState<SbatchJobType>("motioncorr-array");
  const [partition, setPartition] = useState("gpu");
  const [account, setAccount] = useState("cryoem_proj");
  const [opts, setOpts] = useState(DEFAULTS["motioncorr-array"]);
  const [result, setResult] = useState<SbatchResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const changeType = (t: SbatchJobType) => {
    setJobType(t);
    setOpts(DEFAULTS[t]);
    setResult(null);
  };

  const generate = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/hpc/sbatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobType, partition, account, ...opts }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "生成失败", description: data?.error ?? `HTTP ${res.status}`, variant: "destructive" });
        return;
      }
      setResult(data as SbatchResponse);
      toast({ title: "SBATCH 脚本已生成", description: `${data.script.split("\n").length} 行 · ${data.annotations.length} 条注解` });
    } catch {
      toast({ title: "网络错误", description: "无法连接 /api/hpc/sbatch", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const copy = () => {
    if (!result) return;
    navigator.clipboard
      .writeText(result.script)
      .then(() => toast({ title: "已复制到剪贴板", description: "SBATCH 脚本全文已复制" }))
      .catch(() => toast({ title: "复制失败", variant: "destructive" }));
  };

  const lines = useMemo(() => (result ? result.script.split("\n") : []), [result]);
  const annotated = useMemo(
    () => new Map((result?.annotations ?? []).map((a) => [a.line, a.note])),
    [result]
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        {/* config */}
        <Card className="border-border/70 h-fit">
          <CardHeader className="p-4 pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Wand2 className="h-4 w-4 text-primary" aria-hidden /> 生成配置
            </CardTitle>
            <CardDescription className="text-xs">选择 job 模板与集群参数，服务端渲染真实可用的 SBATCH</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 p-4 pt-1">
            <div>
              <Label className="text-xs">Job 类型</Label>
              <Select value={jobType} onValueChange={(v) => changeType(v as SbatchJobType)}>
                <SelectTrigger className="mt-1.5 h-11 w-full" aria-label="Job 类型">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SBATCH_JOB_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value} className="py-2.5">
                      <span className="font-medium">{t.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                {SBATCH_JOB_TYPES.find((t) => t.value === jobType)?.desc}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="partition" className="text-xs">分区</Label>
                <Input
                  id="partition"
                  className="mt-1.5 h-10 font-mono"
                  value={partition}
                  onChange={(e) => setPartition(e.target.value)}
                  aria-label="分区名"
                />
              </div>
              <div>
                <Label htmlFor="account" className="text-xs">Account</Label>
                <Input
                  id="account"
                  className="mt-1.5 h-10 font-mono"
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  aria-label="计费账户"
                />
              </div>
            </div>

            <SliderRow
              label="GPU 数（--gres）"
              value={opts.gpus}
              min={0}
              max={8}
              onChange={(v) => setOpts((o) => ({ ...o, gpus: v }))}
              unit="卡"
            />
            <SliderRow
              label="节点数（--nodes）"
              value={opts.nodes}
              min={1}
              max={4}
              onChange={(v) => setOpts((o) => ({ ...o, nodes: v }))}
              unit="节点"
            />
            <SliderRow
              label="时限（--time）"
              value={opts.timeLimitMin}
              min={10}
              max={480}
              step={10}
              onChange={(v) => setOpts((o) => ({ ...o, timeLimitMin: v }))}
              unit="min"
            />
            {ARRAY_TYPES.has(jobType) && (
              <SliderRow
                label="Array 分片数（--array）"
                value={opts.arraySlices}
                min={1}
                max={64}
                onChange={(v) => setOpts((o) => ({ ...o, arraySlices: v }))}
                unit="片"
              />
            )}

            <Button className="h-11 w-full gap-2" size="lg" onClick={generate} disabled={loading}>
              <FileCode2 className="h-4 w-4" aria-hidden />
              {loading ? "渲染模板中…" : "生成 SBATCH 脚本"}
            </Button>
          </CardContent>
        </Card>

        {/* output */}
        <Card className="overflow-hidden border-border/70">
          <CardHeader className="flex-row items-center justify-between space-y-0 p-4 pb-2">
            <div>
              <CardTitle className="text-sm">脚本预览</CardTitle>
              <CardDescription className="mt-1 font-mono text-[10px]">
                {result ? `${lines.length} 行 · 高亮行带注解（对应右侧图例）` : "点击「生成 SBATCH 脚本」渲染模板"}
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" className="h-10 gap-1.5 px-3" onClick={copy} disabled={!result}>
              <Copy className="h-3.5 w-3.5" aria-hidden /> 复制
            </Button>
          </CardHeader>
          <CardContent className="p-4 pt-2">
            {result ? (
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_240px]">
                <div className="nice-scroll max-h-[520px] overflow-auto rounded-lg border bg-zinc-950 p-0">
                  <pre className="p-3 font-mono text-[11px] leading-[1.7] text-zinc-200">
                    {lines.map((line, i) => {
                      const n = i + 1;
                      const note = annotated.get(n);
                      return (
                        <div
                          key={n}
                          className={cn(
                            "-mx-3 flex gap-3 px-3 py-px transition-colors",
                            note && "bg-teal-500/12 border-l-2 border-teal-400"
                          )}
                        >
                          <span className="w-8 shrink-0 select-none text-right text-zinc-600 tabular-nums">{n}</span>
                          <code className="min-w-0 whitespace-pre-wrap break-all">
                            {line === "" ? "\u00A0" : line}
                            {note && (
                              <span className="ml-2 rounded bg-teal-400/20 px-1 text-[9px] font-bold text-teal-300 align-middle">
                                ▲{n}
                              </span>
                            )}
                          </code>
                        </div>
                      );
                    })}
                  </pre>
                </div>

                {/* legend */}
                <div>
                  <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                    <ListChecks className="h-3.5 w-3.5 text-primary" aria-hidden /> 关键行注解
                  </p>
                  <div className="nice-scroll max-h-[520px] space-y-1.5 overflow-y-auto pr-1">
                    {result.annotations.map((a, i) => (
                      <div key={`${a.line}-${i}`} className="rounded-lg border border-primary/20 bg-primary/5 p-2.5">
                        <p className="font-mono text-[10px] font-bold text-primary">▲ 行 {a.line}</p>
                        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{a.note}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/60 p-8 text-center">
                <FileCode2 className="h-10 w-10 text-muted-foreground/40" aria-hidden />
                <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
                  模板包含 #SBATCH 指令、module load、conda activate、mpirun GPU 绑定、/lustre 日志路径与
                  --dependency 占位注释——可直接 sbatch 提交到真实集群。
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* estimate callout: real measured anchor → HPC time-limit projection (full width) */}
      {result?.estimate && (
        <EstimateCallout
          est={result.estimate}
          onApply={(v) => {
            setOpts((o) => ({ ...o, timeLimitMin: v }));
            toast({ title: "已应用建议时限", description: `--time 更新为 ${v} 分钟，重新生成脚本即可生效` });
          }}
        />
      )}
    </div>
  );
}

function fmtSec(sec: number): string {
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (m < 60) return `${m}m ${s}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function EstimateCallout({ est, onApply }: { est: SbatchEstimate; onApply: (min: number) => void }) {
  const hasMeasurement = est.measuredSec != null && est.estimatedMin != null;
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <Card className="border-primary/25 bg-primary/[0.04]">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Timer className="h-4 w-4 text-primary" aria-hidden /> 真实测量锚点 → HPC 时限预估
          </CardTitle>
          <CardDescription className="text-xs">
            基于 EMPIAR-10017 沙箱实测 wall-time 的 #SBATCH --time 建议（不再是拍脑袋默认值）
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-1">
          {hasMeasurement ? (
            <>
              <div className="flex flex-wrap items-stretch gap-2">
                {/* measured anchor */}
                <div className="min-w-40 flex-1 rounded-lg border border-teal-300/50 bg-teal-50/50 p-3 dark:border-teal-800/50 dark:bg-teal-950/25">
                  <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">
                    <FlaskConical className="h-3 w-3" aria-hidden /> 沙箱实测（CPU）
                  </p>
                  <p className="mt-1 font-mono text-lg font-bold tabular-nums text-teal-700 dark:text-teal-300">
                    {fmtSec(est.measuredSec as number)}
                  </p>
                  <p className="font-mono text-[10px] text-muted-foreground">{est.jobKey} · level={est.measuredLevel}</p>
                </div>
                <div className="flex items-center px-1 text-muted-foreground" aria-hidden>
                  <ArrowRight className="h-4 w-4" />
                </div>
                {/* speedup */}
                <div className="min-w-40 flex-1 rounded-lg border border-violet-300/50 bg-violet-50/50 p-3 dark:border-violet-800/50 dark:bg-violet-950/25">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">速度比模型</p>
                  <p className="mt-1 font-mono text-lg font-bold tabular-nums text-violet-700 dark:text-violet-300">÷ {est.speedup}×</p>
                  <p className="text-[10px] leading-snug text-muted-foreground">{est.speedupBasis}</p>
                </div>
                <div className="flex items-center px-1 text-muted-foreground" aria-hidden>
                  <ArrowRight className="h-4 w-4" />
                </div>
                {/* suggested limit */}
                <div className="min-w-40 flex-1 rounded-lg border border-primary/40 bg-primary/10 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">建议 --time</p>
                  <p className="mt-1 font-mono text-lg font-bold tabular-nums text-primary">{est.suggestedLimitMin} min</p>
                  <p className="text-[10px] leading-snug text-muted-foreground">≈ {est.estimatedMin}min ×1.5 安全系数</p>
                </div>
                {/* apply */}
                <div className="flex items-center">
                  <Button
                    size="sm"
                    className="h-11 gap-1.5"
                    onClick={() => est.suggestedLimitMin && onApply(est.suggestedLimitMin)}
                  >
                    <CircleCheck className="h-3.5 w-3.5" aria-hidden /> 应用建议时限
                  </Button>
                </div>
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">{est.note}</p>
            </>
          ) : (
            <div className="flex items-start gap-2 rounded-lg border border-amber-300/50 bg-amber-50/50 p-3 text-xs leading-relaxed text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/25 dark:text-amber-300">
              <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p>{est.note}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        <span className="font-mono text-xs tabular-nums text-primary">
          {value} {unit}
        </span>
      </div>
      <Slider
        className="mt-2"
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        aria-label={label}
      />
    </div>
  );
}
