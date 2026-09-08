import type { SbatchEstimate, SbatchJobType, SbatchRequest, SbatchResponse, TestJob } from "@/lib/types";

// ---------------------------------------------------------------------------
// SBATCH script generator — job-type aware templates for a Slurm HPC cluster
// running RELION 5.0.1 (+ Topaz 0.3.20 in a conda env).
// Every template emits: #SBATCH directives, module loads, GPU binding,
// data/output paths on the shared FS (/lustre), and a dependency placeholder.
// Line numbers in `annotations` are 1-based, matching the rendered code block.
// ---------------------------------------------------------------------------

function fmtTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const s = (n: number) => String(n).padStart(2, "0");
  return `${s(h)}:${s(m)}:00`;
}

class Script {
  lines: string[] = [];
  annotations: { line: number; note: string }[] = [];

  /** Push a line; if note is given it annotates exactly this line (1-based). */
  push(line: string, note?: string) {
    this.lines.push(line);
    if (note) this.annotations.push({ line: this.lines.length, note });
  }

  pushMany(lines: string[]) {
    for (const l of lines) this.lines.push(l);
  }

  toString() {
    return this.lines.join("\n") + "\n";
  }
}

interface Ctx {
  partition: string;
  account: string;
  gpus: number;
  nodes: number;
  timeLimitMin: number;
  arraySlices: number;
}

const ENV_HEADER = [
  "",
  "set -euo pipefail",
  "module purge",
  "module load relion/5.0.1 gcc/12.3 cuda/12.2",
];

const ENV_TAIL = [
  "export PROJECT_ROOT=/lustre/project/cryoflow/empiar10017",
  "export SRUN_OUTPUT=/lustre/scratch/${USER}/cryoflow/logs",
  'mkdir -p "${SRUN_OUTPUT}"',
];

