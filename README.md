# CryoFlow Test Platform — 36-Job Full Test Report + HPC/Slurm Scheduling Design

> Live report platform for the [CryoFlow](https://github.com/Jing0715-fer/cryoflow) engine:
> every one of the 36 job types executed against **real EMPIAR-10017 data**, plus a complete
> **HPC / Slurm cluster integration design** (simulator + SBATCH generator + architecture).

**中文说明**：本项目是 CryoFlow 引擎的全面测试报告平台（EMPIAR-10017 真实数据，36 类 job 全量测试，
含 topaz / DynaMight / ctffind / RELION 5.0.1 外部依赖实测）与 HPC/Slurm 调度设计平台。
测试期间发现并修复的 6 个引擎缺陷（F1–F6）已提交回上游 cryoflow 仓库。

## What was tested

| Scope | Detail |
|---|---|
| Engine | CryoFlow (Next.js + Prisma + RELION engine), 36 job types = 26 SPA + 10 tomography |
| Real data | [EMPIAR-10017](https://www.ebi.ac.uk/empiar/EMPIAR-10017/) — 10 micrographs (584 MB) + 84 coordinate files (5,539 picks) |
| External apps | `relion 5.0.1` (built from source, CPU+MPICH), `topaz 0.3.20` (real CNN training + autopick), `ctffind 4.1.14`, `DynaMight` (source build, CPU VAE training), ModelAngelo (honestly unavailable — needs GPU) |
| Result | 37 records · 34 pass / 0 fail · 1 sequential-limit · 1 known-gap · failures classified as `input-unavailable` (EMPIAR publishes motion-corrected static micrographs → no movie frames for MotionCorr/Polish) |

Six engine defects found during testing (F1–F6), all fixed and pushed back to the upstream repo:
topaz training-pick ingestion, MPI-parallel sequential fallback, half-map synthesis for postprocess,
RELION 5 per-iteration star collection, and more — see the Findings section in the app.

## Platform sections

1. **Hero** — environment cards, live KPIs, progress banner
2. **Test matrix** — all 36 job types, per-run command / artifacts / logs, status badges, failures-only filter
3. **Topaz deep-dive** — dependency chain, data flow, real training curves
4. **HPC architecture** — 3-tier design (gateway / scheduler / nodes), GPU strategy table
5. **Slurm simulator** — event-driven scheduler (priority FIFO + `afterok` DAG + GPU pool + array jobs), Gantt timeline, GPU utilization curve, event stream
6. **SBATCH generator** — production-ready submission scripts with annotated line-by-line explanations

## Data contract

The platform is a **read-only reporter**: it polls `db/test-results.json` (written by the test harness
driving the real engine at `:3001`) every 5 s. API routes:

- `GET /api/test-results` — live test results
- `POST /api/hpc/simulate` — run the Slurm cluster simulator (zod-validated)
- `POST /api/hpc/sbatch` — generate annotated SBATCH scripts

## Run it

```bash
bun install
bun run dev        # http://localhost:3000
```

The upstream engine + test harness live in the [cryoflow](https://github.com/Jing0715-fer/cryoflow) repo
(`docs/hpc-slurm-design.md` is the full HPC design document there).

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · shadcn/ui · TanStack Query · zod
