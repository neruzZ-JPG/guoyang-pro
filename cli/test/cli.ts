// cli/test/cli.ts — CLI 参数、退出码和离线边界的无网络回归。
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

let pass = 0;
let fail = 0;
function check(name: string, condition: boolean, detail = "") {
  if (condition) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`FAIL  ${name} ${detail}`); }
}

const home = mkdtempSync(join(tmpdir(), "guoyang-cli-test."));
function run(args: string[]) {
  return spawnSync(
    process.execPath,
    ["--import", "tsx", "src/index.ts", ...args],
    { cwd: process.cwd(), env: { ...process.env, HOME: home }, encoding: "utf-8" },
  );
}

const version = run(["version"]);
check("version 可执行", version.status === 0 && version.stdout.trim() === "0.2.0");

const unknownFlag = run(["search", "--locaton", "北京", "--offline"]);
check("未知参数非零退出", unknownFlag.status === 1 && unknownFlag.stdout.includes("未知参数"));

const missingValue = run(["detail", "--id"]);
check("缺失参数值非零退出", missingValue.status === 1 && missingValue.stdout.includes("参数缺少值"));

const booleanValue = run(["search", "--offline=yes"]);
check("布尔参数不接受值", booleanValue.status === 1 && booleanValue.stdout.includes("布尔参数不接受值"));

const positional = run(["search", "多余参数", "--cache-only"]);
check("多余位置参数非零退出", positional.status === 1 && positional.stdout.includes("多余位置参数"));

const invalidSector = run(["enterprises", "--sector", "不存在"]);
check("未知行业非零退出", invalidSector.status === 1 && invalidSector.stdout.includes("未知行业"));

const invalidLimit = run(["enterprises", "--limit=-2"]);
check("非法 limit 非零退出", invalidLimit.status === 1 && invalidLimit.stdout.includes("--limit"));

const invalidRegulator = run(["enterprises", "--regulator", "nope"]);
check("未知监管主体非零退出", invalidRegulator.status === 1 && invalidRegulator.stdout.includes("未知监管主体"));

const ambiguousEnterprise = run(["enterprise", "中国", "--offline"]);
check("宽泛企业查询非零退出", ambiguousEnterprise.status === 1 && ambiguousEnterprise.stdout.includes("过于宽泛"));

const missingOffline = run(["search", "--offline", "--year", "2026"]);
check("缺失离线快照非零退出", missingOffline.status === 1 && missingOffline.stdout.includes("不含 2026 年离线岗位快照"));

const liveYear = run(["search", "--year", "2025"]);
check("实时模式拒绝 year", liveYear.status === 1 && liveYear.stdout.includes("--year 仅用于 --offline"));

const invalidSchool = run(["recommend", "--school-tier", "NOT_A_TIER", "--cache-only"]);
check("未知院校层级非零退出", invalidSchool.status === 1 && invalidSchool.stdout.includes("未知院校层级"));

console.log(`\n${fail === 0 ? "✓ PASS" : "✗ FAIL"}  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
