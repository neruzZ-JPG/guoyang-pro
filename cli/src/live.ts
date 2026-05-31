// cli/src/live.ts
// 实时检索编排:跨已接通的源适配器并发拉取,用名录把"半成品"岗位归一化为 Position
// (补 enterprise_id/梯队/行业、派生用工性质),合并去重后返回。
import { liveAdapters } from "./adapters/index.js";
import type { FetchParams, RawPosition } from "./adapters/types.js";
import { allEnterprises } from "./loader.js";
import {
  classifyEmployment, type Position, type Enterprise, type RecruitType,
} from "./codes.js";

function makeMatcher(ents: Enterprise[]) {
  return (name: string): Enterprise | undefined => {
    const q = (name || "").trim();
    if (!q) return undefined;
    return (
      ents.find((e) => e.name === q || e.short === q) ||
      ents.find((e) => e.aliases?.some((a) => a === q)) ||
      ents.find((e) => q.includes(e.short) || e.short.includes(q)) ||
      ents.find((e) => q.includes(e.name))
    );
  };
}

function normalize(raw: RawPosition, match: ReturnType<typeof makeMatcher>): Position {
  const ent = raw.enterprise_id ? undefined : match(raw.enterprise_name);
  const empText = [raw.employment_type, raw.remarks, raw.desc, raw.requirements, raw.title].filter(Boolean).join(" ");
  const rt: RecruitType = (raw.recruit_type as RecruitType) || "social";
  const year = raw.year || new Date().getFullYear();
  return {
    id: String(raw.id || `${raw.enterprise_name}-${raw.title}-${raw.work_location || ""}`).slice(0, 80),
    year,
    enterprise_id: raw.enterprise_id || ent?.id || "",
    enterprise_name: raw.enterprise_name,
    tier: raw.tier || ent?.tier,
    sector: raw.sector || (ent?.sector as string | undefined),
    title: raw.title,
    recruit_type: rt,
    work_location: raw.work_location || "",
    headcount: Number(raw.headcount) || 1,
    education: raw.education || "",
    major: raw.major || "不限",
    employment_type: (raw.employment_type as Position["employment_type"]) || classifyEmployment(empText),
    salary_ref: raw.salary_ref,
    political: raw.political,
    experience: raw.experience,
    desc: raw.desc,
    requirements: raw.requirements,
    remarks: raw.remarks,
    deadline: raw.deadline,
    posted_at: raw.posted_at,
    apply_url: raw.apply_url,
    source: raw.source,
  };
}

export type LiveResult = {
  ok: boolean;
  live: boolean;          // 是否有已接通的源
  sources: { id: string; ok: boolean; count: number; note?: string; error?: string }[];
  total: number;
  positions: Position[];
};

export async function liveSearch(params: FetchParams): Promise<LiveResult> {
  const adapters = liveAdapters().filter(
    (a) => !params.recruit_type || a.scopes.includes(params.recruit_type),
  );
  if (adapters.length === 0) {
    return { ok: true, live: false, sources: [], total: 0, positions: [] };
  }
  const match = makeMatcher(allEnterprises());
  const settled = await Promise.allSettled(adapters.map((a) => a.fetch(params)));

  const sources: LiveResult["sources"] = [];
  const all: Position[] = [];
  settled.forEach((s, i) => {
    const a = adapters[i];
    if (s.status === "fulfilled") {
      const r = s.value;
      sources.push({ id: a.id, ok: r.ok, count: r.positions.length, note: r.note, error: r.error });
      for (const raw of r.positions) all.push(normalize(raw, match));
    } else {
      sources.push({ id: a.id, ok: false, count: 0, error: String(s.reason?.message ?? s.reason) });
    }
  });

  // 去重(企业+岗位+地点)
  const seen = new Set<string>();
  const positions = all.filter((p) => {
    const k = `${p.enterprise_name}|${p.title}|${p.work_location}`;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });

  return { ok: true, live: true, sources, total: positions.length, positions };
}
