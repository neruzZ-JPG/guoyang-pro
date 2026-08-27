// cli/src/recommend.ts
// 国央企版"冲/稳/保"。考公基于"模考分 vs 进面分";国央企没有统一考试线,
// 故改为启发式:岗位竞争度(由企业梯队 + 学历门槛 + 是否限专业派生) vs 用户实力
// (由院校层级 + 学历派生)。这是 **估算**,非官方数据,输出会明确标注。
import { loadYear, resolveYear, filterPositions, type PositionFilter } from "./loader.js";
import type { Position, RecruitType } from "./codes.js";

export type RecommendInput = {
  education?: string;     // 用户学历
  school_tier?: string;   // 院校层级:985/211/双一流/普通本科/海外
  major?: string;
  location?: string;
  sector?: string;
  recruit_type?: RecruitType;
  year?: number;
};

export type RecommendCandidate = Position & {
  competitiveness: number; // 0-100 估算竞争度
  strength: number;        // 0-100 用户实力
  delta: number;
  bucket: "冲" | "稳" | "保" | "out";
};

export type RecommendOutput = {
  query: RecommendInput;
  basis: string;
  evaluated: number;
  excluded_unknown_tier: number;
  buckets: {
    "冲": RecommendCandidate[];
    "稳": RecommendCandidate[];
    "保": RecommendCandidate[];
    out: RecommendCandidate[];
  };
};

const TIER_HEAT: Record<string, number> = { T0: 92, T1: 74, T2: 50, T3: 30 };

function eduBar(education: string): number {
  if (/博士/.test(education)) return 20;
  if (/硕士|研究生/.test(education)) return 12;
  if (/本科/.test(education)) return 4;
  return 0;
}

function competitivenessOf(p: Position): number {
  let c = TIER_HEAT[p.tier!]!;
  c += requirementEduBar(p.education);  // 学历门槛越高越卷
  if (p.major && !/不限|未标注|未知/.test(p.major)) c += 3; // 明确限专业才加分
  if (p.recruit_type === "campus") c += 2;
  return Math.max(0, Math.min(100, c));
}

function requirementEduBar(education: string): number {
  if (/本科|学士/.test(education)) return 4;
  if (/硕士|研究生/.test(education)) return 12;
  if (/博士/.test(education)) return 20;
  return 0;
}

function strengthOf(input: RecommendInput): number {
  let s = 45;
  const st = input.school_tier ?? "";
  if (/985|c9|双一流.*a|海外名校|qs.?100/i.test(st)) s += 28;
  else if (/211|双一流/.test(st)) s += 18;
  else if (/一本|重点|海外/.test(st)) s += 8;
  else if (/二本|普通|三本|专科/.test(st)) s += 0;
  s += eduBar(input.education ?? "");
  return Math.max(0, Math.min(100, s));
}

export function recommend(input: RecommendInput, pool?: Position[]): RecommendOutput {
  const year = resolveYear(input.year);
  const filter: PositionFilter = {
    education: input.education,
    major: input.major,
    location: input.location,
    sector: input.sector,
    recruit_type: input.recruit_type,
  };
  const filtered = filterPositions(pool ?? loadYear(year), filter);
  const candidates = filtered.filter((p) => p.tier && p.tier in TIER_HEAT);
  const strength = strengthOf(input);

  const buckets: RecommendOutput["buckets"] = { "冲": [], "稳": [], "保": [], out: [] };

  for (const p of candidates) {
    const competitiveness = competitivenessOf(p);
    const delta = strength - competitiveness;
    let bucket: RecommendCandidate["bucket"];
    if (delta >= 15) bucket = "保";
    else if (delta >= -5) bucket = "稳";
    else if (delta >= -25) bucket = "冲";
    else bucket = "out";
    buckets[bucket].push({ ...p, competitiveness, strength, delta, bucket });
  }

  buckets["冲"].sort((a, b) => b.delta - a.delta);
  buckets["稳"].sort((a, b) => b.delta - a.delta);
  buckets["保"].sort((a, b) => a.delta - b.delta);

  return {
    query: { ...input, year: input.year },
    basis: "竞争度为启发式估算(已识别母集团梯队+学历门槛+是否限专业),非官方录取数据;未知梯队岗位不参与冲稳保分档。",
    evaluated: candidates.length,
    excluded_unknown_tier: filtered.length - candidates.length,
    buckets,
  };
}
