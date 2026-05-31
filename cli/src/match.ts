// cli/src/match.ts — 基于用户 profile 给岗位打 fit_score(对齐意向行业/地点/专业/招聘类型)。
import { loadYear, resolveYear, filterPositions, type PositionFilter } from "./loader.js";
import type { Position, RecruitType } from "./codes.js";

export type MatchProfile = {
  education?: string;
  major?: string;
  location?: string;
  sector?: string;
  recruit_type?: RecruitType;
  keywords?: string[];
  year?: number;
};

export type MatchResult = Position & {
  fit_score: number;
  fit_reasons: string[];
};

export function matchPositions(profile: MatchProfile): MatchResult[] {
  const year = resolveYear(profile.year);
  const filter: PositionFilter = {
    education: profile.education,
    major: profile.major,
    recruit_type: profile.recruit_type,
  };
  const candidates = filterPositions(loadYear(year), filter);

  return candidates
    .map((p) => {
      let score = 0;
      const reasons: string[] = [];

      // 意向行业命中
      if (profile.sector && p.sector === profile.sector) { score += 25; reasons.push("行业匹配"); }
      // 意向城市命中
      if (profile.location && p.work_location.includes(profile.location)) { score += 20; reasons.push("地点匹配"); }
      // 专业限定且命中(限专业的岗位对口者更有优势)
      if (profile.major && p.major && !p.major.includes("不限")) {
        const norm = p.major.replace(/[;；,，、/]/g, "|");
        if (norm.split("|").some((m) => m.trim().includes(profile.major!) || profile.major!.includes(m.trim()))) {
          score += 20; reasons.push("专业对口");
        }
      }
      // 招聘规模
      if (p.headcount >= 10) { score += 12; reasons.push("招录≥10人"); }
      else if (p.headcount >= 3) { score += 6; reasons.push("招录≥3人"); }
      // 用工性质提示(正式编制加分,派遣降权)
      if (p.employment_type === "在编/正式") { score += 8; reasons.push("在编/正式"); }
      else if (p.employment_type === "劳务派遣") { score -= 10; reasons.push("⚠劳务派遣"); }
      // 兴趣关键词
      if (profile.keywords?.length) {
        const text = `${p.enterprise_name} ${p.title} ${p.desc ?? ""} ${p.requirements ?? ""} ${p.remarks ?? ""}`;
        for (const kw of profile.keywords) {
          if (kw && text.includes(kw)) { score += 12; reasons.push(`匹配"${kw}"`); }
        }
      }

      return { ...p, fit_score: score, fit_reasons: reasons };
    })
    .sort((a, b) => b.fit_score - a.fit_score);
}
