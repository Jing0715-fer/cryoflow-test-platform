import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ENGINE_BASE = "http://localhost:3001";
const PROBE_TIMEOUT_MS = 2500;

interface EngineProjectStats {
  total: number;
  running: number;
  pending: number;
  completed: number;
  failed: number;
}

interface EngineProject {
  id: string;
  name: string;
  mode: string;
  engine?: string;
  createdAt?: string;
  stats?: EngineProjectStats;
}

export interface EngineStatusResponse {
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
      stats: EngineProjectStats;
    }[];
  };
  jobs?: EngineProjectStats;
}

async function probeJson(path: string): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`${ENGINE_BASE}${path}`, {
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

export async function GET() {
  const probedAt = new Date().toISOString();
  try {
    // fire both probes; system is authoritative for liveness, projects enriches
    const [sysRaw, projRaw] = await Promise.allSettled([
      probeJson("/api/system"),
      probeJson("/api/projects"),
    ]);

    if (sysRaw.status !== "fulfilled") {
      throw sysRaw.reason instanceof Error ? sysRaw.reason : new Error("engine unreachable");
    }
    const sys = sysRaw.value as {
      found?: boolean;
      version?: string | null;
      execution?: string | null;
      path?: string | null;
    };

    const emptyStats: EngineProjectStats = { total: 0, running: 0, pending: 0, completed: 0, failed: 0 };
    let projects: EngineStatusResponse["projects"];
    let jobs: EngineProjectStats = { ...emptyStats };

    if (projRaw.status === "fulfilled") {
      const list = ((projRaw.value as { projects?: EngineProject[] }).projects ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        mode: p.mode,
        createdAt: p.createdAt ?? null,
        stats: p.stats ?? { ...emptyStats },
      }));
      projects = { count: list.length, items: list };
      jobs = list.reduce<EngineProjectStats>(
        (acc, p) => ({
          total: acc.total + p.stats.total,
          running: acc.running + p.stats.running,
          pending: acc.pending + p.stats.pending,
          completed: acc.completed + p.stats.completed,
          failed: acc.failed + p.stats.failed,
        }),
        { ...emptyStats }
      );
    }

    const body: EngineStatusResponse = {
      online: true,
      probedAt,
      relion: {
        found: sys.found ?? false,
        version: sys.version ?? null,
        execution: sys.execution ?? null,
        path: sys.path ?? null,
      },
      ...(projects ? { projects } : {}),
      ...(projects ? { jobs } : {}),
    };
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const body: EngineStatusResponse = {
      online: false,
      probedAt,
      error: err instanceof Error ? err.message : "unknown probe error",
    };
    return NextResponse.json(body, { status: 200, headers: { "Cache-Control": "no-store" } });
  }
}
