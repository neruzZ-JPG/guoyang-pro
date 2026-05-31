// cli/src/adapters/ncss.ts
// 24365 国家大学生就业服务平台 (www.ncss.cn) 实时岗位适配器。
//
// 网络层用 node:https + HTTP/1.1,零运行时依赖(仿照 iguopin 范本)。
// 导出 parseRecord 便于单测(给定一条原始 JSON 记录 -> RawPosition)。
//
// ── 逆向结论(curl 实测,2026-06)─────────────────────────────────────
// 列表接口:GET https://www.ncss.cn/student/jobs/jobslist/ajax/?offset=&limit=
//   - 无需登录 / 无需 Cookie:浏览器 UA + Referer 即可,返回
//     application/json;charset=UTF-8,HTTP 200,稳定拿到真实在招岗位。
//   - 响应外壳:{ flag, errors, data: { list: [...] } }。
//   - 分页:offset 是"条目偏移"(非页码),每次按 limit 步进:
//       offset=1&limit=3 -> 第1~3条;offset=2&limit=3 -> 第2~4条。
//     故翻页须 offset += limit(否则会重复)。
//   - 单条字段(真实命名):
//       recName       企业名
//       jobName       岗位名 / 招聘公告标题
//       degreeName    学历(如"本科及以上")
//       areaCodeName  工作地(省/直辖市,如"北京")
//       major         专业(常为空字符串)
//       headCount     招聘人数
//       recProperty   单位性质(如"国有企业"/"其他")← company_nature 过滤依据
//       recruitType   "1"=校园招聘 "0"=社会招聘(实测)
//       highMonthPay/lowMonthPay 月薪区间(单位:万/月,0 表示面议)
//       jobId         岗位 id(详情页 = https://www.ncss.cn/student/jobs/{jobId}.html)
//   - 详情链接落在 ncss.cn 本站(jobId),与国聘(iguopin)是两套库,非简单重复。
//
// company_nature 过滤:接口未发现稳定的服务端 nature 过滤参数(试 recProperty/
// companyType/nature 均未生效),故在适配器内对 recProperty 做"央企/国企"客户端过滤
// (FetchParams 无 nature 字段,这里默认只保留国企/央企记录,贴合本项目"国央企"定位)。
//
// 诚实披露(写进 fetch 的 note):24365 仍以高校毕业生岗为主,部分单位会同步把
// 岗位投到国聘;入库时应与 iguopin 适配器结果按"企业+岗位+地点"去重(live.ts 已做)。
// 实测能稳定拉到真实岗位,故 live:true。
// ────────────────────────────────────────────────────────────────────

import https from "node:https";
import type {
  SourceAdapter,
  FetchParams,
  FetchResult,
  RawPosition,
} from "./types.js";

const HOST = "www.ncss.cn";
const LIST_PATH = "/student/jobs/jobslist/ajax/";
const HOMEPAGE = "https://www.ncss.cn/";
const DETAIL_BASE = "https://www.ncss.cn/student/jobs/";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const TIMEOUT_MS = 10_000;
const PAGE_SIZE = 20;

// 央企/国企性质白名单(recProperty 的取值)。
const STATE_OWNED_RE = /国有|央企|国企|事业单位/;

// ── 网络层:node:https GET(HTTP/1.1,浏览器 UA/Referer),返回解析后的 JSON ──
function httpGetJson(path: string, signal: AbortSignal): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: HOST,
        path,
        method: "GET",
        headers: {
          "User-Agent": UA,
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "zh-CN,zh;q=0.9",
          Referer: HOMEPAGE,
          "X-Requested-With": "XMLHttpRequest",
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c as Buffer));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          const code = res.statusCode ?? 0;
          if (code >= 400) {
            reject(new Error(`HTTP ${code}`));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch {
            reject(new Error("non-JSON response (likely login redirect)"));
          }
        });
      },
    );
    req.on("error", reject);
    const onAbort = () => req.destroy(new Error("aborted"));
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
    req.end();
  });
}

// 月薪区间(单位:万/月,0 表示面议)-> 人类可读薪资参考。
function fmtSalary(low: unknown, high: unknown): string | undefined {
  const lo = typeof low === "number" ? low : NaN;
  const hi = typeof high === "number" ? high : NaN;
  const valid = (n: number) => Number.isFinite(n) && n > 0;
  if (!valid(lo) && !valid(hi)) return "面议(来源:24365,仅供参考)";
  if (valid(lo) && valid(hi))
    return `${lo}-${hi}万/月(来源:24365,仅供参考)`;
  const one = valid(lo) ? lo : hi;
  return `约${one}万/月(来源:24365,仅供参考)`;
}

