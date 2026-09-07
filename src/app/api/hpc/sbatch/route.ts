import { NextResponse } from "next/server";
import { z } from "zod";
import { generateSbatch } from "@/lib/hpc/sbatch";

export const dynamic = "force-dynamic";

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
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "SBATCH 生成失败" }, { status: 400 });
  }
}
