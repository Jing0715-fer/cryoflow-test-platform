"use client";

import { LayoutGrid, Brain, Network, Gauge, FileCode2, Bug } from "lucide-react";
import { Navbar } from "@/components/report/navbar";
import { Hero } from "@/components/report/hero";
import { TestMatrix } from "@/components/report/test-matrix";
import { TopazSection } from "@/components/report/topaz-section";
import { FindingsSection } from "@/components/report/findings-section";
import { HpcArchitecture } from "@/components/report/hpc-architecture";
import { SlurmSimulator } from "@/components/report/simulator";
import { SbatchGenerator } from "@/components/report/sbatch-generator";
import { SiteFooter } from "@/components/report/site-footer";
import { SectionShell } from "@/components/report/section-shell";
import { useTestResults } from "@/hooks/use-test-results";

export default function Page() {
  const { report, query } = useTestResults(5000);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar passed={report.stats.passed} total={report.stats.total} />

      <main className="flex-1">
        {/* Section 1 — Hero / overview */}
        <div id="overview" className="scroll-mt-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <Hero report={report} isFetching={query.isFetching} />
          </div>
        </div>

        <div className="mx-auto max-w-7xl space-y-16 px-4 pb-16 pt-14 sm:px-6">
          {/* Section 2 — test matrix */}
          <SectionShell
            id="matrix"
            icon={LayoutGrid}
            eyebrow="Section 2"
            title="36 Job 全量测试矩阵"
            description="26 个 SPA + 10 个 Tomo job 类型的逐项测试结果。数据由主代理在真实工具链上执行并实时写入，本页 5 秒轮询同步；pending 条目会在结果落盘后自动点亮。点击任意行展开完整命令、产物与日志。"
          >
            <TestMatrix jobs={report.jobs} />
          </SectionShell>

          {/* Section 2.5 — findings */}
          <SectionShell
            id="findings"
            icon={Bug}
            eyebrow="Section 2.5"
            title="测试发现的问题与修复"
            description="全面测试不止于跑通——每一条都是真实复现、定位到根因、并已修复或明确归因的发现。修复已提交到 cryoflow 仓库（可 git log 查看）。"
          >
            <FindingsSection />
          </SectionShell>

          {/* Section 3 — Topaz deep dive */}
          <SectionShell
            id="topaz"
            icon={Brain}
            eyebrow="Section 3"
            title="Topaz 深度测试专项"
            description="外部依赖链、训练→模型→拾取数据流，以及 topaztrain / autopick 两个 job 的真实测试结果（含 ModuleNotFoundError 根因提取的诚实失败路径）。"
          >
            <TopazSection jobs={report.jobs} />
          </SectionShell>

          {/* Section 4 — HPC architecture */}
          <SectionShell
            id="architecture"
            icon={Network}
            eyebrow="Section 4"
            title="HPC / Slurm 集群对接架构设计"
            description="从浏览器画布到 Slurm GPU 分区的三层架构，以及 CryoFlow 服务端新增 hpc/ 模块的六个核心组件设计。"
          >
            <HpcArchitecture />
          </SectionShell>

          {/* Section 5 — interactive simulator */}
          <SectionShell
            id="simulator"
            icon={Gauge}
            eyebrow="Section 5"
            title="交互式 Slurm 多 GPU 调度模拟器"
            description="事件驱动调度模拟（优先级 FIFO + 依赖 DAG + GPU 资源池分配，服务端纯 TS 计算）：提交 EMPIAR-10017 全流程工作流，观看 Gantt 时间轴与 GPU 占用率随模拟时钟点亮。"
          >
            <SlurmSimulator />
          </SectionShell>

          {/* Section 6 — SBATCH generator */}
          <SectionShell
            id="sbatch"
            icon={FileCode2}
            eyebrow="Section 6"
            title="SBATCH 脚本生成器"
            description="按 job 类型感知渲染真实可用的 SBATCH：RELION module load、GPU gres、array 分片、conda activate topaz、mpirun 绑卡与依赖占位注释。"
          >
            <SbatchGenerator />
          </SectionShell>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