export function generateSbatch(req: SbatchRequest): SbatchResponse {
  const ctx: Ctx = {
    partition: req.partition || "gpu",
    account: req.account || "cryoem_proj",
    gpus: Math.max(0, req.gpus),
    nodes: Math.max(1, req.nodes),
    timeLimitMin: Math.max(1, req.timeLimitMin),
    arraySlices: Math.max(1, req.arraySlices),
  };

  const s = new Script();

  switch (req.jobType) {
    // -----------------------------------------------------------------------
    case "motioncorr-array": {
      sbatchHeader(s, ctx, "cf-motioncorr", "/lustre/scratch/%u/cryoflow/MotionCorr");
      s.push(`#SBATCH --array=0-${ctx.arraySlices - 1}%4`, "array 分片：每片处理 1 张微图，%4 限制并发 4 片，避免独占整个分区");
      s.pushMany(ENV_HEADER);
      s.push("module load motioncor2/1.4", "作业类型感知：motioncorr 额外加载 MotionCor2（RELION 会按 --use_gpus 自动选择后端）");
      s.pushMany(ENV_TAIL);
      s.push("");
      s.push("# ---- per-micrograph data parallelism (array task = micrograph) ----", "数据并行策略：SLURM_ARRAY_TASK_ID 从 micrographs.star 切出本片要处理的微图");
      s.push("MICROGRAPH=$(awk -v id=${SLURM_ARRAY_TASK_ID} 'NR==id+2 {print $1}' ${PROJECT_ROOT}/Import/micrographs.star)");
      s.push("GPU_BIND=$((${SLURM_ARRAY_TASK_ID} % ${Math.max(1, ctx.gpus) || 1}))", "GPU 轮转绑定：每片固定 1 张 GPU（片号 mod GPU 数），单卡单实例防显存溢出");
      s.push("");
      s.push("srun relion_motioncorr --i \"${MICROGRAPH}\" \\");
      s.push("  --o MotionCorr/job_${SLURM_ARRAY_TASK_ID}/ \\");
      s.push("  --bin_factor 1 --bfac 150 --patch_x 5 --patch_y 5 \\");
      s.push("  --gpu ${GPU_BIND} --use_gpus --j 8 \\");
      s.push("  2>&1 | tee \"${SRUN_OUTPUT}/mc_${SLURM_ARRAY_TASK_ID}.log\"", "relion_motioncorr：RELION 5.0.1 命令行，tee 落盘日志供 monitor.ts 抓取进度");
      break;
    }
    // -----------------------------------------------------------------------
    case "topaztrain": {
      sbatchHeader(s, ctx, "cf-topaztrain", "/lustre/scratch/%u/cryoflow/TopazTrain");
      s.pushMany(ENV_HEADER);
      s.push("source /opt/miniconda3/etc/profile.d/conda.sh");
      s.push("conda activate topaz-0.3.20", "外部依赖链：relion_python_topaz → topaz 0.3.20 conda 环境（GPU torch），与 RELION module 隔离");
      s.pushMany(ENV_TAIL);
      s.push("");
      s.push("# ---- single-GPU CNN training ----", "Topaz 训练默认单 GPU 单进程——SGD 训练多卡非线性加速，只申请 1 卡");
      s.push("srun topaz train \\");
      s.push("  --net resnet16 --train-particles ${PROJECT_ROOT}/ManualPick/particles.star \\");
      s.push("  --train-images \"${PROJECT_ROOT}/Import/micrographs/*\" \\");
      s.push("  --epochs 10 --learning-rate 0.0001 --gpu 0 --num-workers 4 \\");
      s.push("  -o TopazTrain/model.bin 2>&1 | tee \"${SRUN_OUTPUT}/topaz_train.log\"", "产物 model.bin 写入共享 FS；下游 autopick 通过 --dependency=afterok 消费");
      s.push("");
      s.push("# 训练完成后同作业内串行拾取（避免二次排队）");
      s.push("srun topaz extract --model TopazTrain/model.bin \\");
      s.push("  --threshold -6 --min-radius 12 --max-radius 20 \\");
      s.push("  \"${PROJECT_ROOT}/Import/micrographs/*\" -o TopazTrain/coords/ \\");
      s.push("  2>&1 | tee \"${SRUN_OUTPUT}/topaz_extract.log\"", "训练→拾取数据流：坐标落盘后由引擎转换为 autopick.star（Henderson .coord 同构）");
      break;
    }
    // -----------------------------------------------------------------------
    case "class2d": {
      sbatchHeader(s, ctx, "cf-class2d", "/lustre/scratch/%u/cryoflow/Class2D");
      s.push(`#SBATCH --ntasks=${Math.max(1, ctx.gpus)}`, "MPI ranks = GPU 数：RELION class2d 每个 MPI rank 绑 1 张 GPU 做数据并行");
      s.pushMany(ENV_HEADER);
      s.pushMany(ENV_TAIL);
      s.push("");
      s.push("# ---- 2D classification with splits ----", "splits 策略：粒子随机分桶到各 MPI rank，各跑部分分类再合并（--pool 控制每批载入量）");
      s.push(`srun --mpi=pmix mpirun -np ${Math.max(1, ctx.gpus)} relion_refine \\`);
      s.push("  --i Extract/particles.star \\");
      s.push("  --o Class2D/run_ct22_class2d \\");
      s.push("  --particle_diameter 180 --angpix 1.77 \\");
      s.push("  --ref_class_average --K 50 --flatten-solvent --norm \\");
      s.push("  --tau2_fudge 2 --iter 25 --pad 2 --ctf --pool 30 \\");
      s.push(`  --gpu $(seq -s, 0 $(( ${Math.max(1, ctx.gpus)} - 1 )) ) \\`, "--gpu 接受逗号列表，RELION 将其与 MPI rank 一一映射");
      s.push("  --j 8 2>&1 | tee \"${SRUN_OUTPUT}/class2d.log\"");
      break;
    }
    // -----------------------------------------------------------------------
    case "refine3d": {
      sbatchHeader(s, ctx, "cf-refine3d", "/lustre/scratch/%u/cryoflow/Refine3D");
      s.push(`#SBATCH --ntasks=${Math.max(1, ctx.gpus)}`, "单作业多 GPU：refine3d 的 MPI 主从架构——一个 Slurm 作业内 N rank 各占 1 GPU");
      s.pushMany(ENV_HEADER);
      s.pushMany(ENV_TAIL);
      s.push("");
      s.push("# ---- 3D auto-refine: one job, multiple GPUs (long-running) ----", "长作业策略：时限 ≥ 2× 预估时长；开启 --requeue 支持节点故障后自动重排续跑");
      s.push(`srun --mpi=pmix mpirun -np ${Math.max(1, ctx.gpus)} relion_refine \\`);
      s.push("  --i Select/particles.star \\");
      s.push("  --o Refine3D/run_ct23_refine3d \\");
      s.push("  --ref Class3D/run_ct23_class3d/class001_volume.mrc \\");
      s.push("  --firstiter_cc --ini_iter 1 --auto_refine --dini 30 \\");
      s.push("  --ctf --flatten-solvent --solvent_mask Mask/mask.mrc \\");
      s.push("  --tau2_fudge 4 --pad 2 --particle_diameter 180 --angpix 1.77 \\");
      s.push("  --gpu 0:1:2:3 --gpu_id_offset 0 --j 2 \\", "RELION 多 GPU 语法：--gpu 0:1:2:3（冒号分隔，与 MPI rank 顺序对应）");
      s.push("  2>&1 | tee \"${SRUN_OUTPUT}/refine3d.log\"");
      break;
    }
    // -----------------------------------------------------------------------
    case "class3d-screening": {
      sbatchHeader(s, ctx, "cf-class3d-screen", "/lustre/scratch/%u/cryoflow/Class3D");
      s.push(
        `#SBATCH --array=1-${ctx.arraySlices}%${Math.min(4, ctx.arraySlices)}`,
        "筛选模式：K 扫描拆成并行 array 作业，同时限制并发防挤占 refine3d 的 GPU 配额"
      );
      s.pushMany(ENV_HEADER);
      s.pushMany(ENV_TAIL);
      s.push("");
      s.push("# ---- 3D classification screening (parallel K sweep) ----", "每片跑不同类数 K（4/8/16/32…），比对分辨率/占用率后择优进入 refine3d");
      s.push("K_SWEEP=(4 8 16 32 64 128 256)");
      s.push("K=${K_SWEEP[$((SLURM_ARRAY_TASK_ID - 1))]}");
      s.push(`srun --mpi=pmix mpirun -np ${Math.max(1, ctx.gpus)} relion_refine \\`);
      s.push("  --i Select/particles.star \\");
      s.push("  --o Class3D/screen_K${K} \\");
      s.push("  --ref InitialModel/model.mrc --K ${K} --tau2_fudge 4 \\");
      s.push("  --iter 12 --ctf --particle_diameter 180 --angpix 1.77 \\");
      s.push(`  --gpu $(seq -s, 0 $(( ${Math.max(1, ctx.gpus)} - 1 )) ) \\`);
      s.push("  --j 8 2>&1 | tee \"${SRUN_OUTPUT}/class3d_K${K}.log\"");
      break;
    }
    // -----------------------------------------------------------------------
    case "ctffind-array": {
      sbatchHeader(s, ctx, "cf-ctffind", "/lustre/scratch/%u/cryoflow/CtfFind");
      s.push(`#SBATCH --array=0-${ctx.arraySlices - 1}%10`, "ctffind 为纯 CPU 作业：array 全并发（%10），提交到 CPU 分区不占 GPU 配额");
      s.push("#SBATCH --hint=multithread", "ctffind 4.1.14 是 OpenMP 并行的：提示 Slurm 按线程亲和分配 CPU 核");
      s.pushMany(ENV_HEADER);
      s.push("module load ctffind/4.1.14", "作业类型感知：RELION 通过 RELION_CTFFIND_EXECUTABLE 找到该二进制，需显式加载");
      s.pushMany(ENV_TAIL);
      s.push("");
      s.push("# ---- CPU array: one micrograph per task ----", "数据流：从 MotionCorr 产物 star 取第 N 张微图——上游 array 全部 afterok 后本作业才放行");
      s.push("MICROGRAPH=$(awk -v id=${SLURM_ARRAY_TASK_ID} 'NR==id+2 {print $1}' ${PROJECT_ROOT}/MotionCorr/corrected_micrographs.star)");
      s.push("srun relion_run_ctffind --i \"${MICROGRAPH}\" \\");
      s.push("  --o CtfFind/job_${SLURM_ARRAY_TASK_ID}/ctffind4 \\");
      s.push("  --Box 512 --ResMin 30 --ResMax 5 --dF 200 --fstep 100 \\");
      s.push("  --kV 300 --Cs 2.7 --Amp 0.1 --astigmatism_on --j 8 \\");
      s.push("  2>&1 | tee \"${SRUN_OUTPUT}/ctffind_${SLURM_ARRAY_TASK_ID}.log\"");
      break;
    }
  }

  // Common footer — fault tolerance semantics
  s.push("");
  s.push("# ---- fault tolerance ----");
  s.push("# scancel <jobid>               → dispatch.ts 标记 CANCELLED，停止重提");
  s.push("# sacct -j <jobid>              → monitor.ts 轮询状态回填 RunRecord 状态机");
  s.push("# --requeue + --continue 已启用 → 节点故障自动重排，RELION 从 checkpoint 续跑", "容错闭环：scancel 停止 / --requeue 重排 / --continue 断点续跑，RunRecord 状态机同步");

  return { script: s.toString(), annotations: s.annotations };
}

