#!/usr/bin/env node
// cli/src/index.ts — 国央企 PRO 命令路由。zero-dependency,数据为脊柱,AI 驱动对话。
import {
  loadRoster, findEnterprise, filterEnterprises,
  loadPosMeta, loadYear, resolveYear, filterPositions, latestYear,
  loadCalendar,
} from "./loader.js";
import { recommend } from "./recommend.js";
import { matchPositions } from "./match.js";
import {
  livePositionDetail, liveSearch, matchEnterprise, type LiveResult,
} from "./live.js";
import { ADAPTERS, liveAdapters } from "./adapters/index.js";
import {
  cachedPositionById, loadPositionSnapshot, positionCacheKey, positionCachePath,
  savePositionCache,
} from "./cache.js";
import {
  loadMemory, setPrefs, addWatched, clearMemory, memoryPath, logEvent,
} from "./memory.js";
import {
  TIERS, SECTORS, REGULATORS,
  EMPLOYMENT_TYPES, resolveRecruitType, resolveSector,
  type Position, type RecruitType,
} from "./codes.js";
import { isTty, formatEnterprises, formatPositions } from "./format.js";

const VERSION = "0.2.0";

const HELP = `
guoyang-pro v${VERSION}
用 Claude Code 规划你的国央企求职。

Usage: guoyang-pro <verb> [flags]

名录:
  enterprises   央企/国企名录(按梯队/行业筛)
                  --tier <T0|T1|T2|T3>  求职热度梯队
                  --sector <行业>  能源电力/金融银行/烟草/电信运营 ...
                  --regulator <监管>  sasac国资委/mof财政部/烟草/铁路/地方
                  --keyword <text>  --limit <N>
  enterprise    单个企业详情 + 其在招岗位
                  <名称/简称/id>  或  --name <text>  [--cache-only]

岗位 (实时;岗位像大厂一样每天变动,默认实时拉取各源):
  search        搜索在招岗位
                  --enterprise <企业>  --tier <梯队>  --sector <行业>
                  --type <校招|社招|实习>  --education <学历>  --major <专业>
                  --location <城市>  --employment <在编/正式|劳务派遣>
                  --keyword <text>  --limit <N>  --scan-limit <N>
                  --cache-only  仅查询24小时内实时缓存(不联网)
                  --offline  仅用本地快照(不联网),--year <年> 指定快照年份
  detail        岗位详情  --id <id>  [--year <离线快照年>]
                  缓存未命中时按来源实时查询详情(当前支持国聘裸ID/iguopin:ID)

规划:
  recommend     冲/稳/保(启发式估算:梯队+学历门槛 vs 院校层级+学历)
                  --education <学历>  --school-tier <985|211|双一流|普通本科>
                  --major  --location  --sector  --type
  match         智能匹配(基于意向)  --sector --location --major --type
                  --education  --keywords <k1,k2>
  hot           当前扫描样本聚合  --by sector|tier  [--offline --year]
  cold          当前样本内招录较多岗位  --top <N>  [--offline --year]
  calendar      国央企招聘时间线/投递日历  [--sector <行业>] [--type 校招|社招]
  stats         统计概览(披露 complete/partial_sample)  [--offline --year]

记忆:
  memory list   列出记忆
  memory set    设置画像  --education 本科 --school-tier 211 --sector 金融银行
  memory watch  关注  --kind enterprise|position --id <id> [--year] [--note]
  memory clear  清除

Meta:
  help / version / selftest
  sources       实时检查数据源健康与字段质量 [--static 仅看配置]
  tiers         梯队说明
  sectors       行业列表
  regulators    监管主体列表
`.trim();

function parseFlags(args: string[]): { positional: string[]; flags: Record<string, string> } {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      const body = a.slice(2);
      const eq = body.indexOf("=");
      if (eq > 0) {
        flags[body.slice(0, eq)] = body.slice(eq + 1) || "true";
        continue;
      }
      const key = body;
      const next = args[i + 1];
      if (next && !next.startsWith("--")) { flags[key] = next; i++; }
      else flags[key] = "true";
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

function printJson(value: unknown) { console.log(JSON.stringify(value, null, 2)); }

function countBy<T extends Record<string, unknown>>(arr: T[], key: keyof T): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of arr) {
    const val = String(item[key] ?? "unknown");
    counts[val] = (counts[val] ?? 0) + 1;
  }
  return counts;
}

