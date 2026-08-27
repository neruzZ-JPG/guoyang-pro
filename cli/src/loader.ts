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
    throw new Error(`企业名录文件缺失: ${fp}`);
  }
  return (rosterCache = JSON.parse(readFileSync(fp, "utf-8")) as EnterpriseRoster);
}

export function allEnterprises(): Enterprise[] {
  return loadRoster().enterprises;
}

export function findEnterprise(query: string): Enterprise | undefined {
  const q = query.trim();
  if (!q) return undefined;
  const ents = allEnterprises();
  const exact =
    ents.find((e) => e.id === q) ||
    ents.find((e) => e.short === q || e.name === q) ||
    ents.find((e) => e.aliases?.includes(q));
  if (exact) return exact;

  // 短/宽泛查询（如“中国”）不随意返回排序最前的一家；仅唯一候选时才匹配。
  if (q.length < 3) return undefined;
  const candidates = ents.filter((e) =>
    e.name.includes(q) ||
    q.includes(e.name),
  );
  return candidates.length === 1 ? candidates[0] : undefined;
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
    throw new Error(`岗位元数据文件缺失: ${fp}`);
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
  if (!existsSync(fp)) {
    if (loadPosMeta().years.includes(year)) {
      throw new Error(`岗位元数据声明了 ${year} 年，但分片文件缺失: ${fp}`);
    }
    yearCache.set(year, []);
    return [];
  }
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
    if (f.education && !educationEligible(p.education, f.education)) return false;
    if (f.major && !majorEligible(p.major, f.major)) return false;
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

function educationRank(value: string): number | undefined {
  if (/博士/.test(value)) return 4;
  if (/硕士|研究生/.test(value)) return 3;
  if (/本科|学士/.test(value)) return 2;
  if (/大专|专科|高职/.test(value)) return 1;
  if (/高中|中专/.test(value)) return 0;
  return undefined;
}

/** candidateEducation 为求职者学历；岗位“不限”或求职者学历达到最低门槛即匹配。 */
export function educationEligible(requirement: string, candidateEducation: string): boolean {
  if (!requirement || /未标注|未知/.test(requirement)) return false;
  if (/不限|无要求/.test(requirement)) return true;
  const candidate = educationRank(candidateEducation);
  if (candidate === undefined) return false;
  const tokenRanks = [...requirement.matchAll(/博士|硕士|研究生|本科|学士|大专|专科|高职|高中|中专/g)]
    .map((match) => educationRank(match[0]))
    .filter((rank): rank is number => rank !== undefined);
  if (tokenRanks.length > 0) {
    const uniqueRanks = [...new Set(tokenRanks)];
    const excluded = [...requirement.matchAll(
      /(?:不含|不包括|排除)(博士|硕士|研究生|本科|学士|大专|专科|高职|高中|中专)|(博士|硕士|研究生|本科|学士|大专|专科|高职|高中|中专)除外/g,
    )]
      .map((match) => educationRank(match[1] || match[2]))
      .filter((rank): rank is number => rank !== undefined);
    if (excluded.includes(candidate)) return false;
    if (/仅限|仅招|最高学历.{0,6}(?:要求|为|须为)|必须是/.test(requirement)) {
      return uniqueRanks.includes(candidate);
    }
    if (/至|到|[-~～—]/.test(requirement) && uniqueRanks.length > 1) {
      return candidate >= Math.min(...uniqueRanks) && candidate <= Math.max(...uniqueRanks);
    }
    if (/及以下/.test(requirement)) return candidate <= Math.max(...uniqueRanks);
    if (/以下/.test(requirement)) return candidate < Math.max(...uniqueRanks);
    if (/及以上|以上/.test(requirement)) return candidate >= Math.min(...uniqueRanks);
    if (uniqueRanks.length > 1 && /[、,，/]|或者|或/.test(requirement)) {
      return uniqueRanks.includes(candidate);
    }
    return candidate >= uniqueRanks[0];
  }
  return requirement.includes(candidateEducation) || candidateEducation.includes(requirement);
}

export function majorEligible(positionMajor: string, userMajor: string): boolean {
  if (!positionMajor || /未标注|未知/.test(positionMajor)) return false;
  if (positionMajor.includes("不限")) return true;
  const exclusions = [
    ...positionMajor.matchAll(/(?:不含|不包括|排除)([^，,；;。)）]+)|除([^，,；;。)）]+)外/g),
  ].map((match) => (match[1] || match[2] || "").trim()).filter(Boolean);
  if (exclusions.some((item) => item.includes(userMajor) || userMajor.includes(item))) return false;
  if (/其他专业|其余专业/.test(positionMajor)) return true;
  const familyAliases: Record<string, string[]> = {
    "计算机类": ["计算机", "软件工程", "网络工程", "信息安全", "数据科学", "人工智能"],
    "电子信息类": ["电子信息", "通信工程", "电子科学", "微电子", "集成电路"],
    "机械类": ["机械", "车辆工程", "工业设计", "机电"],
    "材料类": ["材料", "冶金", "高分子"],
    "法学类": ["法学", "法律", "知识产权"],
    "经济学类": ["经济学", "金融", "财政", "国际经济"],
  };
  for (const [family, aliases] of Object.entries(familyAliases)) {
    if (positionMajor.includes(family) && aliases.some((alias) => userMajor.includes(alias))) return true;
  }
  const normalized = positionMajor.replace(/[;；,，、/]/g, "|");
  return normalized.split("|").some(
    (m) => {
      const token = m.trim();
      return !!token && (token.includes(userMajor) || userMajor.includes(token));
    },
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
  if (!existsSync(fp)) throw new Error(`招聘时间线文件缺失: ${fp}`);
  return (calendarCache = JSON.parse(readFileSync(fp, "utf-8")) as CalendarEntry[]);
}
