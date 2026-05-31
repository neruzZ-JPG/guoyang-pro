#!/usr/bin/env node
// cli/src/index.ts — 国央企 PRO 命令路由。zero-dependency,数据为脊柱,AI 驱动对话。
import {
  loadRoster, allEnterprises, findEnterprise, filterEnterprises,
  loadPosMeta, loadYear, resolveYear, filterPositions, latestYear,
  loadCalendar,
} from "./loader.js";
import { recommend } from "./recommend.js";
import { matchPositions } from "./match.js";
import { liveSearch } from "./live.js";
import { ADAPTERS, liveAdapters } from "./adapters/index.js";
import {
  loadMemory, setPrefs, addWatched, clearMemory, memoryPath, logEvent,
} from "./memory.js";
import {
  TIERS, SECTORS, REGULATORS,
  resolveRecruitType, resolveSector,
} from "./codes.js";
import { isTty, formatEnterprises, formatPositions } from "./format.js";

const VERSION = "0.1.0";

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
                  <名称/简称/id>  或  --name <text>

岗位 (实时;岗位像大厂一样每天变动,默认实时拉取各源):
  search        搜索在招岗位
                  --enterprise <企业>  --tier <梯队>  --sector <行业>
                  --type <校招|社招|实习>  --education <学历>  --major <专业>
                  --location <城市>  --employment <在编/正式|劳务派遣>
                  --keyword <text>  --limit <N>
                  --offline  仅用本地快照(不联网),--year <年> 指定快照年份
  detail        岗位详情  --id <id>  --year <年>

规划:
  recommend     冲/稳/保(启发式估算:梯队+学历门槛 vs 院校层级+学历)
                  --education <学历>  --school-tier <985|211|双一流|普通本科>
                  --major  --location  --sector  --type
  match         智能匹配(基于意向)  --sector --location --major --type
                  --education  --keywords <k1,k2>
  hot           热门(按行业/企业梯队聚合)  --by sector|tier  --year
  cold          招录多/门槛相对低的岗位  --year --top <N>
  calendar      国央企招聘时间线/投递日历  [--sector <行业>] [--type 校招|社招]
  stats         统计概览  --year

记忆:
  memory list   列出记忆
  memory set    设置画像  --education 本科 --school-tier 211 --sector 金融银行
  memory watch  关注  --kind enterprise|position --id <id> [--year] [--note]
  memory clear  清除

