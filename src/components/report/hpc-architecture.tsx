"use client";

import { motion } from "framer-motion";
import {
  Monitor,
  Server,
  Network,
  Layers,
  Plug,
  FileCode2,
  GitBranch,
  Database,
  Activity,
  ShieldCheck,
  ArrowDown,
  Terminal,
  HardDrive,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const LAYERS = [
  {
    tag: "L1 · 浏览器",
    title: "工作流画布（Job Graph）",
    tone: "border-primary/30 bg-primary/[0.06]",
    icon: Monitor,
    nodes: [
      { label: "React 画布：36 job 节点拖拽编排", mono: false },
      { label: "REST /api/jobs · /api/hpc/simulate", mono: true },
      { label: "运行状态订阅（RunRecord → 节点徽章）", mono: false },
    ],
    arrowLabel: "REST（JSON，5s 轮询 / 可升级 SSE）",
  },
  {
    tag: "L2 · CryoFlow 服务端",
    title: "调度核心与分发层（新增 hpc/ 模块）",
    tone: "border-teal-300/50 bg-teal-50/50 dark:border-teal-800/40 dark:bg-teal-950/25",
    icon: Server,
    nodes: [
      { label: "engine.ts — DAG 调度核心：就绪队列 / RunRecord 状态机", mono: false },
      { label: "dispatch.ts — 分发器：local | slurm 后端路由", mono: false },
      { label: "hpc/profiles.ts · hpc/sbatch.ts · hpc/gpusplit.ts · hpc/monitor.ts", mono: true },
    ],
    arrowLabel: "ssh → sbatch / squeue / sacct（单登录节点长连接）",
  },
  {
    tag: "L3 · Slurm 集群",
    title: "登录节点 + GPU 计算分区 + 共享文件系统",
    tone: "border-violet-300/50 bg-violet-50/50 dark:border-violet-800/40 dark:bg-violet-950/25",
    icon: Network,
    nodes: [
      { label: "登录节点：sbatch 提交 · squeue 轮询 · sacct 计费查询", mono: false },
      { label: "gpu 分区：N 节点 × 4×A100/H100（gres）· cpu 分区：ctffind array", mono: false },
      { label: "/lustre 共享 FS：EMPIAR stage-in · job 产物 · checkpoint", mono: true },
    ],
    arrowLabel: null,
  },
] as const;

const COMPONENTS = [
  {
    icon: Plug,
    title: "① 执行后端抽象",
    body: "ExecutionBackend 接口：submit(job) / poll() / cancel() 三个原语。LocalBackend 调 RELION 本地进程（当前沙箱模式），SlurmBackend 走 ssh sbatch。引擎 engine.ts 只面向接口编程，插拔无侵入。",
    tone: "text-teal-600 dark:text-teal-400",
  },
  {
    icon: FileCode2,
    title: "② SBATCH 生成器",
    body: "hpc/sbatch.ts 按 job 类型渲染模板：RELION module load、GPU gres、array 分片（motioncorr/ctffind）、conda activate topaz、mpirun 绑卡。生成即 lint（指令冲突检测），产物在 Section 6 可交互体验。",
    tone: "text-cyan-600 dark:text-cyan-400",
  },
  {
    icon: GitBranch,
    title: "③ 多 GPU 策略",
    body: "数据并行：per-micrograph array job（每片 1 GPU）；class2d splits 粒子分桶；refine3d 单作业多 GPU（mpirun -np 4 + --gpu 0:1:2:3）；topaz 训练固定单 GPU（SGD 不扩）。由 gpusplit.ts 统一决策。",
    tone: "text-violet-600 dark:text-violet-400",
  },
  {
    icon: Database,
    title: "④ 数据流转",
    body: "EMPIAR-10017 stage-in（https → /lustre/project）→ 共享 FS 上 job 目录树（Import/MotionCorr/…）→ 产物回传（仅摘要 star + 关键 mrc 缩略图同步回沙箱 DB，大文件留在集群）。",
    tone: "text-orange-600 dark:text-orange-400",
  },
  {
    icon: Activity,
    title: "⑤ 监控闭环",
    body: "hpc/monitor.ts 周期 squeue --json → 映射 Slurm PENDING/RUNNING/COMPLETED/FAILED/Cancelled 到 RunRecord 状态机；sacct -j 拉取 elapsed/GPU 时长计费；断连指数退避，最终一致。",
    tone: "text-emerald-600 dark:text-emerald-400",
  },
  {
    icon: ShieldCheck,
    title: "⑥ 容错设计",
    body: "#SBATCH --requeue：节点故障自动重排；RELION --continue 从 _iters checkpoint 续跑；scancel → dispatch 标记 CANCELLED 停止重提；failover 阈值触发降级（多 GPU → 单 GPU 重试）。",
    tone: "text-rose-600 dark:text-rose-400",
  },
] as const;

export function HpcArchitecture() {
  return (
    <div className="space-y-4">
      {/* layered diagram */}
      <Card className="border-border/70 p-4 sm:p-6">
        <div className="space-y-1.5">
          {LAYERS.map((layer, i) => (
            <div key={layer.tag}>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.35, delay: i * 0.06 }}
                className={cn("rounded-xl border p-4", layer.tone)}
              >
                <div className="flex items-center gap-2">
                  <layer.icon className="h-4 w-4 text-primary" aria-hidden />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-primary">{layer.tag}</span>
                  <span className="text-xs font-semibold text-foreground">{layer.title}</span>
                </div>
                <ul className="mt-3 grid gap-1.5 sm:grid-cols-3">
                  {layer.nodes.map((n) => (
                    <li
                      key={n.label}
                      className={cn(
                        "rounded-lg border border-border/70 bg-background/80 px-2.5 py-2 text-[11px] leading-snug",
                        n.mono && "font-mono text-[10px] break-all"
                      )}
                    >
                      {n.label}
                    </li>
                  ))}
                </ul>
              </motion.div>
              {layer.arrowLabel && (
                <div className="flex items-center justify-center gap-2 py-1">
                  <ArrowDown className="h-4 w-4 text-muted-foreground" aria-hidden />
                  <span className="rounded-full border border-border bg-muted/60 px-2.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {layer.arrowLabel}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* component cards */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {COMPONENTS.map((c, i) => (
          <motion.div
            key={c.title}
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.35, delay: (i % 3) * 0.06 }}
          >
            <Card className="h-full border-border/70">
              <CardHeader className="p-4 pb-2 sm:p-5 sm:pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <c.icon className={cn("h-4 w-4 shrink-0", c.tone)} aria-hidden />
                  {c.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-2 sm:p-5 sm:pt-2">
                <p className="text-xs leading-relaxed text-muted-foreground">{c.body}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* mini legend strip */}
      <Card className="border-dashed border-border/70 p-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Terminal className="h-3.5 w-3.5 text-primary" aria-hidden />
            单 ssh 长连接复用，避免每 job 建连
          </span>
          <span className="inline-flex items-center gap-1.5">
            <HardDrive className="h-3.5 w-3.5 text-primary" aria-hidden />
            大产物留 /lustre，仅元数据回传沙箱
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-primary" aria-hidden />
            RunRecord 状态机为唯一事实源（UI 与 Slurm 解耦）
          </span>
        </div>
      </Card>
    </div>
  );
}
