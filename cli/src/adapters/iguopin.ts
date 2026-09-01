// cli/src/adapters/iguopin.ts
// 国聘网(国资委牵头,覆盖85%+央企国企岗)实时适配器 —— 本产品主源。
// 逆向接口:POST https://gp-api.iguopin.com/api/jobs/v1/list (v1 公开免签名免登录;v3 才需签名)。
//   筛选码必须传【数组】:company_nature 央企=116wwMpd 国企=11AzDak;
//   recruitment_type 校招=1161T1j6 社招=115amZVP。page/page_size(≤200);
//   total 字段不可信(占位≈page×page_size),靠 list 空判断到底。
// 网络层用 node:https(HTTP/1.1):该接口经某些 HTTP/2 代理会返回空 list,h1.1 稳定;
//   node:https 为内置模块,保持零依赖。自动处理 gzip/deflate/br 解压。
import { request } from "node:https";
import { gunzipSync, inflateSync, brotliDecompressSync } from "node:zlib";
import type {
  DetailResult, SourceAdapter, FetchParams, FetchResult, RawPosition,
} from "./types.js";
import { inferSector, type RecruitType } from "../codes.js";

const API = "https://gp-api.iguopin.com/api/jobs/v1/list";
const DETAIL_API = "https://gp-api.iguopin.com/api/jobs/v1/info";
const DISTRICT_API = "https://gp-api.iguopin.com/api/base/districts/v1/tree?code=000000&level=2";
const TOTAL_TIMEOUT_MS = 20_000;

function requestJson(
  url: string,
  options: { method?: "GET" | "POST"; body?: Record<string, unknown>; timeoutMs?: number } = {},
): Promise<any> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const method = options.method ?? "GET";
    const data = options.body ? Buffer.from(JSON.stringify(options.body)) : undefined;
    const req = request(
      {
        hostname: u.hostname, path: `${u.pathname}${u.search}`, method, port: 443,
        headers: {
          ...(data
            ? { "Content-Type": "application/json", "Content-Length": data.length }
            : {}),
          "Origin": "https://www.iguopin.com",
          "Referer": "https://www.iguopin.com/",
          "Accept-Encoding": "gzip, deflate, br",
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("error", (error) => {
          clearTimeout(absoluteTimer);
          reject(error);
        });
        res.on("end", () => {
          clearTimeout(absoluteTimer);
          try {
            const status = res.statusCode ?? 0;
            if (status < 200 || status >= 300) {
              reject(new Error(`HTTP ${status}`));
              return;
            }
            let buf = Buffer.concat(chunks);
            const enc = res.headers["content-encoding"];
            if (enc === "gzip") buf = gunzipSync(buf);
            else if (enc === "deflate") buf = inflateSync(buf);
            else if (enc === "br") buf = brotliDecompressSync(buf);
            const text = buf.toString("utf-8");
            resolve(text ? JSON.parse(text) : null);
          } catch (e) { reject(e); }
        });
      },
    );
    const absoluteTimer = setTimeout(
      () => req.destroy(new Error("absolute timeout")),
      options.timeoutMs ?? 12_000,
    );
    req.on("error", (error) => {
      clearTimeout(absoluteTimer);
      reject(error);
    });
    req.setTimeout(options.timeoutMs ?? 12_000, () => req.destroy(new Error("timeout")));
    req.once("close", () => clearTimeout(absoluteTimer));
    if (data) req.write(data);
    req.end();
  });
}

function postJson(body: Record<string, unknown>, timeoutMs = 12_000): Promise<any> {
  return requestJson(API, { method: "POST", body, timeoutMs });
}

type IGuopinTransport = {
  postList: (body: Record<string, unknown>, timeoutMs?: number) => Promise<any>;
  getJson: (url: string) => Promise<any>;
};

const defaultTransport: IGuopinTransport = {
  postList: postJson,
  getJson: (url) => requestJson(url),
};

let http: IGuopinTransport = defaultTransport;

export function setIGuopinTransportForTest(
  transport?: Partial<IGuopinTransport>,
): void {
  http = transport ? { ...defaultTransport, ...transport } : defaultTransport;
  districtTreePromise = undefined;
}

const RECRUIT_CODE: Record<RecruitType, string | null> = {
  campus: "1161T1j6",
  social: "115amZVP",
  intern: null, // 国聘无独立实习码,实习多并入校招;不单独过滤
  unknown: null,
};

function recruitTypeOf(cn: string): RecruitType {
  const matches: RecruitType[] = [];
  if (cn?.includes("校园") || cn?.includes("校招") || cn?.includes("应届")) matches.push("campus");
  if (cn?.includes("实习")) matches.push("intern");
  if (cn?.includes("社会") || cn?.includes("社招")) matches.push("social");
  return matches.length === 1 ? matches[0] : "unknown";
}