Meta:
  help / version / selftest
  sources       实时数据源(适配器)及接通状态
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
      const key = a.slice(2);
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
  return flag; // 允许直接传中文名
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
      tier: flags.tier,
      sector: resolveSector(flags.sector),
      regulator: resolveRegulatorFlag(flags.regulator),
      keyword: flags.keyword,
    });
    const limit = Number(flags.limit ?? 50);
    const sliced = results.slice(0, limit);
    if (isTty() && flags.format !== "json") {
      console.log(`共 ${results.length} 家企业 (显示前 ${sliced.length})\n`);
      console.log(formatEnterprises(sliced));
    } else {
      printJson({ total: results.length, enterprises: sliced });
    }
  },

  enterprise(flags, positional) {
    const q = flags.name || positional[0];
    if (!q) { console.error("用法: guoyang-pro enterprise <名称/简称/id>"); process.exitCode = 1; return; }
    const ent = findEnterprise(q);
    if (!ent) { printJson({ ok: false, error: `未找到企业: ${q}` }); process.exitCode = 1; return; }
    const year = resolveYear(flags.year);
    const positions = filterPositions(loadYear(year), { enterprise_id: ent.id });
    printJson({ enterprise: ent, year, positions_count: positions.length, positions });
  },

  async search(flags) {
    const offline = flags.offline === "true";
    const filter = {
      enterprise: flags.enterprise,
      tier: flags.tier,
      sector: resolveSector(flags.sector),
      recruit_type: resolveRecruitType(flags.type),
      education: flags.education,
      major: flags.major,
      location: flags.location,
      employment_type: flags.employment,
      keyword: flags.keyword,
    };

    let pool = [] as ReturnType<typeof loadYear>;
    let mode = "offline";
    let sourcesInfo: unknown;
    let year = resolveYear(flags.year);

    if (!offline && liveAdapters().length > 0) {
      // 岗位是时变数据 → 默认实时拉取(国央企在招岗位像大厂一样每天变动)
      const r = await liveSearch({
        keyword: flags.keyword,
        sector: resolveSector(flags.sector),
        location: flags.location,
        recruit_type: resolveRecruitType(flags.type),
        enterprise: flags.enterprise,
        limit: Number(flags.limit ?? 50),
      });
      if (r.live) { pool = r.positions; mode = "live"; sourcesInfo = r.sources; }
    }
    if (mode !== "live") {
      // 回退:本地分片快照(--offline 或 暂无已接通实时源)
      pool = loadYear(year);
      mode = "offline";
    }

    const results = filterPositions(pool, filter);
    const limit = Number(flags.limit ?? 50);
    const sliced = results.slice(0, limit);
    if (isTty() && flags.format !== "json") {
      const tip = mode === "live" ? "实时" : (liveAdapters().length ? "本地快照(--offline)" : "本地快照(实时源待接通)");
      console.log(`共 ${results.length} 个岗位 (显示前 ${sliced.length}) [${tip}]\n`);
      console.log(formatPositions(sliced));
    } else {
      printJson({ total: results.length, mode, year: mode === "offline" ? year : undefined, sources: sourcesInfo, positions: sliced });
    }
  },

  sources() {
    printJson({
      total: ADAPTERS.length,
      live: liveAdapters().length,
      note: "岗位为实时数据;live=true 表示该源已接通可实时检索",
      adapters: ADAPTERS.map((a) => ({ id: a.id, name: a.name, homepage: a.homepage, scopes: a.scopes, live: a.live })),
    });
  },

  detail(flags) {
    const year = resolveYear(flags.year);
    const id = flags.id;
    if (!id) { console.error("--id required"); process.exitCode = 1; return; }
    const found = loadYear(year).find((p) => p.id === id);
    if (!found) { printJson({ ok: false, error: `position ${id} not found in ${year}` }); process.exitCode = 1; return; }
    printJson(found);
  },

  recommend(flags) {
    const result = recommend({
      education: flags.education,
      school_tier: flags["school-tier"],
      major: flags.major,
      location: flags.location,
      sector: resolveSector(flags.sector),
      recruit_type: resolveRecruitType(flags.type),
      year: flags.year ? Number(flags.year) : undefined,
    });
    logEvent("recommend", `sector=${flags.sector ?? ""} edu=${flags.education ?? ""}`);
    printJson(result);
  },

  match(flags) {
    const results = matchPositions({
      education: flags.education,
      major: flags.major,
      location: flags.location,
      sector: resolveSector(flags.sector),
      recruit_type: resolveRecruitType(flags.type),
      keywords: flags.keywords?.split(","),
      year: flags.year ? Number(flags.year) : undefined,
    });
    const limit = Number(flags.limit ?? 30);
    printJson({ total: results.length, positions: results.slice(0, limit) });
  },

  hot(flags) {
    const year = resolveYear(flags.year);
    const by = flags.by ?? "sector"; // sector | tier
    const positions = loadYear(year);
    if (positions.length === 0) {
      // 无岗位数据时,退回到按名录聚合企业分布
      const ents = allEnterprises();
      const key = by === "tier" ? "tier" : "sector";
      printJson({
        mode: `enterprises_by_${key}`,
        note: "暂无岗位数据,按企业名录聚合",
        results: countBy(ents as any[], key),
      });
      return;
    }
    const key = by === "tier" ? "tier" : "sector";
    printJson({ mode: `positions_by_${key}`, year, results: countBy(positions as any[], key) });
  },

  cold(flags) {
    const year = resolveYear(flags.year);
    const top = Number(flags.top ?? 20);
    const candidates = filterPositions(loadYear(year), {})
      .filter((p) => p.headcount >= 3 && p.tier !== "T0")
      .sort((a, b) => b.headcount - a.headcount)
      .slice(0, top);
    printJson({ year, note: "招录较多、梯队非顶级的岗位(相对易上岸)", results: candidates });
  },

  calendar(flags) {
    let entries = loadCalendar();
    const sector = resolveSector(flags.sector);
    const rt = resolveRecruitType(flags.type);
    if (sector) entries = entries.filter((e) => e.sector === sector || e.sector.includes(flags.sector));
    if (rt) entries = entries.filter((e) => e.recruit_type === rt);
    printJson({ total: entries.length, note: "招聘时间线为典型规律参考,以各企业当年公告为准", entries });
  },

  stats(flags) {
    const year = resolveYear(flags.year);
    const roster = loadRoster();
    const positions = loadYear(year);
    printJson({
      year,
      enterprises_total: roster.meta.total,
      enterprises_by_tier: roster.meta.by_tier,
      enterprises_by_regulator: roster.meta.by_regulator,
      positions_total: positions.length,
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
      const kind = (flags.kind === "position" ? "position" : "enterprise") as "enterprise" | "position";
      const label = flags.label ?? flags.id;
      printJson(addWatched(kind, flags.id, label, flags.year ? Number(flags.year) : undefined, flags.note));
    }
    else if (sub === "clear") { printJson(clearMemory()); }
    else { console.error(`unknown memory subcommand: ${sub}`); process.exitCode = 1; }
  },

  selftest() {
    const roster = loadRoster();
    const meta = loadPosMeta();
    console.log(`✓ 名录: ${roster.meta.total} 家企业 (梯队 ${JSON.stringify(roster.meta.by_tier)})`);
    if (meta.years.length) {
      const ly = latestYear();
      console.log(`✓ 岗位: ${meta.total_positions} 个,年份 ${meta.years.join(",")}`);
      console.log(`✓ 最新年 ${ly}: ${loadYear(ly).length} 个岗位 (懒加载分片)`);
    } else {
      console.log(`  (本地快照为空;岗位默认走实时源)`);
    }
    console.log(`✓ 实时源: ${liveAdapters().length}/${ADAPTERS.length} 已接通`);
    console.log(`✓ 时间线: ${loadCalendar().length} 条`);
    console.log(`✓ 记忆路径: ${memoryPath()}`);
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
    await fn(flags, positional);
  } catch (e: any) {
    printJson({ ok: false, error: e.message });
    process.exitCode = 1;
  }
}

main();
