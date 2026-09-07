import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import type { TestResults } from "@/lib/types";

export const dynamic = "force-dynamic";

const EMPTY_SKELETON: TestResults = {
  meta: {},
  summary: { total: 36, passed: 0, failed: 0, external: 0, pending: 36 },
  jobs: [],
};

export async function GET() {
  const file = path.join(process.cwd(), "db", "test-results.json");
  try {
    const text = await readFile(file, "utf-8");
    const json = JSON.parse(text) as TestResults;
    return NextResponse.json(json, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch {
    // File missing / partially written by the main agent → serve skeleton so
    // the UI renders the full pending matrix instead of erroring out.
    return NextResponse.json(EMPTY_SKELETON, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  }
}