function resolveRegulatorFlag(flag?: string): string | undefined {
  if (!flag) return undefined;
  if (flag in REGULATORS) return (REGULATORS as Record<string, string>)[flag];
  if ((Object.values(REGULATORS) as string[]).includes(flag)) return flag;
  throw new Error(`未知监管主体: ${flag};运行 guoyang-pro regulators 查看可选值`);
}

function positiveInt(value: string | undefined, fallback: number, name: string, max: number): number {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > max) {
    throw new Error(`--${name} 必须是 1-${max} 的整数`);
  }
  return n;
}

function validatedTier(value?: string): string | undefined {
  if (!value) return undefined;
  const tier = value.toUpperCase();
  if (!(tier in TIERS)) throw new Error(`未知梯队: ${value};可选 ${Object.keys(TIERS).join("/")}`);
  return tier;
}

function validatedSector(value?: string): string | undefined {
  if (!value) return undefined;
  const sector = resolveSector(value);
  if (!sector) throw new Error(`未知行业: ${value};运行 guoyang-pro sectors 查看可选值`);
  return sector;
}

function validatedRecruitType(value?: string): RecruitType | undefined {
  if (!value) return undefined;
  const type = resolveRecruitType(value);
  if (!type) throw new Error(`未知招聘类型: ${value};可选 校招/社招/实习/未标注`);
  return type;
}

function validatedEmployment(value?: string): string | undefined {
  if (!value) return undefined;
  if (!(EMPLOYMENT_TYPES as readonly string[]).includes(value)) {
    throw new Error(`未知用工性质: ${value};可选 ${EMPLOYMENT_TYPES.join("/")}`);
  }
  return value;
}

function validatedSchoolTier(value?: string): string | undefined {
  if (!value) return undefined;
  const allowed = [
    "985", "211", "C9", "双一流", "双一流A", "普通本科",
    "一本", "二本", "三本", "专科", "海外", "海外名校", "QS100",
  ];
  if (!allowed.some((item) => value.toLowerCase() === item.toLowerCase())) {
    throw new Error(`未知院校层级: ${value};可选 ${allowed.join("/")}`);
  }
  return value;
}

function validatedYear(value?: string): number {
  if (!value) return resolveYear();
  if (!/^\d{4}$/.test(value)) throw new Error("--year 必须是四位年份");
  const year = Number(value);
  if (year < 2000 || year > new Date().getFullYear() + 2) {
    throw new Error(`--year 超出合理范围: ${value}`);
  }
  return resolveYear(year);
}

function validateYearMode(flags: Record<string, string>): void {
  if (flags.year && flags.offline !== "true") {
    throw new Error("--year 仅用于 --offline 随包快照；实时与缓存岗位按抓取时间查询");
  }
}

const FLAGS_BY_VERB: Record<string, readonly string[]> = {
  help: [], version: [], tiers: [], sectors: [], regulators: [], selftest: [],
  enterprises: ["tier", "sector", "regulator", "keyword", "limit", "format"],
  enterprise: ["name", "year", "limit", "scan-limit", "offline", "cache-only"],
  search: [
    "enterprise", "tier", "sector", "type", "education", "major", "location",
    "employment", "keyword", "limit", "scan-limit", "offline", "year",
    "cache-only", "format",
  ],
  sources: ["static"],
  detail: ["id", "year"],
  recommend: [
    "education", "school-tier", "major", "location", "sector", "type", "year",
    "limit", "scan-limit", "offline", "cache-only",
  ],
  match: [
    "education", "major", "location", "sector", "type", "keywords", "year",
    "limit", "scan-limit", "offline", "cache-only",
  ],
  hot: ["by", "year", "limit", "scan-limit", "offline", "cache-only"],
  cold: ["year", "top", "limit", "scan-limit", "offline", "cache-only"],
  calendar: ["sector", "type"],
  stats: ["year", "limit", "scan-limit", "offline", "cache-only"],
  memory: [
    "education", "major", "school-tier", "political", "location", "sector",
    "recruit-type", "type", "kind", "id", "year", "note", "label",
  ],
};

