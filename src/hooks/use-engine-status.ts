"use client";

import { useQuery } from "@tanstack/react-query";

export interface EngineStatus {
  online: boolean;
  probedAt: string;
  error?: string;
  relion?: {
    found: boolean;
    version: string | null;
    execution: string | null;
    path: string | null;
  };
  projects?: {
    count: number;
    items: {
      id: string;
      name: string;
      mode: string;
      createdAt: string | null;
      stats: { total: number; running: number; pending: number; completed: number; failed: number };
    }[];
  };
  jobs?: { total: number; running: number; pending: number; completed: number; failed: number };
}

const OFFLINE: EngineStatus = { online: false, probedAt: "" };

async function fetchEngineStatus(): Promise<EngineStatus> {
  const res = await fetch("/api/engine-status", { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as EngineStatus;
}

export function useEngineStatus(pollMs = 5000) {
  const query = useQuery<EngineStatus>({
    queryKey: ["engine-status"],
    queryFn: fetchEngineStatus,
    refetchInterval: pollMs,
    retry: 1,
    retryDelay: 2000,
    placeholderData: (prev) => prev,
    staleTime: 3000,
  });
  return { status: query.data ?? OFFLINE, query };
}
