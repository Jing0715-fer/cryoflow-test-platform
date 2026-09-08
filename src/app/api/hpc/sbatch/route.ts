import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { z } from "zod";
import { generateSbatch, estimateTimeLimit, MEASURED_KEY } from "@/lib/hpc/sbatch";
import type { TestJob, TestResults } from "@/lib/types";

export const dynamic = "force-dynamic";

async function loadMeasuredJobs(): Promise<Map<string, TestJob>> {
  const file = path.join(process.cwd(), "db", "test-results.json");
  try {
    const text = await readFile(file, "utf-8");
    const json = JSON.parse(text) as TestResults;
    return new Map((json.jobs ?? []).map((j) => [j.key, j]));
  } catch {
    // measurement file missing → estimates degrade to template defaults
    return new Map();
  }
}

const BodySchema = z.object({
  jobType: z.enum([
    "motioncorr-array",
    "topaztrain",
    "class2d",
    "refine3d",
    "class3d-screening",
    "ctffind-array",
  ]),
  partition: z.string().min(1).max(40),
  account: z.string().min(1).max(60),
  gpus: z.number().int().min(0).max(64),
  nodes: z.number().int().min(1).max(16),
  timeLimitMin: z.number().int().min(1).max(10080),
  arraySlices: z.number().int().min(1).max(256),
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
    const result = generateSbatch(parsed.data);
    const measured = await loadMeasuredJobs();
    const estimate = estimateTimeLimit(parsed.data.jobType, measured.get(MEASURED_KEY[parsed.data.jobType]));
    return NextResponse.json({ ...result, estimate });
  } catch {
    return NextResponse.json({ error: "SBATCH 生成失败" }, { status: 400 });
  }
}
