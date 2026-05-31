// cli/test/smoke.ts — 无网络冒烟测试:加载名录/岗位/时间线 + 跑核心 verb + 国聘适配器解析(离线fixture),任何异常即 FAIL。
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRoster, allEnterprises, filterEnterprises, findEnterprise, loadCalendar, loadPosMeta, loadYear, filterPositions } from "../src/loader.js";
import { recommend } from "../src/recommend.js";
import { matchPositions } from "../src/match.js";
import { parseRecord } from "../src/adapters/iguopin.js";

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`FAIL  ${name} ${detail}`); }
}

const roster = loadRoster();
check("roster 非空", roster.meta.total > 0, `total=${roster.meta.total}`);
check("roster 有 T0 企业", (roster.meta.by_tier.T0 ?? 0) > 0);
check("findEnterprise/filter 可用", filterEnterprises({ tier: "T0" }).length > 0);
check("每家企业有 id/name/tier", allEnterprises().every((e) => !!e.id && !!e.name && !!e.tier));

const cal = loadCalendar();
check("时间线非空", cal.length > 0, `len=${cal.length}`);

const meta = loadPosMeta();
console.log(`  岗位 meta: ${meta.total_positions} 个,年份 [${meta.years.join(",")}]`);
if (meta.years.length) {
  const y = Math.max(...meta.years);
  check("某年分片可懒加载", Array.isArray(loadYear(y)));
  check("岗位过滤可用", Array.isArray(filterPositions(loadYear(y), { tier: "T0" })));
}

// 推荐/匹配在无岗位数据时也应不抛异常(返回空桶)
const rec = recommend({ education: "本科", school_tier: "211" });
check("recommend 不抛异常", !!rec.buckets);
const m = matchPositions({ sector: "金融银行" });
check("match 不抛异常", Array.isArray(m));

// 国聘适配器:用真实抓取的响应 fixture 验证解析(离线,不联网)
const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = join(__dirname, "fixtures", "iguopin-list.json");
if (existsSync(fixture)) {
  const raw = JSON.parse(readFileSync(fixture, "utf-8"));
  const list: any[] = raw?.data?.list ?? [];
  check("国聘 fixture 非空", list.length > 0, `len=${list.length}`);
  const parsed = list.map(parseRecord);
  check("解析: 每条有企业名+岗位名", parsed.every((p) => !!p.enterprise_name && !!p.title));
  check("解析: recruit_type 合法", parsed.every((p) => ["campus", "social", "intern"].includes(p.recruit_type as string)));
  check("解析: 招聘人数为数字", parsed.every((p) => typeof p.headcount === "number"));
  check("解析: 薪资字段有值(含面议)", parsed.every((p) => !!p.salary_ref));
  check("解析: apply_url 指向国聘详情", parsed.every((p) => (p.apply_url ?? "").includes("iguopin.com/job/detail")));
  console.log(`  样例解析: ${parsed[0].enterprise_name} | ${parsed[0].title} | ${parsed[0].education} | ${parsed[0].work_location} | ${parsed[0].salary_ref}`);
}

// 名录匹配(live.ts normalize 依赖此路径把岗位归属到企业→补梯队/行业)
const icbc = findEnterprise("中国工商银行股份有限公司");
check("名录匹配: 工商银行→T0/金融银行", !!icbc && icbc.tier === "T0" && String(icbc.sector) === "金融银行", icbc ? `${icbc.tier}/${icbc.sector}` : "未找到");
const sgcc = findEnterprise("国家电网");
check("名录匹配: 国家电网→T0/能源电力", !!sgcc && sgcc.tier === "T0");

console.log(`\n${fail === 0 ? "✓ PASS" : "✗ FAIL"}  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
