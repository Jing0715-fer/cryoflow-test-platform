import type { JobLevel, JobStatus, TestJob } from "./types";

// The full 36-job catalog (26 SPA + 10 Tomo). Live entries from
// /api/test-results (db/test-results.json) are merged over these defaults so
// the matrix renders the whole grid even while the main agent is still testing.

export interface CatalogEntry {
  key: string;
  name: string;
  category: string;
  group: "SPA" | "Tomo";
}

export const JOB_CATALOG: CatalogEntry[] = [
  // ---- SPA (26) ----
  { key: "import", name: "Import Movies / Micrographs", category: "Import", group: "SPA" },
  { key: "motioncorr", name: "Motion Correction", category: "Motion", group: "SPA" },
  { key: "ctffind", name: "CTF Estimation", category: "CTF", group: "SPA" },
  { key: "manualpick", name: "Manual Picking", category: "Picking", group: "SPA" },
  { key: "autopick", name: "Auto-Picking (Topaz)", category: "Picking", group: "SPA" },
  { key: "topaztrain", name: "Topaz Train + Picking", category: "Picking", group: "SPA" },
  { key: "dynamight", name: "DynamiMatch Picking", category: "Picking", group: "SPA" },
  { key: "extract", name: "Particle Extraction", category: "Extraction", group: "SPA" },
  { key: "subtract", name: "Signal Subtraction", category: "Extraction", group: "SPA" },
  { key: "class2d", name: "2D Classification", category: "Classification", group: "SPA" },
  { key: "initialmodel", name: "Initial Model", category: "Classification", group: "SPA" },
  { key: "class3d", name: "3D Classification", category: "Classification", group: "SPA" },
  { key: "rebalance", name: "Rebalance Particles", category: "Classification", group: "SPA" },
  { key: "select", name: "Select Particles 2D/3D", category: "Orientation", group: "SPA" },
  { key: "select2d", name: "Select 2D Classes", category: "Orientation", group: "SPA" },
  { key: "joinstar", name: "Join STAR Files", category: "Orientation", group: "SPA" },
  { key: "symexpand", name: "Symmetry Expansion", category: "Orientation", group: "SPA" },
  { key: "refine3d", name: "3D Auto-Refine", category: "Refinement", group: "SPA" },
  { key: "multibody", name: "Multi-Body Refinement", category: "Refinement", group: "SPA" },
  { key: "maskcreate", name: "Mask Creation", category: "Postprocess", group: "SPA" },
  { key: "postprocess", name: "Post-Processing", category: "Postprocess", group: "SPA" },
  { key: "localres", name: "Local Resolution", category: "Postprocess", group: "SPA" },
  { key: "modelangelo", name: "ModelAngelo Model Building", category: "Postprocess", group: "SPA" },
  { key: "polish", name: "Bayesian Polishing", category: "Polish", group: "SPA" },
  { key: "ctfrefine", name: "CTF Refinement", category: "Polish", group: "SPA" },
  { key: "external", name: "External Program", category: "External", group: "SPA" },
  // ---- Tomo (10) ----
  { key: "tomo_import", name: "Tomo: Import Tilt Series", category: "Tomo", group: "Tomo" },
  { key: "tomo_aligntiltseries", name: "Tomo: Align Tilt Series", category: "Tomo", group: "Tomo" },
  { key: "tomo_tomograms", name: "Tomo: Tomograms", category: "Tomo", group: "Tomo" },
  { key: "tomo_ctfrefine", name: "Tomo: CTF Refine", category: "Tomo", group: "Tomo" },
  { key: "tomo_exclude", name: "Tomo: Exclude Tilt Images", category: "Tomo", group: "Tomo" },
  { key: "tomo_polish", name: "Tomo: Polishing", category: "Tomo", group: "Tomo" },
  { key: "tomo_reconstruct", name: "Tomo: Reconstruct", category: "Tomo", group: "Tomo" },
  { key: "tomo_denoise", name: "Tomo: Denoise", category: "Tomo", group: "Tomo" },
  { key: "tomo_picks", name: "Tomo: Picks", category: "Tomo", group: "Tomo" },
  { key: "tomo_extract", name: "Tomo: Extract Subtomograms", category: "Tomo", group: "Tomo" },
];

