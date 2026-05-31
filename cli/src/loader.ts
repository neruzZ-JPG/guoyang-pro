// cli/src/loader.ts
// 数据加载:企业名录(单文件)+ 岗位(按年分片 gz 懒加载)+ 招聘时间线。
// 岗位分片沿用考公验证过的方案:每年一个 <year>.json.gz,查询只解压所需年份,
// 避免全量单一 JSON 超过 node 字符串上限。v0.1 数据量小,但架构先就位。
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import type {
  Enterprise, EnterpriseRoster, Position, PositionMeta, RecruitType,
  CalendarEntry, Tier,
} from "./codes.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function dataDir(sub: string): string {
  const candidates = [
    join(__dirname, "..", "data", sub),
    join(__dirname, "..", "..", "data", sub),
    join(__dirname, "..", "..", "cli", "data", sub),
  ];
  for (const d of candidates) if (existsSync(d)) return d;
  return candidates[0];
}

// ── 企业名录 ────────────────────────────────────────────────────────
let rosterCache: EnterpriseRoster | null = null;
export function loadRoster(): EnterpriseRoster {
  if (rosterCache) return rosterCache;
  const fp = join(dataDir("enterprises"), "roster.json");
  if (!existsSync(fp)) {
    return (rosterCache = {
      meta: { version: "0", built_at: "", total: 0, by_tier: {}, by_regulator: {} },
      enterprises: [],
    });
  }
  return (rosterCache = JSON.parse(readFileSync(fp, "utf-8")) as EnterpriseRoster);
}

export function allEnterprises(): Enterprise[] {
  return loadRoster().enterprises;
}

export function findEnterprise(query: string): Enterprise | undefined {
  const q = query.trim();
  const ents = allEnterprises();
  return (
    ents.find((e) => e.id === q) ||
    ents.find((e) => e.short === q || e.name === q) ||
    ents.find((e) => e.aliases?.includes(q)) ||
    // 双向子串:e.name.includes(q) 处理查询是简称的情况;q.includes(e.name) 处理
    // 查询带后缀/分支(如"中国工商银行股份有限公司"匹配登记名"中国工商银行")的情况。
    ents.find((e) => e.name.includes(q) || q.includes(e.name) || e.short.includes(q) || q.includes(e.short))
  );
}

export type EnterpriseFilter = {
  tier?: string;
  sector?: string;
  regulator?: string;
  keyword?: string;
};

export function filterEnterprises(f: EnterpriseFilter): Enterprise[] {
  return allEnterprises().filter((e) => {
    if (f.tier && e.tier !== f.tier) return false;
    if (f.sector && String(e.sector) !== f.sector) return false;
    if (f.regulator && String(e.regulator) !== f.regulator && e.regulator !== f.regulator) return false;
    if (f.keyword) {
      const kw = f.keyword.toLowerCase();
      const hay = `${e.name} ${e.short} ${e.sector} ${e.notes ?? ""} ${(e.aliases ?? []).join(" ")}`.toLowerCase();
      if (!hay.includes(kw)) return false;
    }
    return true;
  });
}

// ── 岗位(按年分片) ─────────────────────────────────────────────────
let posMetaCache: PositionMeta | null = null;
export function loadPosMeta(): PositionMeta {
  if (posMetaCache) return posMetaCache;
  const fp = join(dataDir("positions"), "meta.json");
  if (!existsSync(fp)) {
    return (posMetaCache = {
      version: "0", built_at: "", years: [], total_positions: 0, per_year: {},
    });
  }
  return (posMetaCache = JSON.parse(readFileSync(fp, "utf-8")) as PositionMeta);
}

export function latestYear(): number {
  const years = loadPosMeta().years;
  return years.length ? Math.max(...years) : new Date().getFullYear();
}

export function resolveYear(flagYear?: string | number): number {
  if (flagYear !== undefined && flagYear !== "") {
    const y = Number(flagYear);
    if (Number.isFinite(y)) return y;
  }
  return latestYear();
}

const yearCache = new Map<number, Position[]>();
export function loadYear(year: number): Position[] {
  if (yearCache.has(year)) return yearCache.get(year)!;
  const fp = join(dataDir("positions"), `${year}.json.gz`);
  if (!existsSync(fp)) { yearCache.set(year, []); return []; }
  const parsed = JSON.parse(gunzipSync(readFileSync(fp)).toString("utf-8")) as { year: number; positions: Position[] };
  yearCache.set(year, parsed.positions);
  return parsed.positions;
}

export type PositionFilter = {
  enterprise_id?: string;
  enterprise?: string;   // 企业名/简称关键词
  tier?: string;
  sector?: string;
  recruit_type?: RecruitType;
  education?: string;
  major?: string;
  location?: string;
  employment_type?: string;
  keyword?: string;
};

export function filterPositions(positions: Position[], f: PositionFilter): Position[] {
  return positions.filter((p) => {
    if (f.enterprise_id && p.enterprise_id !== f.enterprise_id) return false;
    if (f.enterprise && !`${p.enterprise_name}`.includes(f.enterprise)) return false;
    if (f.tier && p.tier !== f.tier) return false;
    if (f.sector && p.sector !== f.sector) return false;
    if (f.recruit_type && p.recruit_type !== f.recruit_type) return false;
    if (f.education && !p.education.includes(f.education)) return false;
    if (f.major && !matchMajor(p.major, f.major)) return false;
    if (f.location && !p.work_location.includes(f.location)) return false;
    if (f.employment_type && p.employment_type !== f.employment_type) return false;
    if (f.keyword) {
      const kw = f.keyword.toLowerCase();
      const hay = `${p.enterprise_name} ${p.title} ${p.desc ?? ""} ${p.requirements ?? ""} ${p.remarks ?? ""} ${p.major}`.toLowerCase();
      if (!hay.includes(kw)) return false;
    }
    return true;
  });
}

function matchMajor(positionMajor: string, userMajor: string): boolean {
  if (!positionMajor || positionMajor.includes("不限")) return true;
  const normalized = positionMajor.replace(/[;；,，、/]/g, "|");
  return normalized.split("|").some(
    (m) => m.trim().includes(userMajor) || userMajor.includes(m.trim()),
  );
}

// 企业梯队映射(给岗位补 tier/sector 时用)
let entIndexCache: Map<string, Enterprise> | null = null;
export function enterpriseIndex(): Map<string, Enterprise> {
  if (entIndexCache) return entIndexCache;
  const m = new Map<string, Enterprise>();
  for (const e of allEnterprises()) m.set(e.id, e);
  return (entIndexCache = m);
}

export function tierOf(enterpriseId: string): Tier | undefined {
  return enterpriseIndex().get(enterpriseId)?.tier;
}

// ── 招聘时间线 ──────────────────────────────────────────────────────
let calendarCache: CalendarEntry[] | null = null;
export function loadCalendar(): CalendarEntry[] {
  if (calendarCache) return calendarCache;
  const fp = join(dataDir("calendar"), "calendar.json");
  if (!existsSync(fp)) return (calendarCache = []);
  return (calendarCache = JSON.parse(readFileSync(fp, "utf-8")) as CalendarEntry[]);
}
