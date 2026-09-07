"use client";

import { Snowflake, Github } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="safe-bottom mt-auto border-t border-border/70 bg-muted/40">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-6 text-center sm:flex-row sm:px-6 sm:text-left">
        <div className="flex items-center gap-2">
          <Snowflake className="h-4 w-4 text-primary" aria-hidden />
          <p className="text-xs text-muted-foreground">
            CryoFlow 全面测试与 HPC 调度设计 · RELION 5.0.1 · Topaz 0.3.20 · EMPIAR-10017
          </p>
        </div>
        <p className="font-mono text-[10px] text-muted-foreground/70">
          Next.js 16 · App Router · TanStack Query 5s 轮询 · Slurm 模拟器为纯服务端计算
        </p>
        <a
          href="#overview"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <Github className="h-3.5 w-3.5" aria-hidden /> 回到顶部
        </a>
      </div>
    </footer>
  );
}
