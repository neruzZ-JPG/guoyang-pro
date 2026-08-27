// cli/test/cache.ts — 独立 HOME 下验证查询快照缓存、详情索引、TTL 与权限。
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Position } from "../src/codes.js";
import type { SourceStatus } from "../src/live.js";

process.env.HOME = mkdtempSync(join(tmpdir(), "guoyang-cache-test."));
const {
  cachedPositionById,
  loadPositionCache,
  loadPositionSnapshot,
  positionCacheKey,
  positionCachePath,
  savePositionCache,
} = await import("../src/cache.js");

let pass = 0;
let fail = 0;
function check(name: string, condition: boolean, detail = "") {
  if (condition) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`FAIL  ${name} ${detail}`); }
}

function position(id: string, title: string): Position {
  return {
    id,
    year: 2026,
    enterprise_id: "",
    enterprise_name: "缓存测试国企",
    title,
    recruit_type: "unknown",
    work_location: "北京",
    headcount: 1,
    education: "本科",
    major: "未标注",
    employment_type: "未明确",
    fetched_at: new Date().toISOString(),
  };
}

const source: SourceStatus = {
  id: "fixture",
  ok: true,
  count: 1,
  scanned: 1,
  exhausted: true,
  truncated: false,
  fetched_at: new Date().toISOString(),
};
const queryA = positionCacheKey({ sector: "能源电力", limit: 3, scan_limit: 100 });
const queryASmaller = positionCacheKey({ sector: "能源电力", limit: 1, scan_limit: 20 });
const queryB = positionCacheKey({ sector: "金融银行", limit: 3, scan_limit: 100 });
const p = position("fixture:1", "电气工程师");

savePositionCache(queryA, [p], [source], true, 3, 100);
check("相同查询可读缓存快照", loadPositionSnapshot(queryA)?.positions.length === 1);
check("limit/scan_limit 不改变查询身份", queryA === queryASmaller);
check("较小请求可复用较大覆盖快照", loadPositionSnapshot(queryASmaller, 24, 1, 20)?.positions.length === 1);
check("完整快照可满足更大请求", loadPositionSnapshot(queryA, 24, 4, 100)?.complete === true);
savePositionCache(queryA, [p], [source], false, 3, 100);
check("不完整快照不能满足更大请求", loadPositionSnapshot(queryA, 24, 4, 100) === null);
check("不同查询不会串用缓存", loadPositionSnapshot(queryB) === null);
check("详情索引可按 id 读取", cachedPositionById(p.id)?.title === p.title);

savePositionCache(queryA, [], [{ ...source, count: 0 }], true, 3, 100);
const empty = loadPositionSnapshot(queryA);
check("完整空结果可刷新查询快照", !!empty && empty.complete && empty.positions.length === 0);
check("完整空结果从详情索引淘汰旧岗位", cachedPositionById(p.id) === undefined);

const now = new Date().toISOString();
const expired = { ...position("fixture:expired", "已过期"), fetched_at: now, deadline: "2026-01-01" };
savePositionCache(queryB, [expired], [source], true, 3, 100);
check("缓存读取重新过滤已截止岗位", loadPositionSnapshot(queryB)?.positions.length === 0);
check("详情索引不返回已截止岗位", cachedPositionById(expired.id) === undefined);

const oldQuery = positionCacheKey({ keyword: "old" });
const newQuery = positionCacheKey({ keyword: "new" });
savePositionCache(oldQuery, [{ ...position("fixture:same", "旧标题"), fetched_at: now }], [source], false, 1, 20);
await new Promise((resolve) => setTimeout(resolve, 5));
savePositionCache(newQuery, [{ ...position("fixture:same", "新标题"), fetched_at: new Date().toISOString() }], [source], false, 1, 20);
check("详情索引优先最新快照", cachedPositionById("fixture:same")?.title === "新标题");

const mode = Number.parseInt((await import("node:fs")).statSync(positionCachePath()).mode.toString(8), 10);
check("缓存文件权限为0600", mode % 1000 === 600, String(mode));

const cacheFile = positionCachePath();
mkdirSync(dirname(cacheFile), { recursive: true });
const future = "2099-01-01T00:00:00.000Z";
writeFileSync(cacheFile, JSON.stringify({
  version: 2,
  updated_at: future,
  positions: [],
  queries: {
    [queryA]: {
      updated_at: future,
      complete: true,
      requested_limit: 3,
      scan_limit: 100,
      sources: [],
      positions: [],
    },
  },
}));
chmodSync(cacheFile, 0o600);
check("未来时间戳缓存被拒绝", loadPositionCache() === null);
check("未来时间戳查询快照被拒绝", loadPositionSnapshot(queryA) === null);

check("测试运行在隔离HOME", positionCachePath().startsWith(homedir()));
check("缓存文件是JSON对象", typeof JSON.parse(readFileSync(cacheFile, "utf-8")) === "object");

console.log(`\n${fail === 0 ? "✓ PASS" : "✗ FAIL"}  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
