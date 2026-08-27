// cli/src/live.ts
// 实时检索编排:跨已接通的源适配器并发拉取,用名录把"半成品"岗位归一化为 Position
// (补 enterprise_id/梯队/行业、派生用工性质),合并去重后返回。
import { liveAdapters, sourcePriority } from "./adapters/index.js";
import type { FetchParams, RawPosition } from "./adapters/types.js";
import { allEnterprises, filterPositions } from "./loader.js";
import { createHash } from "node:crypto";
import {
  classifyEmployment, inferSector, EMPLOYMENT_TYPES, RECRUIT_TYPES, SECTORS, TIERS,
  type Position, type Enterprise, type RecruitType,
} from "./codes.js";

type EnterpriseMatch = {
  enterprise?: Enterprise;
  confidence: NonNullable<Position["match_confidence"]>;
};

function normalizeOrgName(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[（）()【】[\]·•,，.。"'“”‘’\s-]/g, "")
    .replace(/(?:股份)?有限公司$|有限责任公司$|集团公司$/g, "");
}

const AFFILIATE_RULES: { re: RegExp; target: string }[] = [
  { re: /国家电网|国网(?:电力|数科|信通|能源|新源|经研|英大)/, target: "国网" },
  { re: /南方电网|南网/, target: "南方电网" },
  { re: /中国移动|中移(?:系统|信息|物联|在线|互联网|铁通)|咪咕/, target: "中国移动" },
  { re: /中国电信|中电信|天翼/, target: "中国电信" },
  { re: /中国联通|联通(?:数字|在线|智网|支付|云)/, target: "中国联通" },
  { re: /中石油|中国石油|大庆油田|长庆油田|昆仑能源/, target: "中石油" },
  { re: /中石化|中国石化|胜利油田/, target: "中石化" },
  { re: /中海油|中国海油/, target: "中海油" },
  { re: /国家能源集团|神华(?:集团|能源|煤业|电力)|国能(?:电力|能源发展|煤炭|矿业|集团)/, target: "国家能源集团" },
  { re: /国家电投|国电投|中电投/, target: "国家电投" },
  { re: /中国华能|华能/, target: "华能" },
  { re: /中国华电|华电/, target: "华电" },
  { re: /大唐电信|大唐移动/, target: "中国信科" },
  { re: /中国大唐集团|大唐国际发电|大唐发电|大唐新能源|大唐环境/, target: "大唐" },
  { re: /中国长江三峡集团|三峡(?:能源|集团|国际|建工|基地发展)/, target: "三峡集团" },
  { re: /中广核/, target: "中广核" },
  { re: /中国核工业|中核/, target: "中核" },
  { re: /航天海鹰|航天科工/, target: "航天科工" },
  { re: /航天科技/, target: "航天科技" },
  { re: /中国航发|航发/, target: "中国航发" },
  { re: /航空工业|中航工业/, target: "航空工业" },
  { re: /中国电子科技集团|中国电科|中电科/, target: "中国电科" },
  { re: /中国电子信息产业集团|中国电子集团/, target: "中国电子" },
  { re: /湖南云箭|兵器装备|南方工业/, target: "兵装集团" },
  { re: /山东特种工业|兵器工业|北方工业/, target: "兵器工业" },
  { re: /中国铁建|中铁建|铁建/, target: "中国铁建" },
  { re: /中国中铁|中铁(?!建)/, target: "中国中铁" },
  { re: /中国建筑|中建(?:一|二|三|四|五|六|七|八|\d)局/, target: "中建" },
  { re: /中国交建|中交(?:一|二|三|四|\d)航?局/, target: "中交" },
  { re: /中国中车|中车/, target: "中国中车" },
  { re: /中国能建|中能建/, target: "中国能建" },
  { re: /中国一汽|一汽/, target: "一汽" },
  { re: /东风汽车|东风商用车/, target: "东风" },
  { re: /招商银行|招银(?:网络科技|云创|理财|金融租赁|国际)/, target: "招商银行" },
  { re: /招商局/, target: "招商局" },
  { re: /华润/, target: "华润" },
  { re: /中粮/, target: "中粮" },
  { re: /中国中化|中化(?:集团|国际|能源|资本|环境)|先正达/, target: "中国中化" },
  { re: /中国保利集团|保利(?:发展|置业|物业|文化|科技|国际|久联|民爆|艺术)/, target: "保利" },
];

function exactTarget(ents: Enterprise[], query: string): Enterprise | undefined {
  return ents.find(
    (e) => e.name === query || e.short === query || e.aliases?.includes(query),
  );
}

export function matchEnterprise(name: string, ents = allEnterprises()): EnterpriseMatch {
  const q = normalizeOrgName(name || "");
  if (!q) return { confidence: "none" };

  const byId = ents.find((e) => e.id === name);
  if (byId) return { enterprise: byId, confidence: "exact" };

  for (const e of ents) {
    const names = [e.name, e.short, ...(e.aliases ?? [])]
      .map(normalizeOrgName)
      .filter(Boolean);
    if (names.includes(q)) return { enterprise: e, confidence: "exact" };
  }

  // 母子公司关系只走下方受控规则；禁止“投资控股”等通用词的包含匹配。
  const raw = name.normalize("NFKC");
  for (const rule of AFFILIATE_RULES) {
    if (!rule.re.test(raw)) continue;
    const enterprise = exactTarget(ents, rule.target);
    if (enterprise) return { enterprise, confidence: "affiliate" };
  }
  return { confidence: "none" };
}

export function normalizePosition(
  raw: RawPosition,
  ents = allEnterprises(),
  fetchedAt = new Date().toISOString(),
): Position {
  const explicitEnterprise = raw.enterprise_id
    ? ents.find((e) => e.id === raw.enterprise_id)
    : undefined;
  const nameMatch = matchEnterprise(raw.enterprise_name, ents);
  const explicitMatchesName = !!explicitEnterprise &&
    !!nameMatch.enterprise &&
    explicitEnterprise.id === nameMatch.enterprise.id;
  const match = explicitMatchesName
    ? nameMatch
    : nameMatch.enterprise
      ? nameMatch
      : { confidence: "none" as const };
  const ent = match.enterprise;
  const warnings = new Set(raw.quality_warnings ?? []);
  const empText = [raw.employment_type, raw.remarks, raw.desc, raw.requirements, raw.title].filter(Boolean).join(" ");
  const rt: RecruitType = raw.recruit_type &&
    raw.recruit_type in RECRUIT_TYPES
    ? raw.recruit_type as RecruitType
    : "unknown";
  if (raw.recruit_type && rt === "unknown" && raw.recruit_type !== "unknown") {
    warnings.add(`上游招聘类型“${raw.recruit_type}”不是有效枚举，已标为 unknown`);
  }
  const year = raw.year || new Date().getFullYear();
  const sourceId = raw.source_id || "unknown";
  const sourcePositionId = raw.source_position_id || raw.id;
  const sourceUrl = raw.source || raw.apply_url;
  if (match.confidence === "affiliate") {
    warnings.add("梯队/行业由已识别母集团继承，请结合具体子公司核验");
  }
  const rawSector = raw.sector && (SECTORS as readonly string[]).includes(raw.sector)
    ? raw.sector
    : undefined;
  const inferredSector = (ent?.sector as string | undefined) || rawSector ||
    inferSector(`${raw.enterprise_name} ${raw.remarks ?? ""}`);
  if (raw.sector && !rawSector) {
    warnings.add(`上游行业“${raw.sector}”不是标准行业枚举，未直接采用`);
  }
  if (ent?.sector && rawSector && String(ent.sector) !== rawSector) {
    warnings.add(`上游行业“${raw.sector}”与母集团行业“${String(ent.sector)}”不一致，当前采用母集团行业`);
  }
  if (!ent && !rawSector && inferredSector) {
    warnings.add(`行业“${inferredSector}”由企业名称/岗位文本推断，请核验`);
  }
  if (!(Number(raw.headcount) > 0)) {
    warnings.add("招聘人数未可靠标注，headcount 按 1 占位");
  }
  if (raw.enterprise_id && (!explicitEnterprise || !explicitMatchesName)) {
    warnings.add(`上游 enterprise_id“${raw.enterprise_id}”未通过企业名称一致性验证，已忽略`);
  }
  if (!raw.major) {
    warnings.add("专业要求未标注，请以投递页为准");
  }
  if (raw.deadline && !parseDeadline(raw.deadline)) {
    warnings.add("截止时间无法解析，请以投递页为准");
  }
  const postedAt = raw.posted_at ? Date.parse(raw.posted_at) : NaN;
  if (Number.isFinite(postedAt) && postedAt > Date.now() + 36 * 60 * 60 * 1000) {
    warnings.add("发布时间晚于当前时间，请核对上游时区/数据");
  }
  const rawTier = raw.tier && raw.tier in TIERS ? raw.tier : undefined;
  if (raw.tier && !rawTier) warnings.add(`上游梯队“${raw.tier}”不是有效枚举，已忽略`);
  if (rawTier && !ent) warnings.add(`上游梯队“${rawTier}”未经过静态名录验证，已忽略`);
  const rawEmployment = raw.employment_type &&
    (EMPLOYMENT_TYPES as readonly string[]).includes(raw.employment_type)
    ? raw.employment_type as Position["employment_type"]
    : undefined;
  if (raw.employment_type && !rawEmployment) {
    warnings.add(`上游用工性质“${raw.employment_type}”不是有效枚举，已重新推断`);
  }
  return {
    id: sourcePositionId
      ? `${sourceId}:${String(sourcePositionId)}`
      : `${sourceId}:synthetic:${createHash("sha256")
          .update([
            raw.enterprise_name,
            raw.title,
            raw.work_location ?? "",
            raw.recruit_type ?? "",
            raw.posted_at ?? "",
            String(year),
            raw.source_company_id ?? "",
            raw.apply_url ?? "",
          ].join("\u0000"))
          .digest("hex")
          .slice(0, 24)}`,
    year,
    enterprise_id: explicitMatchesName ? explicitEnterprise?.id ?? "" : ent?.id ?? "",
    enterprise_name: raw.enterprise_name,
    tier: ent?.tier,
    sector: inferredSector,
    title: raw.title,
    recruit_type: rt,
    work_location: raw.work_location || "",
    headcount: Number(raw.headcount) > 0 ? Number(raw.headcount) : 1,
    education: raw.education || "",
    major: raw.major || "未标注",
    employment_type: rawEmployment || classifyEmployment(empText),
    salary_ref: raw.salary_ref,
    political: raw.political,
    experience: raw.experience,
    desc: raw.desc,
    requirements: raw.requirements,
    remarks: raw.remarks,
    deadline: raw.deadline,
    posted_at: raw.posted_at,
    apply_url: raw.apply_url,
    source: sourceUrl,
    source_id: sourceId,
    source_position_id: sourcePositionId,
    source_company_id: raw.source_company_id,
    source_urls: sourceUrl ? [sourceUrl] : [],
    fetched_at: fetchedAt,
    match_confidence: match.confidence,
    quality_warnings: warnings.size ? [...warnings] : undefined,
  };
}

export type SourceStatus = {
  id: string;
  ok: boolean;
  count: number;
  scanned: number;
  exhausted: boolean;
  truncated: boolean;
  fetched_at?: string;
  note?: string;
  error?: string;
};

export type LiveResult = {
  ok: boolean;
  live: boolean;          // 至少一个源请求成功
  degraded: boolean;      // 部分源失败或查询达到扫描边界
  complete: boolean;      // 所有成功源均确认扫到末尾
  fetched_at: string;
  scanned: number;
  sources: SourceStatus[];
  total: number;
  positions: Position[];
};

export async function liveSearch(params: FetchParams): Promise<LiveResult> {
  const fetchedAt = new Date().toISOString();
  const adapters = liveAdapters().filter(
    (a) => !params.recruit_type || a.scopes.includes(params.recruit_type),
  );
  if (adapters.length === 0) {
    return {
      ok: false, live: false, degraded: true, complete: false, fetched_at: fetchedAt,
      scanned: 0, sources: [], total: 0, positions: [],
    };
  }
  const ents = allEnterprises();
  const needsPostNormalization = !!(
    params.enterprise_id || params.tier || params.sector || params.employment_type ||
    params.education || params.major
  );
  const adapterParams = needsPostNormalization
    ? {
        ...params,
        enterprise: undefined,
        sector: undefined,
        employment_type: undefined,
        education: undefined,
        major: undefined,
        limit: params.scan_limit ?? 1000,
      }
    : params;
  const settled = await Promise.allSettled(adapters.map((a) => a.fetch(adapterParams)));

  const sources: LiveResult["sources"] = [];
  const all: Position[] = [];
  settled.forEach((s, i) => {
    const a = adapters[i];
    if (s.status === "fulfilled") {
      const r = s.value;
      sources.push({
        id: a.id, ok: r.ok, count: r.positions.length, scanned: r.scanned,
        exhausted: r.exhausted, truncated: r.truncated, fetched_at: r.fetched_at,
        note: r.note, error: r.error,
      });
      if (r.ok) {
        for (const raw of r.positions) all.push(normalizePosition(raw, ents, r.fetched_at));
      }
    } else {
      sources.push({
        id: a.id, ok: false, count: 0, scanned: 0, exhausted: false, truncated: true,
        error: String(s.reason?.message ?? s.reason),
      });
    }
  });

  const successful = sources.filter((s) => s.ok);
  const deduped = dedupePositions(all.filter(isPositionOpen));
  const positions = filterPositions(deduped, {
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
  }).slice(0, Math.max(1, params.limit ?? 50));
  const degraded = successful.length !== sources.length || sources.some((s) => s.truncated);
  const complete = successful.length > 0 &&
    successful.length === sources.length &&
    successful.every((s) => s.exhausted);

  return {
    ok: successful.length > 0,
    live: successful.length > 0,
    degraded,
    complete,
    fetched_at: fetchedAt,
    scanned: sources.reduce((sum, s) => sum + s.scanned, 0),
    sources,
    total: positions.length,
    positions,
  };
}

export function isPositionOpen(position: Position): boolean {
  if (!position.deadline) return true;
  if (/已截止|停止招聘|招聘结束/.test(position.deadline)) return false;
  if (/长期有效|招满即止/.test(position.deadline)) return true;
  const deadline = parseDeadline(position.deadline);
  return deadline === undefined || deadline >= Date.now();
}

function parseDeadline(value: string): number | undefined {
  const text = value.trim()
    .replace(
    /^(\d{4})年(\d{1,2})月(\d{1,2})日(?:\s*(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
    (_all, y, m, d, h, min, sec) =>
      `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` +
      (h === undefined ? "" : ` ${String(h).padStart(2, "0")}:${min}:${sec ?? "00"}`),
    )
    .replace(
      /^(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\s*(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
      (_all, y, m, d, h, min, sec) =>
        `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` +
        (h === undefined ? "" : ` ${String(h).padStart(2, "0")}:${min}:${sec ?? "00"}`),
    );
  const local = text.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (local) {
    const [, ys, ms, ds, hs, mins, ss] = local;
    const year = Number(ys);
    const month = Number(ms);
    const day = Number(ds);
    const hour = hs === undefined ? 23 : Number(hs);
    const minute = mins === undefined ? 59 : Number(mins);
    const second = ss === undefined ? 59 : Number(ss);
    if (
      month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59
    ) return undefined;
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    if (day > daysInMonth) return undefined;
    const parsed = Date.parse(
      `${ys}-${ms}-${ds}T${String(hour).padStart(2, "0")}:` +
      `${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}+08:00`,
    );
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function jobCode(title: string): string | undefined {
  return title.match(/\bJ\d{4,}\b/i)?.[0].toLowerCase();
}

function normalizeTitle(title: string): string {
  return title
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\bJ\d{4,}\b/gi, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function normalizeLocation(location: string): string {
  return location
    .normalize("NFKC")
    .split(/[、,/]/)
    .map((item) => item.replace(/中国-|省|市|区|县|\s/g, ""))
    .filter(Boolean)
    .sort()
    .join("|");
}

function dedupeKey(p: Position): string {
  const company = p.enterprise_id && p.match_confidence === "exact"
    ? `enterprise:${p.enterprise_id}`
    : `name:${normalizeOrgName(p.enterprise_name)}`;
  const code = jobCode(p.title);
  const batch = p.recruit_type;
  // 跨源共同岗位代码是强身份，可在 unknown/campus 等类型不一致时合并并告警。
  if (code) return `${p.year}|${company}|code:${code}|${normalizeTitle(p.title)}`;
  return `${p.year}|${company}|${normalizeTitle(p.title)}|${normalizeLocation(p.work_location)}|${batch}`;
}

function preferValue<T>(current: T | undefined, incoming: T | undefined): T | undefined {
  if (
    current === undefined ||
    current === "" ||
    current === "unknown" ||
    current === "未标注" ||
    current === "未明确"
  ) return incoming ?? current;
  return current;
}

function mergePosition(current: Position, incoming: Position): Position {
  const [primary, secondary] = sourcePriority(incoming.source_id) >
      sourcePriority(current.source_id)
    ? [incoming, current]
    : [current, incoming];
  const warnings = new Set([
    ...(current.quality_warnings ?? []),
    ...(incoming.quality_warnings ?? []),
  ]);
  if (
    current.recruit_type !== "unknown" &&
    incoming.recruit_type !== "unknown" &&
    current.recruit_type !== incoming.recruit_type
  ) warnings.add(`跨源招聘类型冲突:${current.recruit_type}/${incoming.recruit_type}`);
  if (current.salary_ref && incoming.salary_ref && current.salary_ref !== incoming.salary_ref) {
    warnings.add("跨源薪资字段不一致，请以投递页为准");
  }
  if (current.headcount !== incoming.headcount) {
    warnings.add("跨源招聘人数字段不一致，请以投递页为准");
  }
  for (const [label, a, b] of [
    ["学历", current.education, incoming.education],
    ["专业", current.major, incoming.major],
    ["地点", current.work_location, incoming.work_location],
    ["截止时间", current.deadline, incoming.deadline],
  ] as const) {
    if (a && b && a !== b) warnings.add(`跨源${label}字段不一致，请以投递页为准`);
  }
  return {
    ...primary,
    enterprise_id: preferValue(primary.enterprise_id, secondary.enterprise_id) ?? "",
    tier: preferValue(primary.tier, secondary.tier),
    sector: preferValue(primary.sector, secondary.sector),
    recruit_type: preferValue(primary.recruit_type, secondary.recruit_type) ?? "unknown",
    work_location: preferValue(primary.work_location, secondary.work_location) ?? "",
    education: preferValue(primary.education, secondary.education) ?? "",
    major: preferValue(primary.major, secondary.major) ?? "未标注",
    headcount: primary.headcount > 0 ? primary.headcount : secondary.headcount,
    salary_ref: preferValue(primary.salary_ref, secondary.salary_ref),
    desc: preferValue(primary.desc, secondary.desc),
    requirements: preferValue(primary.requirements, secondary.requirements),
    deadline: preferValue(primary.deadline, secondary.deadline),
    posted_at: preferValue(primary.posted_at, secondary.posted_at),
    source_urls: [...new Set([
      ...(current.source_urls ?? []),
      ...(incoming.source_urls ?? []),
    ])],
    quality_warnings: warnings.size ? [...warnings] : undefined,
  };
}

export function dedupePositions(positions: Position[]): Position[] {
  const byKey = new Map<string, Position>();
  for (const p of positions) {
    const key = dedupeKey(p);
    const current = byKey.get(key);
    byKey.set(key, current ? mergePosition(current, p) : p);
  }
  return [...byKey.values()];
}
