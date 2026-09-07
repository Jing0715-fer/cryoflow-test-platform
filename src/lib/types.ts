// Shared data contracts for the CryoFlow test report & HPC platform.

export type JobLevel = "real" | "engine-native" | "external-unavailable" | "input-unavailable" | "pending";
export type JobStatus = "pass" | "fail" | "pending";

export interface TestJob {
  key: string;
  name: string;
  category: string;
  level: JobLevel;
  status: JobStatus;
  command?: string;
  durationSec?: number;
  artifacts?: string[];
  result?: string;
  notes?: string;
  logs?: string[];
}

export interface TestResults {
  meta: {
    startedAt?: string;
    updatedAt?: string;
    findings?: Finding[];
    environment?: {
      relion?: string;
      topaz?: string;
      ctffind?: string;
      mpi?: string;
      data?: string;
      host?: string;
    };
  };
  summary: { total: number; passed: number; failed: number; external: number; pending: number };
  jobs: TestJob[];
}

export interface Finding {
  id: string;
  severity: "high" | "medium" | "info";
  title: string;
  symptom: string;
  rootCause: string;
  fix: string;
  status: "fixed" | "workaround" | "not-a-bug";
}

// ---------------------------------------------------------------------------
// HPC simulator contracts
// ---------------------------------------------------------------------------

export type GpuModel = "A100" | "H100";

export interface SimClusterConfig {
  partitions: number;
  nodes: number;
  gpusPerNode: number;
  gpuModel: GpuModel;
  defaultTimeMin: number;
}

export interface SimJob {
  key: string;
  name: string;
  category: string;
  gpus: number;
  durationMin: number;
  deps: string[];
  arrayCount?: number; // >1 → Slurm array job with arrayCount sub-tasks
  timeLimitMin: number;
}

export interface SimulateRequest {
  cluster: SimClusterConfig;
  jobs: SimJob[];
}

export interface SimTask {
  /** Slurm-style job id, array tasks look like "2_4". */
  jobId: string;
  jobKey: string;
  label: string;
  category: string;
  arrayIndex: number | null;
  gpus: number;
  nodeIds: number[];
  gpuIds: string[];
  startMin: number;
  endMin: number;
  waitMin: number;
  waitReason: string;
  state: "COMPLETED";
}

export interface SimEvent {
  t: number;
  jobId: string;
  type: "SUBMITTED" | "DEPS-CLEARED" | "ALLOCATED" | "RUNNING" | "COMPLETED";
  detail: string;
}

export interface SimulateResponse {
  stats: {
    makespanMin: number;
    gpuUtilization: number; // 0..1
    avgQueueWaitMin: number;
    totalJobs: number;
    gpuMinutes: number;
    clusterGpuCapacity: number;
  };
  tasks: SimTask[];
  events: SimEvent[];
  utilizationSeries: { t: number; busy: number; total: number }[];
  notes: string[];
}

// ---------------------------------------------------------------------------
// SBATCH generator contracts
// ---------------------------------------------------------------------------

export type SbatchJobType =
  | "motioncorr-array"
  | "topaztrain"
  | "class2d"
  | "refine3d"
  | "class3d-screening"
  | "ctffind-array";

export interface SbatchRequest {
  jobType: SbatchJobType;
  partition: string;
  account: string;
  gpus: number;
  nodes: number;
  timeLimitMin: number;
  arraySlices: number;
}

export interface SbatchResponse {
  script: string;
  annotations: { line: number; note: string }[];
}
