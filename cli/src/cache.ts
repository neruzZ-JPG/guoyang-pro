// cli/src/cache.ts — 实时岗位的短期本地缓存。
// 用于网络降级、search 后 detail，以及让多个规划命令共享最近一次可信结果。
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { Position } from "./codes.js";
import { isPositionOpen, type SourceStatus } from "./live.js";
import type { FetchParams } from "./adapters/types.js";

const CACHE_FILE = join(homedir(), ".guoyangpro", "cache", "positions.json");
const CACHE_VERSION = 2;
const MAX_ENTRIES = 5_000;
const MAX_QUERIES = 100;
const FUTURE_SKEW_MS = 5 * 60 * 1000;

export type CachedQuery = {
  updated_at: string;
  complete: boolean;
  requested_limit: number;
  scan_limit: number;
  sources: SourceStatus[];
  positions: Position[];
};

export type PositionCache = {
  version: number;
  updated_at: string;
  positions: Position[]; // 仅供 detail 按 id 查找
  queries: Record<string, CachedQuery>;
};

export function positionCachePath(): string {
  return CACHE_FILE;
}

function validAge(timestamp: string, maxAgeHours: number): boolean {
  const time = Date.parse(timestamp);
  if (!Number.isFinite(time)) return false;
  const age = Date.now() - time;
  return age >= -FUTURE_SKEW_MS && age <= maxAgeHours * 60 * 60 * 1000;
}

export function positionCacheKey(params: FetchParams): string {
  return JSON.stringify({
    keyword: params.keyword ?? "",
    sector: params.sector ?? "",
    location: params.location ?? "",
    recruit_type: params.recruit_type ?? "",
    enterprise: params.enterprise ?? "",
    enterprise_id: params.enterprise_id ?? "",
    tier: params.tier ?? "",
    education: params.education ?? "",
    major: params.major ?? "",
    employment_type: params.employment_type ?? "",
  });
}

export function loadPositionCache(maxAgeHours = 24): PositionCache | null {
  try {
    const parsed = JSON.parse(readFileSync(CACHE_FILE, "utf-8")) as PositionCache;
    const queriesValid = parsed.queries &&
      typeof parsed.queries === "object" &&
      !Array.isArray(parsed.queries) &&
      Object.values(parsed.queries).every((query) =>
        !!query &&
        typeof query === "object" &&
        typeof query.updated_at === "string" &&
        typeof query.complete === "boolean" &&
        Number.isInteger(query.requested_limit) &&
        query.requested_limit >= 1 &&
        Number.isInteger(query.scan_limit) &&
        query.scan_limit >= query.requested_limit &&
        Array.isArray(query.sources) &&
        Array.isArray(query.positions),
      );
    if (
      parsed.version !== CACHE_VERSION ||
      !Array.isArray(parsed.positions) ||
      !queriesValid ||
      !validAge(parsed.updated_at, maxAgeHours)
    ) return null;
    const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
    const positions = parsed.positions.filter((p) => {
      const fetchedAt = Date.parse(p.fetched_at ?? parsed.updated_at);
      return Number.isFinite(fetchedAt) &&
        fetchedAt >= cutoff &&
        fetchedAt <= Date.now() + FUTURE_SKEW_MS &&
        isPositionOpen(p);
    });
    return { ...parsed, positions };
  } catch {
    return null;
  }
}

export function savePositionCache(
  queryKey: string,
  incoming: Position[],
  sources: SourceStatus[],
  complete: boolean,
  requestedLimit: number,
  scanLimit: number,
): PositionCache {
  const previous = loadPositionCache(24 * 7);
  const updatedAt = new Date().toISOString();
  const queries = { ...(previous?.queries ?? {}) };
  queries[queryKey] = {
    updated_at: updatedAt,
    complete,
    requested_limit: requestedLimit,
    scan_limit: scanLimit,
    sources,
    positions: incoming,
  };
  const recentQueries = Object.fromEntries(
    Object.entries(queries)
      .filter(([, query]) => validAge(query.updated_at, 24 * 7))
      .sort(([, a], [, b]) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, MAX_QUERIES),
  );
  const byId = new Map<string, Position>();
  for (const query of Object.values(recentQueries).reverse()) {
    for (const position of query.positions) byId.set(position.id, position);
  }
  const positions = [...byId.values()]
    .sort((a, b) => String(b.fetched_at ?? b.posted_at ?? "")
      .localeCompare(String(a.fetched_at ?? a.posted_at ?? "")))
    .slice(0, MAX_ENTRIES);
  const state: PositionCache = {
    version: CACHE_VERSION,
    updated_at: updatedAt,
    positions,
    queries: recentQueries,
  };

  const root = join(homedir(), ".guoyangpro");
  const dir = dirname(CACHE_FILE);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(root, 0o700);
  chmodSync(dir, 0o700);
  const tmp = `${CACHE_FILE}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2), { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, CACHE_FILE);
  return state;
}

export function loadPositionSnapshot(
  queryKey: string,
  maxAgeHours = 24,
  requiredLimit = 1,
  requiredScanLimit = 1,
): CachedQuery | null {
  const cache = loadPositionCache(maxAgeHours);
  const query = cache?.queries[queryKey];
  if (
    !query ||
    !Array.isArray(query.positions) ||
    !validAge(query.updated_at, maxAgeHours) ||
    (!query.complete && (
      query.requested_limit < requiredLimit ||
      query.scan_limit < requiredScanLimit
    ))
  ) {
    return null;
  }
  return {
    ...query,
    positions: query.positions.filter((position) =>
      validAge(position.fetched_at ?? query.updated_at, maxAgeHours) &&
      isPositionOpen(position),
    ),
  };
}

export function cachedPositionById(id: string): Position | undefined {
  return loadPositionCache(24)?.positions.find((p) => p.id === id && isPositionOpen(p));
}

export function hasPositionCache(): boolean {
  return existsSync(CACHE_FILE);
}
