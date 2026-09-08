"use client";

/**
 * Export the live test report as Markdown (client-side generation from the
 * same data the matrix renders — includes environment, summary, per-job
 * verdicts with commands/durations, the findings log, wall-time analytics,
 * an engine heartbeat snapshot, and the HPC delivery summary).
 */

import { useCallback, useState } from "react";
import { Download, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useTestResults } from "@/hooks/use-test-results";
import type { EngineStatus } from "@/hooks/use-engine-status";

function fmtDuration(sec: number): string {
  if (sec <= 0) return "—";
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (m < 60) return `${m}m ${s}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

const STATUS_ICON: Record<string, string> = {
  pass: "✅",
  fail: "❌",
  "sequential-limit": "⚠️",
  "known-gap": "🧩",
  running: "🔄",
  pending: "⏳",
};

export function ExportReportButton() {
  const { report } = useTestResults(5000);
  const { toast } = useToast();
  const [done, setDone] = useState(false);

  const onExport = useCallback(async () => {
    const lines: string[] = [];
    const meta = report.raw.meta ?? {};
    const env = meta.environment ?? {};
    const s = report.stats;

    // engine heartbeat snapshot (best-effort, non-blocking failure)
    let engine: EngineStatus | null = null;
    try {
      const res = await fetch("/api/engine-status", { cache: "no-store" });
      if (res.ok) engine = (await res.json()) as EngineStatus;
    } catch {
      /* offline engine → omit section */
    }

    lines.push("# CryoFlow 全面测试报告（EMPIAR-10017 真实数据）");
    lines.push("");
    lines.push(`> 生成时间：${new Date().toISOString()}`);
    lines.push(
      `> 通过 **${s.passed}/${s.total}** · 失败 ${s.failed} · 顺序模式受限 ${s.sequentialLimit} · 待实现 ${s.knownGap} · 待执行 ${s.pending}`
    );
    lines.push("");
    lines.push("## 环境");
    for (const [k, v] of Object.entries(env)) {
      if (v) lines.push(`- **${k}**：${v}`);
    }
    lines.push("");

    if (engine) {
      lines.push("## 引擎实时心跳（导出时刻快照）");
      lines.push(`- cryoflow :3001 —— **${engine.online ? "在线" : "离线"}**（探测于 ${engine.probedAt}）`);
      if (engine.relion) {
        lines.push(
          `- RELION ${engine.relion.version ?? "?"}（${engine.relion.execution ?? "-"} · ${engine.relion.found ? "已探测" : "未探测"}）`
        );
      }
      if (engine.projects) {
        lines.push(`- 引擎侧项目：${engine.projects.count} 个`);
        for (const p of engine.projects.items.slice(0, 6)) {
          const st = p.stats;
          lines.push(
            `  - ${p.name}（${p.mode}）· job ${st.total} = 完成 ${st.completed} / 运行 ${st.running} / 失败 ${st.failed}`
          );
        }
      }
      lines.push("");
    }

    lines.push("## 测试矩阵");
    for (const job of report.jobs) {
      const icon = STATUS_ICON[job.status] ?? "⏳";
      const dur = job.durationSec != null ? ` · ${fmtDuration(job.durationSec)}` : "";
      lines.push(`### ${icon} ${job.name ?? job.key}（${job.key}）`);
      lines.push(`- 类别：${job.category ?? "-"} · 级别：${job.level} · 状态：${job.status}${dur}`);
      if (job.command) lines.push(`- 命令：\`${job.command.slice(0, 400)}\``);
      if (job.result) lines.push(`- 结果：${job.result}`);
      if (job.notes) lines.push(`- 备注：${job.notes}`);
      if (job.artifacts?.length) lines.push(`- 产物：${job.artifacts.join(", ")}`);
      lines.push("");
    }

    // ---- wall-time analytics (mirrors Section 2.6) ----
    const executed = report.jobs.filter((j) => (j.durationSec ?? 0) > 0 && j.status !== "pending");
    if (executed.length > 0) {
      const total = executed.reduce((a, j) => a + (j.durationSec ?? 0), 0);
      const sorted = [...executed].sort((a, b) => (b.durationSec ?? 0) - (a.durationSec ?? 0));
      const realSec = executed
        .filter((j) => j.level === "real" || j.level === "external-app-real")
        .reduce((a, j) => a + (j.durationSec ?? 0), 0);
      lines.push("## 真实执行耗时分析");
      lines.push(`- 累计执行：**${fmtDuration(total)}**（${executed.length} 个已执行 job）`);
      lines.push(`- 真实二进制执行：${fmtDuration(realSec)}（占 ${total > 0 ? ((realSec / total) * 100).toFixed(0) : 0}%）`);
      lines.push(`- 最长单任务：${sorted[0].name}（${fmtDuration(sorted[0].durationSec ?? 0)}）`);
      lines.push("");
      lines.push("### 耗时 Top 10");
      lines.push("| # | Job | 耗时 | 级别 |");
      lines.push("|---|-----|------|------|");
      sorted.slice(0, 10).forEach((j, i) => {
        lines.push(`| ${i + 1} | ${j.name}（${j.key}） | ${fmtDuration(j.durationSec ?? 0)} | ${j.level} |`);
      });
      lines.push("");
    }

    const findings = meta.findings ?? [];
    if (findings.length) {
      lines.push("## 发现的问题与修复");
      for (const f of findings) {
        lines.push(`### ${f.id} · ${f.title}`);
        lines.push(`- 严重度：${f.severity} · 状态：${f.status}`);
        lines.push(`- 症状：${f.symptom}`);
        lines.push(`- 根因：${f.rootCause}`);
        lines.push(`- 处置：${f.fix}`);
        lines.push("");
      }
    }

    lines.push("## HPC / Slurm 集群交付");
    lines.push("- **架构设计**：三层（浏览器画布 → CryoFlow 服务端 hpc/ 模块 → Slurm 集群）；设计文档见 cryoflow 仓库 `docs/hpc-slurm-design.md`。");
    lines.push("- **调度模拟器**：17 作业 EMPIAR-10017 全流程工作流；优先级 FIFO + afterok DAG + GPU 池；**EASY backfill**（资源预约安全：回填作业须先于队首预约点完成）；1×4 A100 集群下可复现回填时刻。");
    lines.push("- **SBATCH 生成器**：6 类模板（module load / conda topaz / mpirun 绑卡 / array / /lustre 路径 / 依赖占位）；`--time` 由真实测量锚定（沙箱实测 × 速度比 ×1.5 安全系数，如 topaztrain 8485s ÷25× → 10min）。");
    lines.push("- **引擎修复**：F1–F6 六个真实缺陷已在 cryoflow 仓库修复并提交（topaz 训练输入、MPI 顺序回退、halves 合成、RELION 5 星表收集等）。");

    const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cryoflow-test-report-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setDone(true);
    setTimeout(() => setDone(false), 1800);
    toast({
      title: "报告已导出为 Markdown",
      description: engine ? "含引擎心跳快照与耗时分析 Top10" : "含耗时分析与 HPC 交付摘要",
    });
  }, [report, toast]);

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-10 gap-1.5 px-3 text-xs"
      onClick={onExport}
      aria-label="导出测试报告为 Markdown 文件"
    >
      {done ? <Check className="h-4 w-4" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}
      <span className="hidden sm:inline">{done ? "已导出" : "导出报告"}</span>
    </Button>
  );
}
