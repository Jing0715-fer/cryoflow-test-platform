"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  FlaskConical,
  Brain,
  Image as ImageIcon,
  Cpu,
  TriangleAlert,
  CheckCircle2,
  CircleDashed,
  FileCog,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { StatusBadge } from "./badges";
import type { MergedJob } from "@/lib/job-catalog";
import type { TestJob } from "@/lib/types";
import { cn } from "@/lib/utils";

function ChainNode({
  icon: Icon,
  title,
  sub,
  tone,
}: {
  icon: typeof FlaskConical;
  title: string;
  sub: string;
  tone: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl border p-3 text-center", tone)}>
      <Icon className="h-5 w-5" aria-hidden />
      <p className="text-xs font-semibold leading-tight">{title}</p>
      <p className="text-[10px] leading-snug text-muted-foreground">{sub}</p>
    </div>
  );
}

function extractModuleError(job?: TestJob | MergedJob): string | null {
  if (!job) return null;
  const haystack = [job.result ?? "", job.notes ?? "", ...(job.logs ?? [])].join("\n");
  const m = haystack.match(/ModuleNotFoundError:\s*No module named\s+'([^']+)'/i);
  if (m) return m[1];
  const m2 = haystack.match(/No module named\s+'([^']+)'/i);
  return m2 ? m2[1] : null;
}

function TopazResultCard({ job }: { job?: MergedJob }) {
  const missing = extractModuleError(job);
  const status = job?.status ?? "pending";
  return (
    <Card className="h-full min-w-0 border-border/70">
      <CardHeader className="min-w-0 p-4 pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-sm">{job?.name ?? "Topaz Train + Picking"}</CardTitle>
          <StatusBadge status={status} compact />
        </div>
        <CardDescription className="font-mono text-[10px]">{job?.key ?? "topaztrain"}</CardDescription>
      </CardHeader>
      <CardContent className="min-w-0 space-y-2 p-4 pt-2 text-xs leading-relaxed">
        {status === "pass" && (
          <p className="flex items-start gap-1.5 text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>{job?.result || "测试通过"}</span>
          </p>
        )}
        {status === "fail" && (
          <p className="flex items-start gap-1.5 text-rose-700 dark:text-rose-400">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>{job?.result || "测试失败（详见日志）"}</span>
          </p>
        )}
        {status === "pending" && (
          <p className="flex items-start gap-1.5 text-muted-foreground">
            <CircleDashed className="mt-0.5 h-3.5 w-3.5 shrink-0 soft-pulse" aria-hidden />
            <span>主代理尚未执行到该 job——本卡片将随 5s 轮询自动填充真实结果。</span>
          </p>
        )}
        {job?.command && (
          <pre className="nice-scroll max-h-24 overflow-auto rounded-lg border bg-muted/50 p-2 font-mono text-[10px] leading-relaxed whitespace-pre-wrap break-all">
            {job.command}
          </pre>
        )}
        {job?.logs?.length ? (
          <pre className="nice-scroll max-h-32 overflow-auto rounded-lg border bg-zinc-950 p-2 font-mono text-[10px] leading-relaxed whitespace-pre-wrap break-all text-zinc-200">
            {job.logs.join("\n")}
          </pre>
        ) : null}
        {missing && (
          <div className="rounded-lg border border-amber-300/60 bg-amber-50 p-2.5 text-[11px] leading-relaxed text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-300">
            <p className="font-semibold">ModuleNotFoundError 根因提取</p>
            <p className="mt-1 font-mono">缺少 Python 模块：{missing}</p>
            <p className="mt-1.5">
              根因：RELION 的 <span className="font-mono">relion_python_topaz</span> 包装器用系统 Python 启动 topaz，
              而主环境为 3GB 无 GPU 沙箱——torch / CUDA 扩展不可用。修复路径：进入
              <span className="font-mono"> /home/z/.venv</span>（topaz 0.3.20 + torch CPU 已装）后重跑，
              或在 HPC 上用 conda 环境的 SBATCH（见 Section 6 topaztrain 模板）。
            </p>
          </div>
        )}
        {job?.durationSec != null && (
          <p className="text-[11px] tabular-nums text-muted-foreground">耗时 {job.durationSec.toFixed(1)}s</p>
        )}
      </CardContent>
    </Card>
  );
}