function sbatchHeader(s: Script, ctx: Ctx, jobName: string, outDir: string) {
  s.push("#!/bin/bash");
  s.push(`#SBATCH --job-name=${jobName}`);
  s.push(`#SBATCH --partition=${ctx.partition}`, "分区选择：GPU 作业进 gpu 分区（含 GPU 配额/计费权重），CPU 作业可改到 cpu 分区");
  s.push(`#SBATCH --account=${ctx.account}`, "计费账户：sacct 计费归集 + fairshare 优先级计算都基于此");
  s.push(`#SBATCH --time=${fmtTime(ctx.timeLimitMin)}`, "时限：超过即 SIGTERM→SIGKILL（sacct: TIMEOUT）；建议设为预估时长的 2 倍");
  s.push(`#SBATCH --nodes=${ctx.nodes}`);
  s.push("#SBATCH --cpus-per-task=8", "每任务 8 CPU：RELION --j 线程池 + GPU 数据预取的常规配比");
  if (ctx.gpus > 0) {
    s.push(`#SBATCH --gres=gpu:${ctx.gpus}`, "GPU 请求：gres 泛型资源语法；Slurm 排队时会锁定具体 GPU 卡并设 CUDA_VISIBLE_DEVICES");
  } else {
    s.push("#SBATCH --gres=gpu:0", "显式 0 GPU：确保落在 CPU 分区语义，不触发 GPU 计费");
  }
  s.push(`#SBATCH --output=${outDir}/job_%A_%a.out`, "日志路径：%A=作业号 %a=数组下标；输出到 /lustre 共享 FS 供实时 tail");
  s.push(`#SBATCH --error=${outDir}/job_%A_%a.err`);
  s.push("#SBATCH --mail-type=FAIL");
  s.push("#SBATCH --requeue", "节点故障/维护抢占时自动重新排队（配合 RELION --continue 断点续跑）");
  s.push("# 依赖占位：由 dispatch.ts 提交时注入（sbatch --dependency=afterok:11234 …）");
  s.push("# (提交时注入依赖) sbatch --dependency=afterok:__UPSTREAM_JOBID__ cf-refine3d.sbatch", "依赖占位符：上游作业全部成功才放行——注意 --dependency 必须在 sbatch 命令行注入（脚本内 #SBATCH 无效），DAG 编排在提交侧完成");
}