function salaryRef(rec: any): { value?: string; warning?: string } {
  if (rec.is_negotiable === true) {
    return { value: "面议(来源:国聘,仅供参考)" };
  }
  if (!rec.min_wage && !rec.max_wage) {
    return { warning: "国聘未标注薪资，未将缺失值解释为面议" };
  }
  const unit = typeof rec.wage_unit_cn === "string" && rec.wage_unit_cn
    ? rec.wage_unit_cn
    : undefined;
  const months = rec.months ? `×${rec.months}个月` : "";
  const range = rec.min_wage && rec.max_wage
    ? `${rec.min_wage}-${rec.max_wage}`
    : `${rec.min_wage || rec.max_wage}`;
  return unit
    ? { value: `${range}${unit}${months}(来源:国聘,仅供参考)` }
    : {
        value: `${range}${months}(单位未标注;来源:国聘,仅供参考)`,
        warning: "国聘薪资单位未标注，未猜测单位",
      };
}

function locationOf(rec: any): string {
  const dl = rec.district_list;
  if (Array.isArray(dl) && dl.length) {
    return [...new Set(dl.map((d: any) => d.area_cn || d.city || d.province).filter(Boolean))].join("、");
  }
  return rec.company_info?.district_list?.[0]?.area_cn || "";
}

function majorOf(rec: any): string | undefined {
  const m = rec.major_cn;
  if (Array.isArray(m) && m.length) return m.join("、");
  if (typeof m === "string" && m) return m;
  return undefined;
}

function descriptionFields(contents: unknown): {
  desc?: string;
  requirements?: string;
  political?: string;
} {
  if (typeof contents !== "string") return {};
  const clean = contents
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!clean) return {};
  const marker = clean.search(/(?:任职要求|岗位要求|资格条件)[：:]/);
  const desc = marker >= 0 ? clean.slice(0, marker).trim() : clean;
  const requirements = marker >= 0 ? clean.slice(marker).trim() : undefined;
  return {
    desc: desc || undefined,
    requirements,
    political: /中共党员|中国共产党党员|党员优先/.test(clean)
      ? "中共党员或相关要求（以原文为准）"
      : undefined,
  };
}

// 导出供离线 fixture 单测:把国聘一条原始记录映射为 RawPosition。
export function parseRecord(rec: any): RawPosition | null {
  const sourcePositionId = String(rec.job_id ?? "");
  const sourceUrl = sourcePositionId
    ? `https://www.iguopin.com/job/detail?id=${sourcePositionId}`
    : "https://www.iguopin.com/";
  const industry = rec.company_info?.industry_cn || "";
  const enterpriseName = String(rec.company_name || rec.company_info?.name || "").trim();
  const title = String(rec.job_name || "").trim();
  if (!sourcePositionId || !enterpriseName || !title) return null;
  const recruitType = recruitTypeOf(rec.recruitment_type_cn);
  const sector = inferSector(industry) || inferSector(enterpriseName);
  const salary = salaryRef(rec);
  const description = descriptionFields(rec.contents);
  const warnings: string[] = [];
  if (sector && industry) warnings.push(`行业由国聘企业行业“${industry}”归一化`);
  if (recruitType === "unknown") warnings.push("国聘招聘类型字段缺失或未知，本岗位标为 unknown");
  if (salary.warning) warnings.push(salary.warning);
  return {
    id: sourcePositionId,
    enterprise_name: enterpriseName,
    title,
    sector,
    recruit_type: recruitType,
    work_location: locationOf(rec),
    headcount: Number(rec.amount) || 1,
    education: rec.education_cn || "",
    major: majorOf(rec),
    salary_ref: salary.value,
    experience: rec.experience_cn || undefined,
    desc: description.desc,
    requirements: description.requirements,
    political: description.political,
    remarks: [
      rec.nature_cn,
      rec.company_info?.nature_cn ? `单位性质:${rec.company_info.nature_cn}` : "",
      industry ? `行业:${industry}` : "",
      rec.company_info?.scale_cn,
    ].filter(Boolean).join(" | ") || undefined,
    deadline: rec.end_time || undefined,
    posted_at: rec.start_time || rec.create_time || undefined,
    apply_url: sourcePositionId ? sourceUrl : undefined,
    source: sourceUrl,
    source_id: "iguopin",
    source_position_id: sourcePositionId || undefined,
    source_company_id: rec.company_id ? String(rec.company_id) : undefined,
    quality_warnings: warnings.length ? warnings : undefined,
  };
}

const STATE_OWNED_CODES = new Set(["116wwMpd", "11AzDak"]);

export function isStateOwnedRecord(rec: any): boolean {
  const code = rec?.company_info?.nature;
  return typeof code === "string" && STATE_OWNED_CODES.has(code);
}

