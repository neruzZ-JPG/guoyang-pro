// cli/src/ingest-positions.ts
// raw/positions/*.json(各源抓取并初步归一化的职位快照)→ data/positions/<year>.json.gz + meta.json
// 处理:派生用工性质、按名录匹配 enterprise_id/梯队/行业、按招聘年份分片 gzip。
// 各 raw 文件可为 Position[] 或 { positions: Position[], source?: string, note?: string }。
// Usage: npx tsx src/ingest-positions.ts
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyEmployment, resolveRecruitType,
  type Position, type Enterprise, type EnterpriseRoster, type RecruitType,
} from "./codes.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAW = join(__dirname, "..", "raw", "positions");
const OUTDIR = join(__dirname, "..", "data", "positions");
const ROSTER = join(__dirname, "..", "data", "enterprises", "roster.json");

function loadRoster(): Enterprise[] {
  if (!existsSync(ROSTER)) return [];
  return (JSON.parse(readFileSync(ROSTER, "utf-8")) as EnterpriseRoster).enterprises;
}

// 按企业名/简称/别名匹配名录 → 返回企业(用于补 enterprise_id/tier/sector)
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

const CURRENT_YEAR = new Date().getFullYear();

function toPos(raw: any, match: ReturnType<typeof makeMatcher>): Position | null {
  const enterprise_name = (raw.enterprise_name || raw.enterprise || raw.company || raw.companyName || "").trim();
  const title = (raw.title || raw.position_name || raw.jobName || raw.name || "").trim();
  if (!enterprise_name && !title) return null;
  const ent = raw.enterprise_id ? undefined : match(enterprise_name);
  const empText = [raw.employment_type, raw.remarks, raw.desc, raw.requirements, title].filter(Boolean).join(" ");
  const rt: RecruitType = resolveRecruitType(raw.recruit_type || raw.type) || "social";
  const year = Number(raw.year) || (raw.posted_at ? new Date(raw.posted_at).getFullYear() : 0) || CURRENT_YEAR;
  return {
    id: String(raw.id || raw.position_id || `${enterprise_name}-${title}-${raw.work_location || ""}`).slice(0, 80),
    year,
    enterprise_id: raw.enterprise_id || ent?.id || "",
    enterprise_name,
    tier: raw.tier || ent?.tier,
    sector: raw.sector || (ent?.sector as string | undefined),
    title,
    recruit_type: rt,
    work_location: (raw.work_location || raw.location || raw.city || "").trim(),
    headcount: Number(raw.headcount) || 1,
    education: (raw.education || "").trim(),
    major: (raw.major || "不限").trim(),
    employment_type: raw.employment_type && ["在编/正式", "合同制", "劳务派遣", "未明确"].includes(raw.employment_type)
      ? raw.employment_type : classifyEmployment(empText),
    salary_ref: raw.salary_ref || raw.salary || undefined,
    political: raw.political || undefined,
    experience: raw.experience || undefined,
    desc: raw.desc || raw.position_desc || undefined,
    requirements: raw.requirements || undefined,
    remarks: raw.remarks || undefined,
    deadline: raw.deadline || undefined,
    posted_at: raw.posted_at || undefined,
    apply_url: raw.apply_url || raw.url || undefined,
    source: raw.source || raw.source_url || undefined,
  };
}

function main() {
  mkdirSync(OUTDIR, { recursive: true });
  const ents = loadRoster();
  const match = makeMatcher(ents);
  const byYear = new Map<number, Position[]>();
  const coverage: Record<string, { positions: number; note?: string }> = {};
  let files = 0, matched = 0;

  if (existsSync(RAW)) {
    for (const f of readdirSync(RAW)) {
      if (!f.endsWith(".json")) continue;
      files++;
      const parsed = JSON.parse(readFileSync(join(RAW, f), "utf-8"));
      const list: any[] = Array.isArray(parsed) ? parsed : (parsed.positions ?? []);
      const srcKey = parsed.source || f.replace(".json", "");
      let n = 0;
      for (const raw of list) {
        const p = toPos(raw, match);
        if (!p) continue;
        if (p.enterprise_id) matched++;
        (byYear.get(p.year) ?? byYear.set(p.year, []).get(p.year)!).push(p);
        n++;
      }
      coverage[srcKey] = { positions: n, note: parsed.note };
    }
  }

  // 去重:同 id 全字段相同
  let deduped = 0;
  for (const [y, arr] of byYear) {
    const seen = new Set<string>(); const kept: Position[] = [];
    for (const p of arr) {
      const k = [p.id, p.enterprise_name, p.title, p.work_location].join("|");
      if (seen.has(k)) { deduped++; continue; }
      seen.add(k); kept.push(p);
    }
    byYear.set(y, kept);
  }

  if (existsSync(OUTDIR)) for (const f of readdirSync(OUTDIR)) rmSync(join(OUTDIR, f));
  const years = [...byYear.keys()].sort((a, b) => a - b);
  const perYear: Record<number, number> = {};
  let total = 0;
  for (const y of years) {
    const arr = byYear.get(y)!;
    perYear[y] = arr.length; total += arr.length;
    writeFileSync(join(OUTDIR, `${y}.json.gz`), gzipSync(JSON.stringify({ year: y, positions: arr })));
  }
  const meta = {
    version: "0.1.0", built_at: new Date().toISOString(),
    years, total_positions: total, per_year: perYear, coverage,
  };
  writeFileSync(join(OUTDIR, "meta.json"), JSON.stringify(meta, null, 1));

  console.log(`合并 ${files} 个 raw 文件 → ${total} 个岗位 (${years.length} 年: ${years.join(",")})`);
  console.log(`企业归属匹配: ${matched}/${total};去重 ${deduped}`);
  console.log(`来源覆盖:`, JSON.stringify(coverage));
}

main();
