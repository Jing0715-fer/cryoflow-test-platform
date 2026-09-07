"use client";

import { useQuery } from "@tanstack/react-query";
import type { TestResults } from "@/lib/types";
import { mergeCatalog, summarize, type MergedJob } from "@/lib/job-catalog";

const EMPTY: TestResults = {
  meta: {},
  summary: { total: 36, passed: 0, failed: 0, external: 0, pending: 36 },
  jobs: [],
};

async function fetchResults(): Promise<TestResults> {
  const res = await fetch("/api/test-results", { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<TestResults>;
}

export interface TestReport {
  raw: TestResults;
  jobs: MergedJob[];
  stats: ReturnType<typeof summarize>;
  updatedAtLabel: string;
  isLive: boolean;
}

export function useTestResults(pollMs = 5000) {
  const query = useQuery<TestResults>({
    queryKey: ["test-results"],
    queryFn: fetchResults,
    refetchInterval: pollMs,
    retry: 2,
    retryDelay: (attempt) => Math.min(1500 * 2 ** attempt, 6000),
    placeholderData: (prev) => prev, // keeps last data on refetch error → no white screen
    staleTime: 3000,
  });

  const data = query.data ?? EMPTY;
  const jobs = mergeCatalog(data.jobs);
  const stats = summarize(jobs);

  let updatedAtLabel = "等待首个数据包…";
  if (data.meta?.updatedAt) {
    const d = new Date(data.meta.updatedAt);
    updatedAtLabel = isNaN(d.getTime())
      ? data.meta.updatedAt
      : `${d.toLocaleTimeString("zh-CN", { hour12: false })}（${d.toLocaleDateString("zh-CN")}）`;
  }

  return {
    query,
    report: {
      raw: data,
      jobs,
      stats,
      updatedAtLabel,
      isLive: (data.jobs?.length ?? 0) > 0,
    } satisfies TestReport,
  };
}
