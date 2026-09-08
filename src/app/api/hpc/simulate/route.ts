import { NextResponse } from "next/server";
import { z } from "zod";
import { simulate } from "@/lib/hpc/simulator";

export const dynamic = "force-dynamic";

const ClusterSchema = z.object({
  partitions: z.number().int().min(1).max(8),
  nodes: z.number().int().min(1).max(64),
  gpusPerNode: z.number().int().min(1).max(16),
  gpuModel: z.enum(["A100", "H100"]),
  defaultTimeMin: z.number().int().min(1).max(10080),
});

const JobSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  gpus: z.number().int().min(0).max(256),
  durationMin: z.number().min(0.1).max(10080),
  deps: z.array(z.string()).default([]),
  arrayCount: z.number().int().min(1).max(64).optional(),
  timeLimitMin: z.number().int().min(1).max(10080),
});

const BodySchema = z.object({
  cluster: ClusterSchema,
  jobs: z.array(JobSchema).min(1).max(64),
  backfill: z.boolean().optional().default(false),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", detail: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") },
        { status: 400 }
      );
    }
    const result = simulate(parsed.data.cluster, parsed.data.jobs, { backfill: parsed.data.backfill });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "模拟器内部错误";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