export function responseError(json: any): string | undefined {
  if (!json || typeof json !== "object") return "malformed response";
  if (json.code !== 200) return `code=${json.code} msg=${json.msg}`;
  if (!json.data || typeof json.data !== "object") return "missing response data";
  if (!Array.isArray(json.data.list)) return "missing response list";
  return undefined;
}

export function detailResponseError(json: any): string | undefined {
  if (!json || typeof json !== "object") return "malformed response";
  if (json.code !== 200) return `code=${json.code} msg=${json.msg}`;
  if (!json.data || typeof json.data !== "object") return "missing response data";
  return undefined;
}

type DistrictNode = {
  value?: string;
  label?: string;
  name?: string;
  parent_code?: string;
  children?: DistrictNode[] | null;
};

let districtTreePromise: Promise<DistrictNode[]> | undefined;

function normalizedDistrictName(value: string): string {
  return value.normalize("NFKC").replace(/省|市|自治区|特别行政区|\s/g, "");
}

function districtPaths(nodes: DistrictNode[], parents: string[] = []): {
  code: string;
  label: string;
}[] {
  const out: { code: string; label: string }[] = [];
  for (const node of nodes) {
    const value = String(node.value ?? "");
    if (!value) continue;
    const path = [...parents, value];
    if (value !== "000000") {
      out.push({
        code: path.join("."),
        label: String(node.label || node.name || ""),
      });
    }
    if (node.children?.length) out.push(...districtPaths(node.children, path));
  }
  return out;
}

async function resolveDistrictCodes(
  location: string | undefined,
  getJson: (url: string) => Promise<any>,
): Promise<string[]> {
  if (!location) return [];
  districtTreePromise ??= getJson(DISTRICT_API)
    .then((json) => {
      if (json?.code !== 200 || !Array.isArray(json?.data)) {
        throw new Error(`district tree: code=${json?.code} msg=${json?.msg}`);
      }
      return json.data as DistrictNode[];
    })
    .catch((error) => {
      districtTreePromise = undefined;
      throw error;
    });
  const target = normalizedDistrictName(location);
  const paths = districtPaths(await districtTreePromise);
  return [...new Set(paths
    .filter(({ label }) => normalizedDistrictName(label) === target)
    .map(({ code }) => code))];
}

function includes(haystack: unknown, needle?: string): boolean {
  return !needle || String(haystack ?? "").toLowerCase().includes(needle.toLowerCase());
}

function matchesSourceFilters(p: RawPosition, params: FetchParams): boolean {
  if (!includes(p.enterprise_name, params.enterprise ?? params.enterprise_hint)) return false;
  if (!includes(p.work_location, params.location)) return false;
  if (params.recruit_type && p.recruit_type !== params.recruit_type) return false;
  if (params.sector && p.sector !== params.sector) return false;
  if (params.education && !includes(p.education, params.education)) return false;
  if (params.major && !includes(p.major, params.major) && !includes(p.major, "不限")) return false;
  if (params.keyword) {
    const hay = [
      p.enterprise_name, p.title, p.work_location, p.major, p.education,
      p.desc, p.remarks,
    ].filter(Boolean).join(" ");
    if (!includes(hay, params.keyword)) return false;
  }
  return true;
}