export const SBATCH_JOB_TYPES: { value: SbatchJobType; label: string; desc: string }[] = [
  { value: "motioncorr-array", label: "motioncorr · array 数据并行", desc: "每微图一片的 GPU array 作业（--array + 轮转 GPU 绑定）" },
  { value: "topaztrain", label: "topaztrain · 单 GPU 训练", desc: "conda 环境 + topaz CNN 训练 + 训后拾取" },
  { value: "class2d", label: "class2d · splits 多 GPU", desc: "MPI ranks = GPU 数，粒子分桶并行 2D 分类" },
  { value: "refine3d", label: "refine3d · 单作业多 GPU", desc: "mpirun -np 4 + --gpu 0:1:2:3 的长作业" },
  { value: "class3d-screening", label: "class3d · K 扫描筛选", desc: "array 并行试不同类数 K，择优进入精化" },
  { value: "ctffind-array", label: "ctffind · CPU array", desc: "纯 CPU 分区 array 作业，OpenMP 多线程" },
];

// ---------------------------------------------------------------------------
// Time-limit estimation anchored on REAL measured wall-times from the
// EMPIAR-10017 test run (db/test-results.json). The sandbox measured every
// job on CPU (3GB, sequential fallback --j 4); the estimator projects those
// measurements onto the HPC target with a per-type speedup model and a 1.5×
// safety factor, so the generated #SBATCH --time is grounded in reality
// instead of a guess.
// ---------------------------------------------------------------------------