export const CATEGORY_ORDER = [
  "Import",
  "Motion",
  "CTF",
  "Picking",
  "Extraction",
  "Classification",
  "Orientation",
  "Refinement",
  "Postprocess",
  "Polish",
  "External",
  "Tomo",
] as const;

// Category → badge tone (border/text pairs, teal-family plus semantic accents).
export const CATEGORY_TONE: Record<string, string> = {
  Import: "text-teal-700 dark:text-teal-300 border-teal-300/60 bg-teal-50 dark:bg-teal-950/40 dark:border-teal-800/60",
  Motion: "text-cyan-700 dark:text-cyan-300 border-cyan-300/60 bg-cyan-50 dark:bg-cyan-950/40 dark:border-cyan-800/60",
  CTF: "text-emerald-700 dark:text-emerald-300 border-emerald-300/60 bg-emerald-50 dark:bg-emerald-950/40 dark:border-emerald-800/60",
  Picking: "text-violet-700 dark:text-violet-300 border-violet-300/60 bg-violet-50 dark:bg-violet-950/40 dark:border-violet-800/60",
  Extraction: "text-orange-700 dark:text-orange-300 border-orange-300/60 bg-orange-50 dark:bg-orange-950/40 dark:border-orange-800/60",
  Classification: "text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-300/60 bg-fuchsia-50 dark:bg-fuchsia-950/40 dark:border-fuchsia-800/60",
  Orientation: "text-pink-700 dark:text-pink-300 border-pink-300/60 bg-pink-50 dark:bg-pink-950/40 dark:border-pink-800/60",
  Refinement: "text-rose-700 dark:text-rose-300 border-rose-300/60 bg-rose-50 dark:bg-rose-950/40 dark:border-rose-800/60",
  Postprocess: "text-amber-700 dark:text-amber-300 border-amber-300/60 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800/60",
  Polish: "text-lime-700 dark:text-lime-300 border-lime-300/60 bg-lime-50 dark:bg-lime-950/40 dark:border-lime-800/60",
  External: "text-slate-600 dark:text-slate-300 border-slate-300/60 bg-slate-100 dark:bg-slate-800/40 dark:border-slate-700/60",
  Tomo: "text-sky-700 dark:text-sky-300 border-sky-300/60 bg-sky-50 dark:bg-sky-950/40 dark:border-sky-800/60",
};

export const LEVEL_LABEL: Record<JobLevel, string> = {
  real: "真实 RELION 执行",
  "engine-native": "引擎原生实现",
  "external-unavailable": "外部依赖不可用",
  "input-unavailable": "输入数据不含此类型",
  pending: "等待执行",
};

export interface MergedJob extends CatalogEntry {
  level: JobLevel;
  status: JobStatus;
  command?: string;
  durationSec?: number;
  artifacts?: string[];
  result?: string;
  notes?: string;
  logs?: string[];
}

export function mergeCatalog(live: TestJob[] | undefined): MergedJob[] {
  const liveMap = new Map((live ?? []).map((j) => [j.key, j]));
  return JOB_CATALOG.map((cat) => {
    const l = liveMap.get(cat.key);
    return {
      ...cat,
      level: l?.level ?? "pending",
      status: l?.status ?? "pending",
      command: l?.command,
      durationSec: l?.durationSec,
      artifacts: l?.artifacts,
      result: l?.result,
      notes: l?.notes,
      logs: l?.logs,
    };
  });
}

export function summarize(jobs: MergedJob[]) {
  const passed = jobs.filter((j) => j.status === "pass").length;
  const failed = jobs.filter((j) => j.status === "fail").length;
  const pending = jobs.filter((j) => j.status === "pending").length;
  const real = jobs.filter((j) => j.level === "real").length;
  const engineNative = jobs.filter((j) => j.level === "engine-native").length;
  const external = jobs.filter((j) => j.level === "external-unavailable").length;
  const totalSec = jobs.reduce((acc, j) => acc + (j.durationSec ?? 0), 0);
  return { total: jobs.length, passed, failed, pending, real, engineNative, external, totalSec };
}
