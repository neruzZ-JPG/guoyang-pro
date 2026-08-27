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
//   - 分页:offset 实测是从 1 开始的页码，不是条目偏移:
//       offset=1&limit=20 -> 第1页;offset=2&limit=20 -> 第2页。
//     故翻页须 offset += 1。
//   - 单条字段(真实命名):
//       recName       企业名
//       jobName       岗位名 / 招聘公告标题
//       degreeName    学历(如"本科及以上")
//       areaCodeName  工作地(省/直辖市,如"北京")
//       major         专业(常为空字符串)
//       headCount     招聘人数
//       recProperty   单位性质(如"国有企业"/"其他")← company_nature 过滤依据
//       recruitType   聚合源枚举语义不稳定,不能直接当校招/社招
//       highMonthPay/lowMonthPay 月薪区间(千元/月量级,0 表示面议)
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
import { inferRecruitType } from "../codes.js";

const HOST = "www.ncss.cn";
const LIST_PATH = "/student/jobs/jobslist/ajax/";
const HOMEPAGE = "https://www.ncss.cn/";
const DETAIL_BASE = "https://www.ncss.cn/student/jobs/";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const TIMEOUT_MS = 15_000;
// 接口会把更大的 limit 静默截为 20；按真实页长翻页，避免误判“已到末页”。
const PAGE_SIZE = 20;

// 央企/国企性质白名单(recProperty 的取值)。
const STATE_OWNED_VALUES = new Set(["国有企业", "中央企业", "央企", "国企"]);

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

// 24365 列表值 5/10 等对应常见的 5k/10k 月薪量级，不是 5万/10万元。
// 详情页常需登录，故明确标注列表口径与“仅供参考”。
function fmtSalary(low: unknown, high: unknown): string | undefined {
  const lo = typeof low === "number" ? low : NaN;
  const hi = typeof high === "number" ? high : NaN;
  const valid = (n: number) => Number.isFinite(n) && n > 0;
  if (!valid(lo) && !valid(hi)) return "面议(来源:24365列表,仅供参考)";
  if (valid(lo) && valid(hi))
    return `${lo}-${hi}千元/月(来源:24365列表,仅供参考)`;
  const one = valid(lo) ? lo : hi;
  return `约${one}千元/月(来源:24365列表,仅供参考)`;
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
  const major = str(r.major); // 常为空,留空交由 live.ts 归一化为“未标注”
  const headcount =
    typeof r.headCount === "number" && Number.isFinite(r.headCount) && r.headCount > 0
      ? r.headCount
      : undefined;
  const salary_ref = fmtSalary(r.lowMonthPay, r.highMonthPay);

  // recruitType 在智联/高校/国聘等聚合记录中长期为 0,与标题语义会冲突。
  // 只依据明确文字推断；无法确认则 unknown,避免把校招误标为社招。
  const recruit_type = inferRecruitType(
    `${title} ${str(r.recTags) ?? ""} ${str(r.sourcesNameCh) ?? ""}`,
  );

  const jobId = str(r.jobId);
  const apply_url = jobId ? `${DETAIL_BASE}${jobId}.html` : undefined;

  const recProperty = str(r.recProperty);
  const sourceName = str(r.sourcesNameCh);
  const remarks = [
    recProperty ? `单位性质:${recProperty}` : "",
    sourceName ? `聚合来源:${sourceName}` : "",
    `招聘类型:${recruit_type === "unknown" ? "上游未可靠标注" : "由岗位文字推断"}`,
  ].filter(Boolean).join(" | ");

  const pos: RawPosition = {
    id: jobId,
    enterprise_name,
    title,
    work_location,
    education,
    major,
    headcount,
    recruit_type,
    salary_ref,
    apply_url,
    source: apply_url ?? HOMEPAGE,
    source_id: "ncss",
    source_position_id: jobId,
    posted_at:
      typeof r.publishDate === "number" && Number.isFinite(r.publishDate)
        ? new Date(r.publishDate).toISOString().slice(0, 10)
        : undefined,
    remarks: remarks || undefined,
    quality_warnings: recruit_type === "unknown"
      ? ["24365 的 recruitType 枚举不可靠，本岗位未从文字中识别招聘类型"]
      : undefined,
  };
  for (const k of Object.keys(pos) as (keyof RawPosition)[]) {
    if (pos[k] === undefined) delete pos[k];
  }
  return pos;
}

