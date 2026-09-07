"use client";

/**
 * Export the live test report as Markdown (client-side generation from the
 * same data the matrix renders — includes environment, summary, per-job
 * verdicts with commands/durations, and the findings log).
 */

import { useCallback, useState } from "react";
import { Download, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useTestResults } from "@/hooks/use-test-results";

export function ExportReportButton() {
  const { report } = useTestResults(5000);
  const [done, setDone] = useState(false);

  const onExport = useCallback(() => {
    const lines: string[] = [];
    const meta = report.raw.meta ?? {};
    const env = meta.environment ?? {};
    const s = report.stats;

    lines.push("# CryoFlow 全面测试报告（EMPIAR-10017 真实数据）");
    lines.push("");
    lines.push(`> 生成时间：${new Date().toISOString()}`);
    lines.push(`> 通过 **${s.passed}/${s.total}** · 失败 ${s.failed} · 外部依赖/输入受限 ${s.external} · 待执行 ${s.pending}`);
    lines.push("");
    lines.push("## 环境");
    for (const [k, v] of Object.entries(env)) {
      if (v) lines.push(`- **${k}**：${v}`);
    }
    lines.push("");
    lines.push("## 测试矩阵");
    for (const job of report.jobs) {
      const icon = job.status === "pass" ? "✅" : job.status === "fail" ? "❌" : "⏳";
      const dur = job.durationSec != null ? ` · ${job.durationSec}s` : "";
      lines.push(`### ${icon} ${job.name ?? job.key}（${job.key}）`);
      lines.push(`- 类别：${job.category ?? "-"} · 级别：${job.level} · 状态：${job.status}${dur}`);
      if (job.command) lines.push(`- 命令：\`${job.command.slice(0, 400)}\``);
      if (job.result) lines.push(`- 结果：${job.result}`);
      if (job.notes) lines.push(`- 备注：${job.notes}`);
      if (job.artifacts?.length) lines.push(`- 产物：${job.artifacts.join(", ")}`);
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
    lines.push("## HPC / Slurm 集群设计");
    lines.push("详见平台 Section 4-6 与 cryoflow 仓库 docs/hpc-slurm-design.md。");

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
    toast.success("报告已导出为 Markdown");
  }, [report]);

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