function validateFlagNames(verb: string, flags: Record<string, string>): void {
  const allowed = new Set(FLAGS_BY_VERB[verb] ?? []);
  const unknown = Object.keys(flags).filter((key) => !allowed.has(key));
  if (unknown.length) {
    throw new Error(`未知参数: ${unknown.map((key) => `--${key}`).join(", ")}`);
  }
  const booleanFlags = new Set(["offline", "cache-only", "static"]);
  const invalidBooleans = Object.entries(flags)
    .filter(([key, value]) => booleanFlags.has(key) && value !== "true")
    .map(([key]) => `--${key}`);
  if (invalidBooleans.length) {
    throw new Error(`布尔参数不接受值: ${invalidBooleans.join(", ")}`);
  }
  const missingValues = Object.entries(flags)
    .filter(([key, value]) => value === "true" && !booleanFlags.has(key))
    .map(([key]) => `--${key}`);
  if (missingValues.length) {
    throw new Error(`参数缺少值: ${missingValues.join(", ")}`);
  }
}

type QueryMeta = {
  mode: "live" | "cache" | "offline";
  fetched_at?: string;
  cache_updated_at?: string;
  degraded: boolean;
  complete: boolean;
  snapshot_complete_at_fetch?: boolean;
  scanned: number;
  sources?: LiveResult["sources"];
  fallback_sources?: LiveResult["sources"];
  note?: string;
};

function queryParams(flags: Record<string, string>, defaultLimit = 50) {
  const enterprise = flags.enterprise;
  const matchedEnterprise = enterprise ? matchEnterprise(enterprise) : undefined;
  const knownEnterprise = matchedEnterprise?.confidence === "exact"
    ? matchedEnterprise?.enterprise
    : undefined;
  const limit = positiveInt(flags.limit, defaultLimit, "limit", 500);
  const defaultScanLimit = Math.min(Math.max(limit * 20, 1000), 5000);
  const scanLimit = positiveInt(flags["scan-limit"], defaultScanLimit, "scan-limit", 5000);
  if (scanLimit < limit) {
    throw new Error("--scan-limit 不能小于 --limit");
  }
  return {
    keyword: flags.keyword,
    sector: validatedSector(flags.sector),
    location: flags.location,
    recruit_type: validatedRecruitType(flags.type),
    enterprise: knownEnterprise ? undefined : enterprise,
    enterprise_hint: knownEnterprise?.name ?? enterprise,
    enterprise_id: knownEnterprise?.id,
    tier: validatedTier(flags.tier),
    education: flags.education,
    major: flags.major,
    employment_type: validatedEmployment(flags.employment),
    limit,
    scan_limit: scanLimit,
  };
}