export function TopazSection({ jobs }: { jobs: MergedJob[] }) {
  const topaztrain = useMemo(() => jobs.find((j) => j.key === "topaztrain"), [jobs]);
  const autopick = useMemo(() => jobs.find((j) => j.key === "autopick"), [jobs]);

  return (
    <div className="space-y-4">
      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
        {/* dependency chain */}
        <Card className="min-w-0 border-border/70">
          <CardHeader className="p-4 pb-3 sm:p-6 sm:pb-3">
            <CardTitle className="text-base">外部依赖链（沙箱实测）</CardTitle>
            <CardDescription className="text-xs">
              cryo-EM 拾取链路中的四层外部依赖——任何一层断裂都会以 external-unavailable 级别记录
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
              <ChainNode
                icon={FlaskConical}
                title="RELION 5.0.1"
                sub="relion_python_topaz 包装器"
                tone="border-teal-300/60 bg-teal-50/60 text-teal-700 dark:border-teal-800/50 dark:bg-teal-950/30 dark:text-teal-300"
              />
              <ArrowRight className="mx-auto h-4 w-4 shrink-0 rotate-90 text-muted-foreground sm:rotate-0" aria-hidden />
              <ChainNode
                icon={Brain}
                title="topaz 0.3.20"
                sub="CNN 训练/推理 CLI"
                tone="border-violet-300/60 bg-violet-50/60 text-violet-700 dark:border-violet-800/50 dark:bg-violet-950/30 dark:text-violet-300"
              />
              <ArrowRight className="mx-auto h-4 w-4 shrink-0 rotate-90 text-muted-foreground sm:rotate-0" aria-hidden />
              <ChainNode
                icon={ImageIcon}
                title="resnet16 CNN"
                sub="模型训练 → model.bin"
                tone="border-cyan-300/60 bg-cyan-50/60 text-cyan-700 dark:border-cyan-800/50 dark:bg-cyan-950/30 dark:text-cyan-300"
              />
              <ArrowRight className="mx-auto h-4 w-4 shrink-0 rotate-90 text-muted-foreground sm:rotate-0" aria-hidden />
              <ChainNode
                icon={Cpu}
                title="torch CPU"
                sub="2.14 · 无 CUDA 沙箱"
                tone="border-amber-300/60 bg-amber-50/60 text-amber-700 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-300"
              />
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              沙箱为 3GB RAM / 无 GPU：topaz 的 <span className="font-mono">--gpu</span> 回退到 CPU 推理（num-workers 受限）。
              在 HPC 设计（Section 4-6）中，该链路由 SBATCH 生成器的
              <span className="font-mono"> conda activate topaz-0.3.20</span> + 单 GPU gres 声明承载。
            </p>
          </CardContent>
        </Card>

        {/* data flow */}
        <Card className="min-w-0 border-border/70">
          <CardHeader className="p-4 pb-3 sm:p-6 sm:pb-3">
            <CardTitle className="text-base">训练 → 模型 → 拾取 数据流</CardTitle>
            <CardDescription className="text-xs">
              EMPIAR-10017 真实数据在 Topaz 作业族中的流转（star / coord 文件格式互换）
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            <div className="space-y-2">
              {[
            {
                  icon: FileCog,
                  title: "① 训练输入",
                  sub: "manualpick.star（5539 个 Henderson 真实 pick）+ 10 张 4096×4096 微图",
                  tone: "border-primary/30 bg-primary/5",
                },
                {
                  icon: Brain,
                  title: "② CNN 训练（30 min @ 1 GPU）",
                  sub: "topaz train --net resnet16 --epochs 10 → TopazTrain/model.bin",
                  tone: "border-violet-300/60 bg-violet-50/60 dark:bg-violet-950/30",
                },
                {
                  icon: ImageIcon,
                  title: "③ 拾取推理",
                  sub: "topaz extract --model model.bin --threshold -6 → coords/*.tstar（自动拾取坐标）",
                  tone: "border-cyan-300/60 bg-cyan-50/60 dark:bg-cyan-950/30",
                },
                {
                  icon: CheckCircle2,
                  title: "④ 回写工作流",
                  sub: "引擎将坐标转换为 autopick.star → extract 作业消费 → class2d…（36 job DAG 下游）",
                  tone: "border-emerald-300/60 bg-emerald-50/60 dark:bg-emerald-950/30",
                },
              ].map((step, i, arr) => (
                <div key={step.title} className="relative">
                  <motion.div
                    initial={{ opacity: 0, x: -8 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.07, duration: 0.3 }}
                    className={cn("flex items-start gap-3 rounded-xl border p-3", step.tone)}
                  >
                    <step.icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold">{step.title}</p>
                      <p className="mt-0.5 font-mono text-[10px] leading-relaxed break-all text-muted-foreground">{step.sub}</p>
                    </div>
                  </motion.div>
                  {i < arr.length - 1 && (
                    <div className="ml-[27px] h-2 w-px bg-border" aria-hidden />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* live results */}
      <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
        <TopazResultCard job={topaztrain} />
        <TopazResultCard job={autopick} />
      </div>
    </div>
  );
}