const adapter: SourceAdapter = {
  id: "iguopin",
  name: "国聘网",
  homepage: "https://www.iguopin.com/",
  scopes: ["campus", "social", "intern", "unknown"],
  live: true,
  kind: "aggregator",
  priority: 60,
  coverage: "经国聘发布且单位性质代码明确为央企/国企的校园、社会、实习及未标注岗位。",
  quality: "企业性质、招聘类型、地点、学历和薪资来自国聘列表；行业由企业行业字段保守归一化。",
  async fetchDetail(sourcePositionId: string): Promise<DetailResult> {
    const fetchedAt = new Date().toISOString();
    if (!/^\d+$/.test(sourcePositionId)) {
      return {
        ok: false, source: this.id, fetched_at: fetchedAt,
        error: "国聘岗位 id 必须为数字",
      };
    }
    try {
      const json = await http.getJson(
        `${DETAIL_API}?id=${encodeURIComponent(sourcePositionId)}`,
      );
      const protocolError = detailResponseError(json);
      if (protocolError) {
        return {
          ok: false, source: this.id, fetched_at: fetchedAt, error: protocolError,
        };
      }
      if (Number(json.data.status) !== 1) {
        return {
          ok: false, source: this.id, fetched_at: fetchedAt,
          error: `position ${sourcePositionId} is not active`,
        };
      }
      const position = parseRecord(json.data);
      return position
        ? { ok: true, source: this.id, fetched_at: fetchedAt, position }
        : {
            ok: false, source: this.id, fetched_at: fetchedAt,
            error: `position ${sourcePositionId} has incomplete detail data`,
          };
    } catch (error: any) {
      return {
        ok: false, source: this.id, fetched_at: fetchedAt,
        error: error?.message ?? String(error),
      };
    }
  },
  async fetch(params: FetchParams): Promise<FetchResult> {
    const fetchedAt = new Date().toISOString();
    const requestedLimit = params.limit ?? 50;
    const requestedScanLimit = params.scan_limit ?? Math.max(requestedLimit * 10, 500);
    if (requestedScanLimit < requestedLimit) {
      return {
        ok: false, source: this.id, positions: [], scanned: 0, exhausted: false,
        truncated: true, fetched_at: fetchedAt,
        error: "scan_limit must be greater than or equal to limit",
      };
    }
    const want = Math.max(1, Math.min(requestedLimit, 5000));
    const scanLimit = Math.max(1, Math.min(requestedScanLimit, 5000));
    const pageSize = 100;
    // 默认锁定"国央企":央企 + 国企(company_nature 接受数组,OR 关系)
    const company_nature = ["116wwMpd", "11AzDak"];
    const recruitment_type: string[] = [];
    if (params.recruit_type) {
      const code = RECRUIT_CODE[params.recruit_type];
      if (code) recruitment_type.push(code);
    }
    let district: string[] = [];
    try {
      district = await resolveDistrictCodes(params.location, http.getJson);
    } catch {
      // 地区树失败时仍保留原来的全局实时扫描和本地复核。
    }
    const enterpriseHint = params.enterprise ?? params.enterprise_hint;

    const out: RawPosition[] = [];
    const seen = new Set<string>();
    let page = 1;
    let scanned = 0;
    let exhausted = false;
    let stoppedByLimit = false;
    const deadline = Date.now() + TOTAL_TIMEOUT_MS;
    try {
      while (out.length < want && scanned < scanLimit) {
        const remainingMs = deadline - Date.now();
        if (remainingMs <= 0) throw new Error("overall timeout");
        const body: Record<string, unknown> = { page, page_size: pageSize, company_nature };
        if (recruitment_type.length) body.recruitment_type = recruitment_type;
        if (district.length) body.district = district;
        if (enterpriseHint) body.company_name = enterpriseHint;
        // keyword 服务端参数实测会返回大量无关记录，统一在客户端复核，避免错误下推漏召回。
        const json = await http.postList(body, Math.min(12_000, remainingMs));
        const protocolError = responseError(json);
        if (protocolError) {
          return out.length > 0
            ? {
                ok: true, source: this.id, positions: out,
                scanned, exhausted: false, truncated: true, fetched_at: fetchedAt,
                note: `部分结果(上游业务/协议错误: ${protocolError})`,
              }
            : {
                ok: false, source: this.id, positions: [], scanned, exhausted: false,
                truncated: true, fetched_at: fetchedAt, error: protocolError,
              };
        }
        const list: any[] = json.data.list;
        if (list.length === 0) { exhausted = true; break; }
        const remaining = scanLimit - scanned;
        const inspected = list.slice(0, remaining);
        for (const rec of inspected) {
          scanned++;
          if (!isStateOwnedRecord(rec)) continue;
          const r = parseRecord(rec);
          if (!r || !r.id || seen.has(r.id)) continue;
          seen.add(r.id);
          if (matchesSourceFilters(r, params)) out.push(r);
          if (out.length >= want) { stoppedByLimit = true; break; }
        }
        const inspectedWholePage = inspected.length === list.length;
        if (!stoppedByLimit && inspectedWholePage && list.length < pageSize) {
          exhausted = true;
          break;
        }
        page++;
      }
    } catch (e: any) {
      if (out.length === 0) {
        const hint = /aborted|timeout|fetch failed|ECONN|ENOTFOUND/i.test(e?.message || "")
          ? "网络不可达(国聘 gp-api;受限网络/沙箱会失败,正常机器可访问)" : e?.message;
        return {
          ok: false, source: this.id, positions: [], scanned, exhausted: false,
          truncated: true, fetched_at: fetchedAt, error: hint,
        };
      }
      return {
        ok: true, source: this.id, positions: out,
        scanned, exhausted: false, truncated: true, fetched_at: fetchedAt,
        note: `部分结果(中断: ${e?.message})`,
      };
    }
    const truncated = !exhausted && (stoppedByLimit || scanned >= scanLimit);
    return {
      ok: true, source: this.id, total: exhausted ? out.length : undefined,
      positions: out.slice(0, want),
      scanned, exhausted, truncated, fetched_at: fetchedAt,
      note: truncated
        ? (stoppedByLimit
            ? `达到返回上限 ${want}，源中可能还有更多匹配岗位`
            : `扫描达到上限 ${scanLimit}，结果可能不完整`)
        : undefined,
    };
  },
};

export default adapter;