async function positionPool(
  flags: Record<string, string>,
  options: {
    defaultLimit?: number;
    allowCache?: boolean;
    preserveAllOffline?: boolean;
  } = {},
): Promise<{ positions: Position[]; meta: QueryMeta }> {
  validateYearMode(flags);
  const year = validatedYear(flags.year);
  const params = queryParams(flags, options.defaultLimit ?? 50);
  const queryKey = positionCacheKey(params);
  if (flags["cache-only"] === "true" && flags.offline === "true") {
    throw new Error("--cache-only 与 --offline 不能同时使用");
  }
  if (flags["cache-only"] === "true") {
    const snapshot = loadPositionSnapshot(queryKey, 24, params.limit, params.scan_limit);
    if (!snapshot) throw new Error("没有与当前查询条件匹配的 24 小时缓存；请先运行相同条件的实时 search");
    return {
      positions: snapshot.positions.slice(0, params.limit),
      meta: {
        mode: "cache", cache_updated_at: snapshot.updated_at, degraded: false,
        complete: false, snapshot_complete_at_fetch: snapshot.complete,
        scanned: 0, sources: snapshot.sources,
        note: "显式 --cache-only：仅使用 24 小时内实时缓存，未访问网络",
      },
    };
  }
  if (flags.offline === "true") {
    const meta = loadPosMeta();
    if (!meta.years.includes(year)) {
      throw new Error(
        `当前包不含 ${year} 年离线岗位快照；请移除 --offline 使用实时源，或先导入快照`,
      );
    }
    const matched = filterPositions(loadYear(year), {
      enterprise_id: params.enterprise_id,
      enterprise: params.enterprise,
      tier: params.tier,
      sector: params.sector,
      recruit_type: params.recruit_type,
      education: params.education,
      major: params.major,
      location: params.location,
      employment_type: params.employment_type,
      keyword: params.keyword,
    });
    const positions = options.preserveAllOffline ? matched : matched.slice(0, params.limit);
    return {
      positions,
      meta: {
        mode: "offline", degraded: false, complete: true, scanned: matched.length,
        note: "显式 --offline：仅使用随包快照",
      },
    };
  }

  const live = await liveSearch(params);
  if (live.ok) {
    if (live.positions.length === 0 && live.degraded && options.allowCache !== false) {
      const snapshot = loadPositionSnapshot(queryKey, 24, params.limit, params.scan_limit);
      if (snapshot) {
        return {
          positions: snapshot.positions.slice(0, params.limit),
          meta: {
            mode: "cache", cache_updated_at: snapshot.updated_at, degraded: true,
            complete: false, snapshot_complete_at_fetch: snapshot.complete,
            scanned: live.scanned, sources: snapshot.sources,
            fallback_sources: live.sources,
            note: "实时扫描未命中且覆盖不完整，已回退到 24 小时内本地缓存",
          },
        };
      }
    }
    savePositionCache(
      queryKey, live.positions, live.sources, live.complete, params.limit, params.scan_limit,
    );
    return {
      positions: live.positions,
      meta: {
        mode: "live", fetched_at: live.fetched_at, degraded: live.degraded,
        complete: live.complete, scanned: live.scanned, sources: live.sources,
        note: live.complete
          ? "已确认扫描到所有启用源的列表末尾"
          : "结果来自实时扫描窗口；未扫到底时不能据此断言全源无更多岗位",
      },
    };
  }

  if (options.allowCache !== false) {
    const snapshot = loadPositionSnapshot(queryKey, 24, params.limit, params.scan_limit);
    if (snapshot) {
      return {
        positions: snapshot.positions.slice(0, params.limit),
        meta: {
          mode: "cache", cache_updated_at: snapshot.updated_at, degraded: true,
          complete: false, snapshot_complete_at_fetch: snapshot.complete,
          scanned: live.scanned, sources: snapshot.sources,
          fallback_sources: live.sources,
          note: "所有实时源失败，已回退到 24 小时内本地缓存",
        },
      };
    }
  }

  const error = new Error("所有实时源均失败，且没有可用的新鲜缓存");
  (error as Error & { sources?: LiveResult["sources"] }).sources = live.sources;
  throw error;
}

type VerbFn = (flags: Record<string, string>, positional: string[]) => Promise<void> | void;

