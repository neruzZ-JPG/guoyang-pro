// cli/src/ingest-enterprises.ts
// 合并 raw/enterprises/*.json(种子 + agent team 名录产出)→ data/enterprises/roster.json
// 每个 raw 文件可为 Enterprise[] 或 { enterprises: Enterprise[], sources?: string }。
// 去重(按 id;无 id 按 name 哈希生成稳定 id),归一化 regulator/tier,统计 meta。
// Usage: npx tsx src/ingest-enterprises.ts
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { REGULATORS, TIERS, type Enterprise, type EnterpriseRoster } from "./codes.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAW = join(__dirname, "..", "raw", "enterprises");
const OUTDIR = join(__dirname, "..", "data", "enterprises");

// FNV-1a → 6 hex,给无 id 的企业生成稳定 id(随名称稳定,不随顺序变)。
function slugId(name: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return "e" + (h >>> 0).toString(16).padStart(8, "0").slice(0, 6);
}

const REG_NAMES = new Set<string>(Object.values(REGULATORS));
function normRegulator(r: string): string {
  if (!r) return "其他";
  if (r in REGULATORS) return (REGULATORS as Record<string, string>)[r];
  if (REG_NAMES.has(r)) return r;
  // 常见别名归一
  if (/国资委/.test(r) && !/地方|省|市/.test(r)) return REGULATORS.sasac;
  if (/财政部|金融/.test(r)) return REGULATORS.mof;
  if (/烟草/.test(r)) return REGULATORS.miit_tobacco;
  if (/铁路|国铁/.test(r)) return REGULATORS.crc;
  if (/宣传|文化/.test(r)) return REGULATORS.cpd;
  if (/地方|省|市/.test(r)) return REGULATORS.local;
  return r;
}

function normTier(t: string): string {
  const m = (t || "").toUpperCase().match(/T[0-3]/);
  return m ? m[0] : "T2";
}

function main() {
  mkdirSync(OUTDIR, { recursive: true });
  const byId = new Map<string, Enterprise>();
  const sources = new Set<string>();
  let files = 0;

  if (existsSync(RAW)) {
    for (const f of readdirSync(RAW)) {
      if (!f.endsWith(".json")) continue;
      files++;
      const parsed = JSON.parse(readFileSync(join(RAW, f), "utf-8"));
      const list: Enterprise[] = Array.isArray(parsed) ? parsed : (parsed.enterprises ?? []);
      if (parsed.sources) String(parsed.sources).split(/[\n;,]/).map((s) => s.trim()).filter(Boolean).forEach((s) => sources.add(s));
      for (const raw of list) {
        if (!raw?.name) continue;
        const id = (raw.id && String(raw.id).trim()) || slugId(raw.name);
        const ent: Enterprise = {
          id,
          name: raw.name.trim(),
          short: (raw.short || raw.name).trim(),
          tier: normTier(String(raw.tier)) as Enterprise["tier"],
          sector: raw.sector || "其他",
          regulator: normRegulator(String(raw.regulator || "")),
          listed: raw.listed || undefined,
          hq: raw.hq || undefined,
          recruit_site: raw.recruit_site || undefined,
          ats: raw.ats || undefined,
          aliases: raw.aliases || undefined,
          notes: raw.notes || undefined,
          source: raw.source || undefined,
        };
        // 去重:优先按 id;若不同文件给同名不同 id,按 name 合并(后到的补空字段)
        const existing = byId.get(id) || [...byId.values()].find((e) => e.name === ent.name);
        if (existing) {
          for (const k of Object.keys(ent) as (keyof Enterprise)[]) {
            if (existing[k] === undefined || existing[k] === "") (existing as any)[k] = ent[k];
          }
        } else {
          byId.set(id, ent);
        }
      }
    }
  }

  const enterprises = [...byId.values()].sort((a, b) => {
    const t = a.tier.localeCompare(b.tier);
    return t !== 0 ? t : a.short.localeCompare(b.short);
  });

  const by_tier: Record<string, number> = {};
  const by_regulator: Record<string, number> = {};
  for (const e of enterprises) {
    by_tier[e.tier] = (by_tier[e.tier] ?? 0) + 1;
    by_regulator[String(e.regulator)] = (by_regulator[String(e.regulator)] ?? 0) + 1;
  }

  const roster: EnterpriseRoster = {
    meta: {
      version: "0.1.0",
      built_at: new Date().toISOString(),
      total: enterprises.length,
      by_tier,
      by_regulator,
      sources: [...sources],
    },
    enterprises,
  };
  writeFileSync(join(OUTDIR, "roster.json"), JSON.stringify(roster, null, 1));

  // 校验提示
  const unknownTier = enterprises.filter((e) => !(e.tier in TIERS));
  console.log(`合并 ${files} 个 raw 文件 → ${enterprises.length} 家企业`);
  console.log(`梯队分布:`, JSON.stringify(by_tier));
  console.log(`监管分布:`, JSON.stringify(by_regulator));
  if (unknownTier.length) console.log(`⚠ 未知梯队 ${unknownTier.length} 家`);
}

main();
