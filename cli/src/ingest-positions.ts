// cli/src/ingest-positions.ts
// raw/positions/*.json(各源抓取并初步归一化的职位快照)→ data/positions/<year>.json.gz + meta.json
// 处理:派生用工性质、按名录匹配 enterprise_id/梯队/行业、按招聘年份分片 gzip。
// 各 raw 文件可为 Position[] 或 { positions: Position[], source?: string, note?: string }。
// Usage: npx tsx src/ingest-positions.ts
import {
  readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, rmSync, renameSync,
} from "node:fs";
import { gzipSync } from "node:zlib";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveRecruitType, type Position, type Enterprise, type EnterpriseRoster,
} from "./codes.js";
import type { RawPosition } from "./adapters/types.js";
import { normalizePosition } from "./live.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAW = join(__dirname, "..", "raw", "positions");
const OUTDIR = join(__dirname, "..", "data", "positions");
const ROSTER = join(__dirname, "..", "data", "enterprises", "roster.json");

function loadRoster(): Enterprise[] {
  if (!existsSync(ROSTER)) return [];
  return (JSON.parse(readFileSync(ROSTER, "utf-8")) as EnterpriseRoster).enterprises;
}

const CURRENT_YEAR = new Date().getFullYear();

function toPos(raw: any, ents: Enterprise[], fileSource: string, sourceId: string): Position | null {
  const enterprise_name = (raw.enterprise_name || raw.enterprise || raw.company || raw.companyName || "").trim();
  const title = (raw.title || raw.position_name || raw.jobName || raw.name || "").trim();
  if (!enterprise_name || !title) return null;
  const explicitYear = Number(raw.year);
  const hasExplicitYear = raw.year !== undefined && raw.year !== null && raw.year !== "";
  if (
    hasExplicitYear &&
    (!Number.isInteger(explicitYear) || explicitYear < 2000 || explicitYear > CURRENT_YEAR + 2)
  ) return null;
  const postedTime = raw.posted_at ? Date.parse(raw.posted_at) : NaN;
  const year = hasExplicitYear
    ? explicitYear
    : Number.isFinite(postedTime)
      ? new Date(postedTime).getFullYear()
      : NaN;
  if (!Number.isInteger(year)) return null;
  const source = String(raw.source || raw.source_url || raw.apply_url || fileSource).trim();
  if (!source) return null;
  const warnings = Array.isArray(raw.quality_warnings)
    ? raw.quality_warnings.map(String)
    : [];
  if (raw.posted_at && !Number.isFinite(postedTime)) {
    warnings.push("发布时间无法解析，已使用显式 year");
  }
  if (!(Number(raw.headcount) > 0)) warnings.push("招聘人数未可靠标注，headcount 按 1 占位");
  if (!raw.major) warnings.push("专业要求未标注，请以投递页为准");
  const adapted: RawPosition = {
    id: raw.id || raw.position_id || undefined,
    year,
    enterprise_id: raw.enterprise_id || undefined,
    enterprise_name,
    title,
    recruit_type: resolveRecruitType(raw.recruit_type || raw.type) || "unknown",
    work_location: (raw.work_location || raw.location || raw.city || "").trim(),
    headcount: Number(raw.headcount) || 1,
    education: (raw.education || "").trim(),
    major: raw.major ? String(raw.major).trim() : undefined,
    employment_type: raw.employment_type || undefined,
    salary_ref: raw.salary_ref || raw.salary || undefined,
    political: raw.political || undefined,
    experience: raw.experience || undefined,
    desc: raw.desc || raw.position_desc || undefined,
    requirements: raw.requirements || undefined,
    remarks: raw.remarks || undefined,
    deadline: raw.deadline || undefined,
    posted_at: raw.posted_at || undefined,
    apply_url: raw.apply_url || raw.url || undefined,
    source,
    source_id: raw.source_id || sourceId,
    source_position_id: raw.source_position_id || raw.id || raw.position_id || undefined,
    source_company_id: raw.source_company_id || undefined,
    quality_warnings: warnings.length ? warnings : undefined,
  };
  return normalizePosition(adapted, ents, new Date().toISOString());
}

function main() {
  const ents = loadRoster();
  const byYear = new Map<number, Position[]>();
  const coverage: Record<string, { positions: number; note?: string }> = {};
  let files = 0, matched = 0;

  if (existsSync(RAW)) {
    for (const f of readdirSync(RAW)) {
      if (!f.endsWith(".json")) continue;
      files++;
      const parsed = JSON.parse(readFileSync(join(RAW, f), "utf-8"));
      const list: any[] = Array.isArray(parsed) ? parsed : (parsed.positions ?? []);
      const wrapperSource = Array.isArray(parsed) ? "" : String(parsed.source || "").trim();
      if (!wrapperSource && !list.every((raw) => raw?.source || raw?.source_url || raw?.apply_url)) {
        throw new Error(`岗位 raw 文件 ${f} 缺少可核验 source/apply_url`);
      }
      const srcKey = wrapperSource || f.replace(".json", "");
      const sourceId = String(Array.isArray(parsed) ? "" : parsed.source_id || "").trim() ||
        f.replace(".json", "");
      let n = 0;
      for (let index = 0; index < list.length; index++) {
        const raw = list[index];
        const p = toPos(raw, ents, wrapperSource, sourceId);
        if (!p) throw new Error(`岗位 raw 文件 ${f} 第 ${index + 1} 条记录无效`);
        if (p.enterprise_id) matched++;
        (byYear.get(p.year) ?? byYear.set(p.year, []).get(p.year)!).push(p);
        n++;
      }
      coverage[srcKey] = { positions: n, note: parsed.note };
    }
  }
  if ((files === 0 || byYear.size === 0) && process.env.GUOYANG_ALLOW_EMPTY_INGEST !== "1") {
    throw new Error("没有 raw/positions/*.json 输入；拒绝清空现有岗位快照。确需空构建时设置 GUOYANG_ALLOW_EMPTY_INGEST=1");
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

  const tempDir = `${OUTDIR}.tmp-${process.pid}`;
  rmSync(tempDir, { recursive: true, force: true });
  mkdirSync(tempDir, { recursive: true });
  const years = [...byYear.keys()].sort((a, b) => a - b);
  const perYear: Record<number, number> = {};
  let total = 0;
  for (const y of years) {
    const arr = byYear.get(y)!;
    perYear[y] = arr.length; total += arr.length;
    writeFileSync(join(tempDir, `${y}.json.gz`), gzipSync(JSON.stringify({ year: y, positions: arr })));
  }
  const meta = {
    version: "0.2.0", built_at: new Date().toISOString(),
    years, total_positions: total, per_year: perYear, coverage,
  };
  writeFileSync(join(tempDir, "meta.json"), JSON.stringify(meta, null, 1));
  const backupDir = `${OUTDIR}.backup-${process.pid}`;
  rmSync(backupDir, { recursive: true, force: true });
  if (existsSync(OUTDIR)) renameSync(OUTDIR, backupDir);
  try {
    renameSync(tempDir, OUTDIR);
    rmSync(backupDir, { recursive: true, force: true });
  } catch (error) {
    if (existsSync(backupDir) && !existsSync(OUTDIR)) renameSync(backupDir, OUTDIR);
    throw error;
  }

  console.log(`合并 ${files} 个 raw 文件 → ${total} 个岗位 (${years.length} 年: ${years.join(",")})`);
  console.log(`企业归属匹配: ${matched}/${total};去重 ${deduped}`);
  console.log(`来源覆盖:`, JSON.stringify(coverage));
}

main();