// ── 字段映射:一条原始记录 -> RawPosition(导出便于测试)──────────────────
export function parseRecord(rec: unknown): RawPosition | null {
  if (!rec || typeof rec !== "object") return null;
  const r = rec as Record<string, unknown>;

  const str = (v: unknown): string | undefined => {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
    return undefined;
  };

  const enterprise_name = str(r.recName);
  const title = str(r.jobName);
  // 契约硬要求:企业名 + 岗位名缺一不可。
  if (!enterprise_name || !title) return null;

  const work_location = str(r.areaCodeName);
  const education = str(r.degreeName);
  const major = str(r.major); // 常为空,留空交由 live.ts 归一化为"不限"
  const headcount =
    typeof r.headCount === "number" && Number.isFinite(r.headCount)
      ? r.headCount
      : undefined;
  const salary_ref = fmtSalary(r.lowMonthPay, r.highMonthPay);

  // recruitType: "1"=校招 "0"=社招(实测)。其余按校招(24365 主打毕业生)。
  const recruit_type: RawPosition["recruit_type"] =
    String(r.recruitType) === "0" ? "social" : "campus";

  const jobId = str(r.jobId);
  const apply_url = jobId ? `${DETAIL_BASE}${jobId}.html` : undefined;

  const recProperty = str(r.recProperty);
  const remarks = recProperty
    ? `单位性质:${recProperty}(24365)`
    : undefined;

  const pos: RawPosition = {
    enterprise_name,
    title,
    work_location,
    education,
    major,
    headcount,
    recruit_type,
    salary_ref,
    apply_url,
    source: "ncss",
    posted_at:
      typeof r.publishDate === "number"
        ? new Date(r.publishDate).toISOString().slice(0, 10)
        : undefined,
    remarks,
  };
  for (const k of Object.keys(pos) as (keyof RawPosition)[]) {
    if (pos[k] === undefined) delete pos[k];
  }
  return pos;
}

// 是否央企/国企(按原始记录的 recProperty 判定)。
function isStateOwned(rec: unknown): boolean {
  if (!rec || typeof rec !== "object") return false;
  const p = (rec as Record<string, unknown>).recProperty;
  return typeof p === "string" && STATE_OWNED_RE.test(p);
}

function extractList(json: unknown): unknown[] {
  if (!json || typeof json !== "object") return [];
  const data = (json as Record<string, unknown>).data;
  if (data && typeof data === "object") {
    const list = (data as Record<string, unknown>).list;
    if (Array.isArray(list)) return list;
  }
  return [];
}

function buildPath(params: FetchParams, offset: number, limit: number): string {
  const q = new URLSearchParams();
  q.set("offset", String(offset));
  q.set("limit", String(limit));
  if (params.keyword) q.set("keyword", params.keyword);
  if (params.location) q.set("areaCodeName", params.location);
  return `${LIST_PATH}?${q.toString()}`;
}

const adapter: SourceAdapter = {
  id: "ncss",
  name: "24365 国家大学生就业服务平台",
  homepage: HOMEPAGE,
  scopes: ["campus", "social"],
  // curl 实测:无登录态稳定拉到真实在招岗位 -> live:true。
  live: true,
  async fetch(params: FetchParams): Promise<FetchResult> {
    const want = Math.max(1, params.limit ?? PAGE_SIZE);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const positions: RawPosition[] = [];
      let offset = 1; // 条目偏移,从 1 起。
      let guard = 0; // 防止接口异常导致死循环。

      // 因要在客户端按"国企/央企"过滤,可能需多翻几页才凑够 want。
      while (positions.length < want && guard < 50) {
        guard++;
        const path = buildPath(params, offset, PAGE_SIZE);
        const json = await httpGetJson(path, controller.signal);
        const list = extractList(json);
        if (list.length === 0) break; // 到底或被拦截。

        for (const rec of list) {
          if (!isStateOwned(rec)) continue; // 只保留央企/国企。
          const p = parseRecord(rec);
          if (p) positions.push(p);
          if (positions.length >= want) break;
        }

        if (list.length < PAGE_SIZE) break; // 最后一页。
        offset += PAGE_SIZE; // 关键:offset 按 limit 步进(非 +1)。
      }

      if (positions.length === 0) {
        return {
          ok: false,
          source: "ncss",
          positions: [],
          error: "no state-owned positions matched (or upstream returned empty)",
          note: "24365 列表可拉取,但本次未命中国企/央企(recProperty)记录。",
        };
      }

      return {
        ok: true,
        source: "ncss",
        positions,
        note:
          "24365 已按 recProperty 客户端过滤为国企/央企;部分岗位与国聘重叠,live.ts 会按企业+岗位+地点去重。",
      };
    } catch (err) {
      return {
        ok: false,
        source: "ncss",
        positions: [],
        error: err instanceof Error ? err.message : String(err),
        note: "fetch 失败:网络/超时,或接口被重定向到登录页。",
      };
    } finally {
      clearTimeout(timer);
    }
  },
};

export default adapter;