// 是否央企/国企(按原始记录的 recProperty 判定)。
export function isStateOwned(rec: unknown): boolean {
  if (!rec || typeof rec !== "object") return false;
  const p = (rec as Record<string, unknown>).recProperty;
  return typeof p === "string" && STATE_OWNED_VALUES.has(p.trim());
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

export function responseError(json: unknown): string | undefined {
  if (!json || typeof json !== "object") return "malformed response";
  const record = json as Record<string, unknown>;
  if (record.flag !== true) {
    const errors = Array.isArray(record.errors) ? record.errors.join("; ") : String(record.errors ?? "");
    return errors || `unexpected response flag: ${String(record.flag)}`;
  }
  if (Array.isArray(record.errors) && record.errors.length > 0) return record.errors.join("; ");
  const data = record.data;
  if (!data || typeof data !== "object") return "missing response data";
  if (!Array.isArray((data as Record<string, unknown>).list)) return "missing response list";
  return undefined;
}

function totalPages(json: unknown): number | undefined {
  if (!json || typeof json !== "object") return undefined;
  const data = (json as Record<string, unknown>).data;
  if (!data || typeof data !== "object") return undefined;
  const pagenation = (data as Record<string, unknown>).pagenation;
  if (!pagenation || typeof pagenation !== "object") return undefined;
  const total = Number((pagenation as Record<string, unknown>).total);
  return Number.isInteger(total) && total > 0 ? total : undefined;
}

function buildPath(params: FetchParams, page: number, limit: number): string {
  const q = new URLSearchParams();
  q.set("offset", String(page));
  q.set("limit", String(limit));
  // keyword/areaCodeName 实测会被接口忽略，不伪装为服务端已过滤。
  void params;
  return `${LIST_PATH}?${q.toString()}`;
}

function includes(haystack: unknown, needle?: string): boolean {
  return !needle || String(haystack ?? "").toLowerCase().includes(needle.toLowerCase());
}

function matchesSourceFilters(p: RawPosition, params: FetchParams): boolean {
  if (!includes(p.enterprise_name, params.enterprise)) return false;
  if (!includes(p.work_location, params.location)) return false;
  if (params.recruit_type && p.recruit_type !== params.recruit_type) return false;
  if (params.keyword) {
    const hay = [
      p.enterprise_name, p.title, p.work_location, p.major, p.education, p.remarks,
    ].filter(Boolean).join(" ");
    if (!includes(hay, params.keyword)) return false;
  }
  return true;
}

const adapter: SourceAdapter = {
  id: "ncss",
  name: "24365 国家大学生就业服务平台",
  homepage: HOMEPAGE,
  scopes: ["campus", "social", "intern", "unknown"],
  // curl 实测:无登录态稳定拉到真实在招岗位 -> live:true。
  live: true,
  kind: "aggregator",
  priority: 40,
  coverage: "24365 聚合列表中单位性质明确为央企/国企的岗位，以高校毕业生岗位为主。",
  quality:
    "仅保留 recProperty 明确为国有/央企/国企的记录；招聘类型只按明确文字推断，薪资按千元/月列表口径展示。",
  async fetch(params: FetchParams): Promise<FetchResult> {
    const fetchedAt = new Date().toISOString();
    const requestedLimit = params.limit ?? 50;
    const requestedScanLimit = params.scan_limit ?? Math.max(requestedLimit * 20, 1000);
    if (requestedScanLimit < requestedLimit) {
      return {
        ok: false, source: "ncss", positions: [], scanned: 0, exhausted: false,
        truncated: true, fetched_at: fetchedAt,
        error: "scan_limit must be greater than or equal to limit",
      };
    }
    const want = Math.max(1, Math.min(requestedLimit, 5000));
    const scanLimit = Math.max(1, Math.min(requestedScanLimit, 5000));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let scanned = 0;
    const positions: RawPosition[] = [];
    const seen = new Set<string>();
    let exhausted = false;
    let stoppedByLimit = false;
    try {
      let page = 1;
      let previousPageSignature = "";

      // 上游不可靠地下推筛选，因此按 scan_limit 分页扫描并在客户端严格复核。
      while (positions.length < want && scanned < scanLimit) {
        const path = buildPath(params, page, PAGE_SIZE);
        const json = await httpGetJson(path, controller.signal);
        const upstreamError = responseError(json);
        if (upstreamError) {
          if (positions.length > 0) {
            return {
              ok: true,
              source: "ncss",
              positions,
              scanned,
              exhausted: false,
              truncated: true,
              fetched_at: fetchedAt,
              note: `上游在第 ${page} 页拒绝/异常，保留 ${positions.length} 条已验证结果: ${upstreamError}`,
            };
          }
          return {
            ok: false,
            source: "ncss",
            positions: [],
            scanned,
            exhausted: false,
            truncated: true,
            fetched_at: fetchedAt,
            error: upstreamError,
          };
        }
        const list = extractList(json);
        const pages = totalPages(json);
        if (list.length === 0) { exhausted = true; break; }
        const pageSignature = list
          .map((rec) => {
            if (!rec || typeof rec !== "object") return "";
            return String((rec as Record<string, unknown>).jobId ?? "");
          })
          .join("|");
        if (pageSignature && pageSignature === previousPageSignature) {
          return {
            ok: true,
            source: "ncss",
            positions,
            scanned,
            exhausted: false,
            truncated: true,
            fetched_at: fetchedAt,
            note: "上游返回重复分页，已停止扫描并保留已验证结果",
          };
        }
        previousPageSignature = pageSignature;
        const remaining = scanLimit - scanned;
        const inspected = list.slice(0, remaining);

        for (const rec of inspected) {
          scanned++;
          if (!isStateOwned(rec)) continue; // 只保留央企/国企。
          const p = parseRecord(rec);
          const key = p?.source_position_id || p?.id;
          if (p && key && !seen.has(key) && matchesSourceFilters(p, params)) {
            seen.add(key);
            positions.push(p);
          }
          if (positions.length >= want) { stoppedByLimit = true; break; }
        }

        const inspectedWholePage = inspected.length === list.length;
        if (
          !stoppedByLimit &&
          inspectedWholePage &&
          (list.length < PAGE_SIZE || (pages !== undefined && page >= pages))
        ) {
          exhausted = true;
          break;
        }
        page += 1;
      }

      const truncated = !exhausted && (stoppedByLimit || scanned >= scanLimit);
      return {
        ok: true,
        source: "ncss",
        positions,
        total: exhausted ? positions.length : undefined,
        scanned,
        exhausted,
        truncated,
        fetched_at: fetchedAt,
        note:
          stoppedByLimit
            ? `达到返回上限 ${want}，源中可能还有更多匹配岗位`
            : positions.length > 0
              ? "已按单位性质和查询条件在客户端复核；招聘类型未知的记录不会冒充校招/社招。"
            : `已扫描 ${scanned} 条，本次未命中；${exhausted ? "已到列表末尾" : "达到扫描/超时边界，不能据此断言全源无岗位"}`,
      };
    } catch (err) {
      if (positions.length > 0) {
        return {
          ok: true,
          source: "ncss",
          positions,
          scanned,
          exhausted: false,
          truncated: true,
          fetched_at: fetchedAt,
          note: `扫描中断，保留 ${positions.length} 条已验证结果: ${
            err instanceof Error ? err.message : String(err)
          }`,
        };
      }
      return {
        ok: false,
        source: "ncss",
        positions: [],
        scanned,
        exhausted: false,
        truncated: true,
        fetched_at: fetchedAt,
        error: err instanceof Error ? err.message : String(err),
        note: "fetch 失败:网络/超时,或接口被重定向到登录页。",
      };
    } finally {
      clearTimeout(timer);
    }
  },
};

export default adapter;