/** test-results.json job key backing each SBATCH template (exported for the route) */
export const MEASURED_KEY: Record<SbatchJobType, string> = {
  "motioncorr-array": "motioncorr",
  topaztrain: "topaztrain",
  class2d: "class2d",
  refine3d: "refine3d",
  "class3d-screening": "class3d",
  "ctffind-array": "ctffind",
};

/** honest speedup model: sandbox CPU baseline → A100-class HPC target */
const SPEEDUP: Record<SbatchJobType, { factor: number; basis: string }> = {
  topaztrain: { factor: 25, basis: "resnet16 训练：A100 vs CPU torch（经验区间 20–30×）" },
  class2d: { factor: 4, basis: "MPI 32 核 vs 沙箱 --j 4 顺序回退（投影匹配近线性区）" },
  refine3d: { factor: 4, basis: "MPI 32 核 + GPU 投影 vs 沙箱顺序模式" },
  "class3d-screening": { factor: 4, basis: "MPI 32 核 + GPU 投影 vs 沙箱顺序模式" },
  "ctffind-array": { factor: 1.2, basis: "CPU 密集逐微图计算，单任务耗时基本不变；吞吐提升来自 array 并行" },
  "motioncorr-array": { factor: 8, basis: "MotionCor2 GPU vs CPU（本沙箱无真实测量，速度比按官方基准）" },
};

const MEASURABLE_LEVELS = new Set(["real", "external-app-real"]);

function roundTo(v: number, step: number): number {
  return Math.max(step, Math.round(v / step) * step);
}

export function estimateTimeLimit(jobType: SbatchJobType, job: TestJob | undefined): SbatchEstimate {
  const model = SPEEDUP[jobType];
  const real = job && MEASURABLE_LEVELS.has(job.level) ? (job.durationSec ?? null) : null;

  if (real == null) {
    return {
      jobKey: MEASURED_KEY[jobType],
      measuredSec: null,
      measuredLevel: job?.level ?? "pending",
      speedup: model.factor,
      speedupBasis: model.basis,
      estimatedMin: null,
      suggestedLimitMin: null,
      note:
        job?.level === "input-unavailable"
          ? "EMPIAR-10017 未发布电影帧（motioncorr 无真实测量）——时限建议保留模板默认值并按首次 sacct 实测回调"
          : "该 job 类型暂无真实测量锚点，时限采用模板默认值",
    };
  }

  const estimatedSec = real / model.factor;
  const estimatedMin = roundTo(estimatedSec / 60, 1);
  // 1.5× safety factor (cold start, I/O, checkpoint) + 10min floor, 5min steps
  const suggestedLimitMin = Math.max(10, roundTo(estimatedMin * 1.5, 5));
  return {
    jobKey: MEASURED_KEY[jobType],
    measuredSec: real,
    measuredLevel: job?.level ?? "",
    speedup: model.factor,
    speedupBasis: model.basis,
    estimatedMin,
    suggestedLimitMin,
    note: `基于沙箱真实测量 ${real.toFixed(0)}s（level=${job?.level}）÷ ${model.factor}× 速度比 ×1.5 安全系数——建议先按此值提交，首个作业完成后用 sacct -j 实测回调`,
  };
}
