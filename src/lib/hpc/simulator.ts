import type {
  SimClusterConfig,
  SimEvent,
  SimJob,
  SimTask,
  SimulateResponse,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Event-driven Slurm scheduling simulator (pure TS, no side effects).
//
// Semantics mirrored from real Slurm:
//  - priority FIFO over the submission order (array tasks share the sequence),
//  --dependency=afterok:ID → DAG readiness at job-key granularity,
//  --gres=gpu:N → per-node GPU pool with first-fit packing,
//  --array → one scheduler task per array index (jobId "3_7" style),
//  squeue states PENDING (waitReason) / RUNNING / COMPLETED.
// CPU-only tasks (ctffind array) do not consume the GPU pool.
// ---------------------------------------------------------------------------

const GPU_SPEED_FACTOR: Record<SimClusterConfig["gpuModel"], number> = {
  A100: 1.0,
  H100: 0.6,
};

interface InnerTask {
  jobKey: string;
  jobId: string;
  label: string;
  category: string;
  arrayIndex: number | null;
  gpus: number;
  durationMin: number;
  timeLimitMin: number;
  deps: string[];
  seq: number; // submission order for FIFO priority
  eligible: boolean;
  eligibleAt: number;
  started: boolean;
  startMin: number;
  endMin: number;
  nodeIds: number[];
  gpuIds: string[];
  waitReason: string;
}

interface Alloc {
  nodeIds: number[];
  gpuIds: string[];
}

function tryAllocate(
  gpus: number,
  gpusPerNode: number,
  freeGpus: number[],
  allowCrossNode: boolean
): Alloc | null {
  if (gpus <= 0) return { nodeIds: [], gpuIds: [] };
  if (gpus <= gpusPerNode) {
    // single-node job: all GPUs must sit on one node (typical for RELION + CUDA_VISIBLE_DEVICES)
    const node = freeGpus.findIndex((f) => f >= gpus);
    if (node === -1) return null;
    const taken: string[] = [];
    let remaining = gpus;
    for (let g = 0; g < gpusPerNode && remaining > 0; g++) {
      taken.push(`n${node}:gpu${g}`);
      remaining--;
    }
    freeGpus[node] -= gpus;
    return { nodeIds: [node], gpuIds: taken };
  }
  if (!allowCrossNode) return null;
  // multi-node MPI job: scatter across nodes, densest-first
  const order = freeGpus
    .map((f, i) => ({ i, f }))
    .sort((a, b) => b.f - a.f)
    .filter((n) => n.f > 0);
  let remaining = gpus;
  const nodeIds: number[] = [];
  const gpuIds: string[] = [];
  for (const n of order) {
    if (remaining <= 0) break;
    const take = Math.min(n.f, remaining);
    for (let g = 0; g < take; g++) gpuIds.push(`n${n.i}:gpu${g}`);
    freeGpus[n.i] -= take;
    remaining -= take;
    nodeIds.push(n.i);
  }
  if (remaining > 0) {
    // roll back
    for (const id of nodeIds) {
      const used = gpuIds.filter((g) => g.startsWith(`n${id}:`)).length;
      freeGpus[id] += used;
    }
    return null;
  }
  return { nodeIds, gpuIds };
}

/**
 * Conservative resource reservation for the blocked head-of-queue job:
 * walk running GPU tasks in completion order, free their GPUs batch-by-batch
 * (same-timestamp completions grouped), and return the earliest time the head
 * job's allocation succeeds. No future starts are assumed — this is exactly
 * the EASY backfill safety baseline.
 */
function computeReservation(
  head: InnerTask,
  freeGpus: number[],
  running: { task: InnerTask; endMin: number }[],
  cluster: SimClusterConfig,
  clock: number
): number {
  const sim = [...freeGpus];
  const gpuRunning = running
    .filter((r) => r.task.gpus > 0)
    .sort((a, b) => a.endMin - b.endMin);
  let t = clock;
  for (let i = 0; i < gpuRunning.length; i++) {
    t = gpuRunning[i].endMin;
    // free every task completing at this same timestamp (batch = one Slurm cycle)
    for (let k = i; k < gpuRunning.length && gpuRunning[k].endMin <= t + 1e-9; k++) {
      const task = gpuRunning[k].task;
      const perNode = new Map<number, number>();
      for (const id of task.gpuIds) {
        const n = Number(id.slice(1, id.indexOf(":")));
        perNode.set(n, (perNode.get(n) ?? 0) + 1);
      }
      for (const [n, c] of perNode) sim[n] += c;
      i = k; // advance outer index to the last batch member
    }
    if (tryAllocate(head.gpus, cluster.gpusPerNode, sim, true)) return t;
  }
  // after everything completes the cluster is fully free (feasibility guard
  // already ensured head.gpus ≤ capacity)
  return gpuRunning.length > 0 ? gpuRunning[gpuRunning.length - 1].endMin : clock;
}

export function simulate(
  cluster: SimClusterConfig,
  jobs: SimJob[],
  options?: { backfill?: boolean }
): SimulateResponse {
  const backfill = options?.backfill ?? false;
  const capacity = cluster.nodes * cluster.gpusPerNode;
  const speed = GPU_SPEED_FACTOR[cluster.gpuModel] ?? 1;
  const events: SimEvent[] = [];

  // ---- expand array jobs into scheduler tasks -------------------------------
  const tasks: InnerTask[] = [];
  let seq = 0;
  for (const job of jobs) {
    const n = job.arrayCount && job.arrayCount > 1 ? job.arrayCount : 0;
    // Slurm semantics: all array tasks of one job share the base job id
    const baseId = tasks.length + 1;
    if (n > 0) {
      for (let i = 0; i < n; i++) {
        tasks.push({
          jobKey: job.key,
          jobId: `${baseId}_${i}`,
          label: `${job.name} [${i}]`,
          category: job.category,
          arrayIndex: i,
          gpus: job.gpus,
          durationMin: job.durationMin * speed,
          timeLimitMin: job.timeLimitMin,
          deps: job.deps,
          seq: seq++,
          eligible: false,
          eligibleAt: 0,
          started: false,
          startMin: 0,
          endMin: 0,
          nodeIds: [],
          gpuIds: [],
          waitReason: "队列排队中（FIFO 优先级）",
        });
      }
    } else {
      tasks.push({
        jobKey: job.key,
        jobId: `${tasks.length + 1}`,
        label: job.name,
        category: job.category,
        arrayIndex: null,
        gpus: job.gpus,
        durationMin: job.durationMin * speed,
        timeLimitMin: job.timeLimitMin,
        deps: job.deps,
        seq: seq++,
        eligible: false,
        eligibleAt: 0,
        started: false,
        startMin: 0,
        endMin: 0,
        nodeIds: [],
        gpuIds: [],
        waitReason: "队列排队中（FIFO 优先级）",
      });
    }
  }

  for (const t of tasks) {
    events.push({
      t: 0,
      jobId: t.jobId,
      type: "SUBMITTED",
      detail: `sbatch 提交 ${t.label}${t.arrayIndex !== null ? `（array 任务 ${t.jobId}）` : ""} · 请求 ${t.gpus} GPU · 时限 ${t.timeLimitMin}min`,
    });
  }

  // ---- resource feasibility guard -------------------------------------------
  const impossible = tasks.filter((t) => t.gpus > capacity);
  if (impossible.length > 0) {
    throw new Error(
      `作业 ${impossible[0].label} 需要 ${impossible[0].gpus} GPU，超过集群容量 ${capacity}（${cluster.nodes} 节点 × ${cluster.gpusPerNode} GPU）。请增大集群或拆分该作业。`
    );
  }

  const freeGpus: number[] = Array.from({ length: cluster.nodes }, () => cluster.gpusPerNode);
  const running: { task: InnerTask; endMin: number }[] = [];
  const remainingPerKey = new Map<string, number>();
  for (const t of tasks) {
    remainingPerKey.set(t.jobKey, (remainingPerKey.get(t.jobKey) ?? 0) + 1);
  }
  // CPU 分区并发上限：partitions × 10 任务（ctffind 等纯 CPU array 的排队语义）
  const cpuSlots = Math.max(1, cluster.partitions) * 10;
  let runningCpu = 0;

  let clock = 0;
  let allDone = false;
  let guard = 0;
  let backfillCountTotal = 0; // tasks started via backfill across all cycles

  while (!allDone && guard++ < 100000) {
    // 1. dependency clearing (job key completes when all its tasks complete)
    for (const t of tasks) {
      if (t.eligible || t.started) continue;
      const unresolved = t.deps.filter((d) => (remainingPerKey.get(d) ?? 0) > 0);
      if (unresolved.length === 0) {
        t.eligible = true;
        t.eligibleAt = clock;
        if (clock > 0) {
          events.push({
            t: clock,
            jobId: t.jobId,
            type: "DEPS-CLEARED",
            detail: `依赖满足（afterok）→ 进入就绪队列`,
          });
        }
      } else {
        t.waitReason = `等待依赖作业完成：${unresolved
          .map((u) => jobs.find((j) => j.key === u)?.name ?? u)
          .join("、")}`;
      }
    }

    // 2. FIFO allocation over eligible tasks (+ optional EASY backfill with reservation)
    //
    // strict FIFO: the first GPU task that cannot be allocated blocks the whole
    // GPU queue behind it (classic Slurm without sched/backfill).
    // backfill: later tasks may jump the queue only if they fit in the currently
    // free GPUs AND finish before the head job's reserved start time — the EASY
    // algorithm's safety rule, which guarantees the head job is never delayed.
    const eligible = tasks
      .filter((t) => t.eligible && !t.started)
      .sort((a, b) => a.seq - b.seq);
    let headBlocked: InnerTask | null = null;
    let reservation = Infinity; // reserved start time for the head-of-queue job

    const startTask = (t: InnerTask, alloc: Alloc, viaBackfill: boolean) => {
      t.started = true;
      t.startMin = clock;
      t.endMin = clock + t.durationMin;
      t.nodeIds = alloc.nodeIds;
      t.gpuIds = alloc.gpuIds;
      t.waitReason = "";
      if (t.gpus === 0) runningCpu++;
      running.push({ task: t, endMin: t.endMin });
      if (viaBackfill) {
        backfillCountTotal++;
        events.push({
          t: clock,
          jobId: t.jobId,
          type: "BACKFILL",
          detail: `碎片回填：${t.label} 插队启动（${t.durationMin.toFixed(1)} min ≤ 预约窗口，不推迟队首）`,
        });
      } else {
        events.push({
          t: clock,
          jobId: t.jobId,
          type: "ALLOCATED",
          detail: `分配 ${t.gpus === 0 ? "CPU 槽位" : `${alloc.gpuIds.join(" ")} @ ${alloc.nodeIds.map((n) => `节点${n}`).join("+")}`} → squeue 状态 RUNNING`,
        });
      }
      events.push({
        t: clock,
        jobId: t.jobId,
        type: "RUNNING",
        detail: `${t.label} 开始（预计 ${t.durationMin.toFixed(1)} min）`,
      });
    };

    for (const t of eligible) {
      // CPU track: independent partition, never blocked by (nor blocking) the GPU queue
      if (t.gpus === 0) {
        if (runningCpu >= cpuSlots) {
          t.waitReason = `CPU 分区并发已满（${runningCpu}/${cpuSlots}）—— squeue PENDING (Resources)`;
          continue;
        }
        startTask(t, { nodeIds: [], gpuIds: [] }, false);
        continue;
      }

      if (!headBlocked) {
        const alloc = tryAllocate(t.gpus, cluster.gpusPerNode, freeGpus, true);
        if (alloc) {
          startTask(t, alloc, false);
        } else {
          headBlocked = t;
          reservation = computeReservation(t, freeGpus, running, cluster, clock);
          t.waitReason = `GPU 资源不足——已预约 T+${(reservation - clock).toFixed(0)}′ 启动（squeue PENDING (Resources)）`;
          events.push({
            t: clock,
            jobId: t.jobId,
            type: "RESERVED",
            detail: `队首作业预约：${t.label} 将于 T+${(reservation - clock).toFixed(0)}′ 获得资源（backfill 安全基线）`,
          });
        }
        continue;
      }

      // --- behind a blocked head ---
      if (!backfill) {
        t.waitReason = `FIFO 严格排队：等待队首 ${headBlocked.label} 的资源预约`;
        continue;
      }
      // EASY safety: candidate must finish before the head's reserved start
      if (clock + t.durationMin > reservation) {
        t.waitReason = `backfill 窗口不足：需 ${t.durationMin.toFixed(1)} min，剩余 ${Math.max(0, reservation - clock).toFixed(0)}′（推迟队首 = 不允许）`;
        continue;
      }
      const alloc = tryAllocate(t.gpus, cluster.gpusPerNode, freeGpus, true);
      if (!alloc) {
        t.waitReason = "资源不足（backfill 候选未能装箱当前空闲 GPU）";
        continue;
      }
      startTask(t, alloc, true);
    }

    // 3. advance time to the next completion event
    if (running.length === 0) {
      // nothing running and nothing startable → deadlocked (should not happen after guard)
      break;
    }
    const next = Math.min(...running.map((r) => r.endMin));
    clock = next;
    for (let i = running.length - 1; i >= 0; i--) {
      if (running[i].endMin <= clock) {
        const t = running[i].task;
        running.splice(i, 1);
        if (t.gpus === 0) runningCpu--;
        events.push({
          t: clock,
          jobId: t.jobId,
          type: "COMPLETED",
          detail: `${t.label} 完成（sacct: COMPLETED, elapsed ${(t.endMin - t.startMin).toFixed(1)} min）`,
        });
        // free GPUs
        const perNode = new Map<number, number>();
        for (const id of t.gpuIds) {
          const n = Number(id.slice(1, id.indexOf(":")));
          perNode.set(n, (perNode.get(n) ?? 0) + 1);
        }
        for (const [n, c] of perNode) freeGpus[n] += c;
        remainingPerKey.set(t.jobKey, (remainingPerKey.get(t.jobKey) ?? 1) - 1);
      }
    }
    allDone = tasks.every((t) => t.started && t.endMin <= clock);
  }

  const makespan = Math.max(0, ...tasks.map((t) => t.endMin));
  // round up to whole minutes for sampling
  const sampleEnd = Math.max(1, Math.ceil(makespan));

  const utilizationSeries: { t: number; busy: number; total: number }[] = [];
  for (let m = 0; m <= sampleEnd; m++) {
    let busy = 0;
    for (const t of tasks) {
      if (t.gpus === 0) continue;
      const overlap = Math.max(0, Math.min(t.endMin, m) - Math.max(t.startMin, m - 1));
      busy += overlap * t.gpus;
    }
    utilizationSeries.push({ t: m, busy, total: capacity });
  }

  const gpuMinutes = tasks.reduce((acc, t) => acc + t.gpus * (t.endMin - t.startMin), 0);
  const gpuUtilization = capacity > 0 && makespan > 0 ? gpuMinutes / (capacity * makespan) : 0;
  const waits = tasks.filter((t) => t.started).map((t) => t.startMin - t.eligibleAt);
  const avgWait = waits.length > 0 ? waits.reduce((a, b) => a + b, 0) / waits.length : 0;

  const outTasks: SimTask[] = tasks
    .map((t) => ({
      jobId: t.jobId,
      jobKey: t.jobKey,
      label: t.label,
      category: t.category,
      arrayIndex: t.arrayIndex,
      gpus: t.gpus,
      nodeIds: t.nodeIds,
      gpuIds: t.gpuIds,
      startMin: Math.round(t.startMin * 10) / 10,
      endMin: Math.round(t.endMin * 10) / 10,
      waitMin: Math.round((t.startMin - t.eligibleAt) * 10) / 10,
      waitReason: t.waitReason || (t.startMin > t.eligibleAt ? "GPU 资源排队" : "依赖就绪即启动"),
      state: "COMPLETED" as const,
    }))
    .sort((a, b) => a.startMin - b.startMin || a.jobId.localeCompare(b.jobId, undefined, { numeric: true }));

  events.sort((a, b) => a.t - b.t || a.jobId.localeCompare(b.jobId, undefined, { numeric: true }));

  return {
    stats: {
      makespanMin: Math.round(makespan * 10) / 10,
      gpuUtilization,
      avgQueueWaitMin: Math.round(avgWait * 10) / 10,
      totalJobs: tasks.length,
      gpuMinutes: Math.round(gpuMinutes * 10) / 10,
      clusterGpuCapacity: capacity,
      backfilledJobs: backfillCountTotal,
      strategy: backfill ? "easy-backfill" : "strict-fifo",
    },
    tasks: outTasks,
    events,
    utilizationSeries,
    notes: [
      `调度策略：${backfill ? "优先级 FIFO + EASY backfill（预约安全：回填作业必须先于队首预约启动点完成）" : "严格 FIFO（未启用 backfill，队首资源阻塞整条 GPU 队列）"}。`,
      `${cluster.gpuModel} 加速比按 ${speed === 1 ? "1.0×" : speed + "×"} 估算作业时长（A100=1.0×，H100=0.6×）。`,
      `CPU 作业（ctffind array 等 --gres=gpu:0）不占用 GPU 池，独立分轨就绪即启动。`,
      `GPU 占用率 = Σ(作业 GPU 数 × 运行时长) / (集群 GPU 总数 × makespan)。`,
      `模拟为无副作用纯计算，真实集群中由 squeue/sacct 轮询回填同样的事件流。`,
    ],
  };
}

export { tryAllocate };
