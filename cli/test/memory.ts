// cli/test/memory.ts — 独立 HOME 下验证记忆 schema、权限与去重。
import { chmodSync, mkdirSync, mkdtempSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

process.env.HOME = mkdtempSync(join(tmpdir(), "guoyang-memory-test."));
const {
  addWatched,
  loadMemory,
  memoryPath,
  setPrefs,
} = await import("../src/memory.js");

let pass = 0;
let fail = 0;
function check(name: string, condition: boolean, detail = "") {
  if (condition) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`FAIL  ${name} ${detail}`); }
}

const prefs = setPrefs({
  education: "本科",
  "school-tier": "211",
  type: "校招",
});
check("kebab-case 画像字段可映射", prefs.prefs.school_tier === "211");
check("招聘类型画像可映射", prefs.prefs.recruit_type === "校招");
addWatched("enterprise", "sgcc", "国网");
addWatched("enterprise", "sgcc", "国家电网");
check("关注项按 kind+id 去重", loadMemory().watched.length === 1);
check("记忆文件权限为0600", statSync(memoryPath()).mode % 0o1000 === 0o600);

const writeInvalid = (value: unknown) => {
  mkdirSync(dirname(memoryPath()), { recursive: true });
  writeFileSync(memoryPath(), JSON.stringify(value));
  chmodSync(memoryPath(), 0o600);
};

writeInvalid({ prefs: {}, watched: [null], events: [] });
let watchedRejected = false;
try { loadMemory(); } catch { watchedRejected = true; }
check("损坏 watched 元素被拒绝", watchedRejected);

writeInvalid({ prefs: {}, watched: [], events: ["bad-event"] });
let eventRejected = false;
try { loadMemory(); } catch { eventRejected = true; }
check("损坏 events 元素被拒绝", eventRejected);

writeInvalid({ prefs: { unknown_key: "x" }, watched: [], events: [] });
let prefsRejected = false;
try { loadMemory(); } catch { prefsRejected = true; }
check("未知 prefs 键被拒绝", prefsRejected);

console.log(`\n${fail === 0 ? "✓ PASS" : "✗ FAIL"}  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