const VERBS: Record<string, VerbFn> = {
  help() { console.log(HELP); },
  version() { console.log(VERSION); },

  tiers() { printJson(Object.entries(TIERS).map(([id, desc]) => ({ id, desc }))); },
  sectors() { printJson([...SECTORS]); },
  regulators() { printJson(Object.entries(REGULATORS).map(([id, name]) => ({ id, name }))); },

  enterprises(flags) {
    const results = filterEnterprises({
      tier: validatedTier(flags.tier),
      sector: validatedSector(flags.sector),
      regulator: resolveRegulatorFlag(flags.regulator),
      keyword: flags.keyword,
    });
    const limit = positiveInt(flags.limit, 50, "limit", 500);
    const sliced = results.slice(0, limit);
    if (isTty() && flags.format !== "json") {
      console.log(`共 ${results.length} 家企业 (显示前 ${sliced.length})\n`);
      console.log(formatEnterprises(sliced));
    } else {
      printJson({ total: results.length, enterprises: sliced });
    }
  },

  async enterprise(flags, positional) {
    const q = flags.name || positional[0];
    if (!q) { console.error("用法: guoyang-pro enterprise <名称/简称/id>"); process.exitCode = 1; return; }
    const ent = findEnterprise(q);
    if (!ent && q.trim().length < 4) {
      throw new Error(`企业查询过于宽泛: ${q};请提供更完整的公司名称`);
    }
    const result = await positionPool(
      { ...flags, enterprise: ent?.id ?? q, limit: flags.limit ?? "50" },
      { defaultLimit: 50 },
    );
    const discoveredNames = [...new Set(result.positions.map((p) => p.enterprise_name))];
    const discovered = !ent
      ? {
          query: q,
          in_static_roster: false,
          discovered_from_live_positions: discoveredNames.length > 0,
          recruiting_entities: discoveredNames,
          note: "该查询未命中静态母集团名录；以下信息仅来自当前实时/缓存岗位，不代表官方名录收录。",
        }
      : undefined;
    if (!ent && result.positions.length === 0) {
      printJson({
        ok: false,
        error: result.meta.complete
          ? `未找到招聘主体: ${q}`
          : `当前扫描窗口未找到招聘主体: ${q};可提高 --scan-limit 后重试`,
        enterprise: discovered,
        data: result.meta,
        positions_count: 0,
        positions: [],
      });
      process.exitCode = 1;
      return;
    }
    printJson({
      ok: true,
      enterprise: ent ?? discovered,
      data: result.meta,
      positions_count: result.positions.length,
      positions: result.positions,
    });
  },

  async search(flags) {
    const result = await positionPool(flags, { defaultLimit: 50 });
    const sliced = result.positions;
    if (isTty() && flags.format !== "json") {
      const tip = result.meta.mode === "live"
        ? `实时${result.meta.degraded ? "/部分覆盖" : ""}`
        : result.meta.mode === "cache" ? "24h缓存/实时源失败" : "本地快照";
      console.log(`命中 ${sliced.length} 个岗位 [${tip};扫描 ${result.meta.scanned} 条]\n`);
      console.log(formatPositions(sliced));
    } else {
      printJson({ ok: true, total: sliced.length, data: result.meta, positions: sliced });
    }
  },

  async sources(flags) {
    if (flags.static === "true") {
      printJson({
        total: ADAPTERS.length,
        configured_live: liveAdapters().length,
        adapters: ADAPTERS.map((a) => ({
          id: a.id, name: a.name, homepage: a.homepage, scopes: a.scopes,
          configured_live: a.live, kind: a.kind, priority: a.priority,
          coverage: a.coverage, disabled_reason: a.disabled_reason,
          quality: a.quality,
        })),
      });
      return;
    }
    const checkedAt = new Date().toISOString();
    const activeAdapters = liveAdapters();
    const settled = await Promise.allSettled(
      activeAdapters.map((adapter) => adapter.fetch({ limit: 1, scan_limit: 100 })),
    );
    const healthById = new Map<string, {
      ok: boolean;
      count: number;
      scanned: number;
      fetched_at?: string;
      note?: string;
      error?: string;
    }>();
    settled.forEach((item, index) => {
      const adapter = activeAdapters[index];
      if (item.status === "fulfilled") {
        const result = item.value;
        healthById.set(adapter.id, {
          ok: result.ok,
          count: result.positions.length,
          scanned: result.scanned,
          fetched_at: result.fetched_at,
          note: result.note,
          error: result.error,
        });
      } else {
        healthById.set(adapter.id, {
          ok: false,
          count: 0,
          scanned: 0,
          error: String(item.reason?.message ?? item.reason),
        });
      }
    });
    const healthy = [...healthById.values()].filter((item) => item.ok).length;
    printJson({
      total: ADAPTERS.length,
      ok: healthy > 0,
      degraded: healthy !== activeAdapters.length,
      checked_at: checkedAt,
      adapters: ADAPTERS.map((a) => ({
        id: a.id, name: a.name, homepage: a.homepage, scopes: a.scopes,
        configured_live: a.live, kind: a.kind, priority: a.priority,
        coverage: a.coverage, disabled_reason: a.disabled_reason,
        quality: a.quality,
        health: healthById.get(a.id),
      })),
    });
    if (healthy === 0) process.exitCode = 2;
  },

  async detail(flags) {
    const id = flags.id;
    if (!id) { console.error("--id required"); process.exitCode = 1; return; }
    const year = validatedYear(flags.year);
    if (flags.year && !loadPosMeta().years.includes(year)) {
      throw new Error(`当前包不含 ${year} 年离线岗位快照`);
    }
    const found = flags.year
      ? loadYear(year).find((p) => p.id === id)
      : cachedPositionById(id) ?? loadYear(year).find(
          (p) => p.id === id,
        );
    if (!found && !flags.year) {
      const liveDetail = await livePositionDetail(id);
      if (liveDetail.position) {
        printJson({
          ...liveDetail.position,
          detail_mode: "live",
        });
        return;
      }
      printJson({
        ok: false,
        error: liveDetail.error ??
          `position ${id} not found in recent cache, ${year} snapshot or supported live sources`,
        cache_path: positionCachePath(),
      });
      process.exitCode = 1;
      return;
    }
    if (!found) {
      printJson({
        ok: false,
        error: `position ${id} not found in ${year} snapshot`,
        cache_path: positionCachePath(),
      });
      process.exitCode = 1;
      return;
    }
    printJson(found);
  },

  async recommend(flags) {
    const limit = positiveInt(flags.limit, 100, "limit", 500);
    const schoolTier = validatedSchoolTier(flags["school-tier"]);
    const queryFlags = { ...flags, limit: String(limit) };
    const pool = await positionPool(
      queryFlags,
      { defaultLimit: limit, preserveAllOffline: true },
    );
    const result = recommend({
      education: flags.education,
      school_tier: schoolTier,
      major: flags.major,
      location: flags.location,
      sector: validatedSector(flags.sector),
      recruit_type: validatedRecruitType(flags.type),
      year: flags.year ? validatedYear(flags.year) : undefined,
    }, pool.positions);
    try {
      logEvent("recommend", `sector=${flags.sector ?? ""} edu=${flags.education ?? ""}`);
      printJson({
        data: pool.meta,
        evaluation_scope: pool.meta.complete ? "complete" : "partial_sample",
        ...result,
      });
    } catch (error) {
      printJson({
        data: pool.meta,
        evaluation_scope: pool.meta.complete ? "complete" : "partial_sample",
        ...result,
        warning: `推荐已生成，但无法写入本地事件日志: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
    }
  },

  async match(flags) {
    const limit = positiveInt(flags.limit, 30, "limit", 500);
    const sector = validatedSector(flags.sector);
    const recruitType = validatedRecruitType(flags.type);
    const year = flags.year ? validatedYear(flags.year) : undefined;
    const requestedScanLimit = flags["scan-limit"]
      ? positiveInt(flags["scan-limit"], 500, "scan-limit", 5000)
      : undefined;
    const candidateLimit = Math.min(
      Math.max(limit * 10, 200),
      500,
      requestedScanLimit ?? 500,
    );
    const poolFlags: Record<string, string> = { ...flags, limit: String(candidateLimit) };
    delete poolFlags.sector;
    delete poolFlags.location;
    const pool = await positionPool(
      poolFlags,
      { defaultLimit: limit, preserveAllOffline: true },
    );
    const results = matchPositions({
      education: flags.education,
      major: flags.major,
      location: flags.location,
      sector,
      recruit_type: recruitType,
      keywords: flags.keywords?.split(",").map((x) => x.trim()).filter(Boolean),
      year,
    }, pool.positions);
    printJson({
      evaluated: results.length,
      returned: Math.min(results.length, limit),
      ranking_scope: pool.meta.complete ? "complete" : "partial_sample",
      data: pool.meta,
      positions: results.slice(0, limit),
    });
  },

  async hot(flags) {
    const by = flags.by ?? "sector"; // sector | tier
    if (!["sector", "tier"].includes(by)) throw new Error("--by 可选 sector 或 tier");
    const pool = await positionPool(
      { ...flags, limit: flags.limit ?? "500" },
      { defaultLimit: 500, preserveAllOffline: true },
    );
    const positions = pool.positions;
    if (positions.length === 0) {
      printJson({
        mode: "positions",
        data: pool.meta,
        note: "当前实时扫描/缓存未命中岗位；不再用企业数量冒充岗位热度",
        results: {},
      });
      return;
    }
    const key = by === "tier" ? "tier" : "sector";
    printJson({
      mode: `positions_by_${key}`,
      data: pool.meta,
      aggregation_scope: pool.meta.complete ? "complete" : "partial_sample",
      sample_size: positions.length,
      results: countBy(positions as any[], key),
    });
  },

  async cold(flags) {
    const top = positiveInt(flags.top, 20, "top", 100);
    const pool = await positionPool(
      { ...flags, limit: flags.limit ?? "500" },
      { defaultLimit: 500, preserveAllOffline: true },
    );
    const candidates = pool.positions
      .filter((p) => p.headcount >= 3 && !!p.tier && p.tier !== "T0")
      .sort((a, b) => b.headcount - a.headcount)
      .slice(0, top);
    printJson({
      data: pool.meta,
      aggregation_scope: pool.meta.complete ? "complete" : "partial_sample",
      sample_size: pool.positions.length,
      note: "仅在当前扫描样本中按公开招聘人数和已识别的非 T0 母集团梯队筛选；未知梯队不纳入，不代表真实录取概率",
      results: candidates,
    });
  },

  calendar(flags) {
    let entries = loadCalendar();
    const sector = validatedSector(flags.sector);
    const rt = validatedRecruitType(flags.type);
    if (sector) entries = entries.filter((e) => e.sector === sector || e.sector.includes(flags.sector));
    if (rt) entries = entries.filter((e) => e.recruit_type === rt);
    printJson({ total: entries.length, note: "招聘时间线为典型规律参考,以各企业当年公告为准", entries });
  },

  async stats(flags) {
    const year = flags.year ? validatedYear(flags.year) : undefined;
    const roster = loadRoster();
    const pool = await positionPool(
      { ...flags, limit: flags.limit ?? "500" },
      { defaultLimit: 500, preserveAllOffline: true },
    );
    const positions = pool.positions;
    printJson({
      year: pool.meta.mode === "offline" ? year : undefined,
      data: pool.meta,
      aggregation_scope: pool.meta.complete ? "complete" : "partial_sample",
      enterprises_total: roster.meta.total,
      enterprises_by_tier: roster.meta.by_tier,
      enterprises_by_regulator: roster.meta.by_regulator,
      positions_total: pool.meta.complete ? positions.length : undefined,
      positions_sample_size: positions.length,
      positions_by_tier: countBy(positions as any[], "tier"),
      positions_by_sector: countBy(positions as any[], "sector"),
      positions_by_recruit_type: countBy(positions as any[], "recruit_type"),
      positions_by_employment: countBy(positions as any[], "employment_type"),
    });
  },

  memory(flags, positional) {
    const sub = positional[0];
    if (sub === "list" || !sub) { printJson(loadMemory()); }
    else if (sub === "set") { printJson(setPrefs(flags)); }
    else if (sub === "watch") {
      if (!flags.id) { console.error("--id required"); process.exitCode = 1; return; }
      if (flags.kind && !["enterprise", "position"].includes(flags.kind)) {
        throw new Error("--kind 可选 enterprise 或 position");
      }
      const kind = (flags.kind ?? "enterprise") as "enterprise" | "position";
      if (kind === "enterprise" && !findEnterprise(flags.id)) {
        throw new Error(`未找到企业: ${flags.id}`);
      }
      if (kind === "position" && !cachedPositionById(flags.id)) {
        throw new Error(`近期缓存中未找到岗位: ${flags.id};请先运行 search`);
      }
      const label = flags.label ?? flags.id;
      printJson(addWatched(
        kind, flags.id, label, flags.year ? validatedYear(flags.year) : undefined, flags.note,
      ));
    }
    else if (sub === "clear") { printJson(clearMemory()); }
    else { console.error(`unknown memory subcommand: ${sub}`); process.exitCode = 1; }
  },

  selftest() {
    const roster = loadRoster();
    const meta = loadPosMeta();
    const calendar = loadCalendar();
    const actualTierCounts = countBy(roster.enterprises as any[], "tier");
    const actualRegulatorCounts = countBy(roster.enterprises as any[], "regulator");
    const countsEqual = (a: Record<string, number>, b: Record<string, number>) => {
      const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
      return [...keys].every((key) => (a[key] ?? 0) === (b[key] ?? 0));
    };
    const errors: string[] = [];
    if (roster.meta.version !== VERSION) {
      errors.push(`名录版本 ${roster.meta.version} 与 CLI ${VERSION} 不一致`);
    }
    if (meta.version !== VERSION) {
      errors.push(`岗位元数据版本 ${meta.version} 与 CLI ${VERSION} 不一致`);
    }
    if (roster.enterprises.length === 0) errors.push("企业名录为空或缺失");
    if (roster.meta.total !== roster.enterprises.length) {
      errors.push(`名录 meta.total=${roster.meta.total} 与实际 ${roster.enterprises.length} 不一致`);
    }
    if (!countsEqual(roster.meta.by_tier, actualTierCounts)) {
      errors.push("名录梯队统计与实际企业不一致");
    }
    if (!countsEqual(roster.meta.by_regulator, actualRegulatorCounts)) {
      errors.push("名录监管统计与实际企业不一致");
    }
    if (!roster.meta.sources?.length) errors.push("企业名录缺少来源元数据");
    if (new Set(roster.enterprises.map((enterprise) => enterprise.id)).size !== roster.enterprises.length) {
      errors.push("企业名录包含重复 id");
    }
    if (new Set(roster.enterprises.map((enterprise) => enterprise.name)).size !== roster.enterprises.length) {
      errors.push("企业名录包含重复名称");
    }
    if (calendar.length === 0) errors.push("招聘时间线为空或缺失");
    let shardTotal = 0;
    for (const year of meta.years) {
      const positions = loadYear(year);
      shardTotal += positions.length;
      if (positions.length !== (meta.per_year[year] ?? -1)) {
        errors.push(`${year} 分片数量与 meta.per_year 不一致`);
      }
      if (positions.some((position) => position.year !== year)) {
        errors.push(`${year} 分片包含错误年份岗位`);
      }
    }
    if (shardTotal !== meta.total_positions) {
      errors.push(`岗位分片合计 ${shardTotal} 与 meta.total_positions=${meta.total_positions} 不一致`);
    }
    if (errors.length) {
      printJson({ ok: false, errors });
      process.exitCode = 1;
      return;
    }
    console.log(`✓ 名录: ${roster.meta.total} 家企业 (梯队 ${JSON.stringify(roster.meta.by_tier)})`);
    if (meta.years.length) {
      const ly = latestYear();
      console.log(`✓ 岗位: ${meta.total_positions} 个,年份 ${meta.years.join(",")}`);
      console.log(`✓ 最新年 ${ly}: ${loadYear(ly).length} 个岗位 (懒加载分片)`);
    } else {
      console.log(`  (本地快照为空;岗位默认走实时源)`);
    }
    console.log(`✓ 实时源配置: ${liveAdapters().length}/${ADAPTERS.length} 已启用 (运行 sources 做真实健康检查)`);
    console.log(`✓ 时间线: ${calendar.length} 条`);
    console.log(`✓ 记忆路径: ${memoryPath()}`);
    console.log(`✓ 岗位缓存: ${positionCachePath()}`);
  },
};

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) { VERBS.help({}, []); return; }
  const verb = args[0];
  const { positional, flags } = parseFlags(args.slice(1));
  const fn = VERBS[verb];
  if (!fn) { console.error(`unknown verb: ${verb}. Run 'guoyang-pro help'.`); process.exitCode = 1; return; }
  try {
    validateFlagNames(verb, flags);
    const maxPositionals = verb === "enterprise" || verb === "memory" ? 1 : 0;
    if (positional.length > maxPositionals) {
      throw new Error(`多余位置参数: ${positional.slice(maxPositionals).join(" ")}`);
    }
    await fn(flags, positional);
  } catch (e: any) {
    printJson({ ok: false, error: e.message, sources: e.sources });
    process.exitCode = 1;
  }
}

main();
