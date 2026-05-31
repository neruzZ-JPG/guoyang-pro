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
import type { SourceAdapter, FetchParams, FetchResult, RawPosition } from "./types.js";
import type { RecruitType } from "../codes.js";

const API = "https://gp-api.iguopin.com/api/jobs/v1/list";

function postJson(body: Record<string, unknown>, timeoutMs = 12000): Promise<any> {
  return new Promise((resolve, reject) => {
    const u = new URL(API);
    const data = Buffer.from(JSON.stringify(body));
    const req = request(
      {
        hostname: u.hostname, path: u.pathname, method: "POST", port: 443,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": data.length,
          "Origin": "https://www.iguopin.com",
          "Referer": "https://www.iguopin.com/",
          "Accept-Encoding": "gzip, deflate, br",
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          try {
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
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error("timeout")));
    req.write(data);
    req.end();
  });
}

const RECRUIT_CODE: Record<RecruitType, string | null> = {
  campus: "1161T1j6",
  social: "115amZVP",
  intern: null, // 国聘无独立实习码,实习多并入校招;不单独过滤
};

function recruitTypeOf(cn: string): RecruitType {
  if (cn?.includes("校园") || cn?.includes("应届")) return "campus";
  if (cn?.includes("实习")) return "intern";
  return "social";
}

function salaryRef(rec: any): string {
  if (rec.is_negotiable || (!rec.min_wage && !rec.max_wage)) return "面议";
  const unit = rec.wage_unit_cn || "元/月";
  const months = rec.months ? `×${rec.months}个月` : "";
  if (rec.min_wage && rec.max_wage) return `${rec.min_wage}-${rec.max_wage}${unit}${months}`;
  return `${rec.min_wage || rec.max_wage}${unit}${months}`;
}

function locationOf(rec: any): string {
  const dl = rec.district_list;
  if (Array.isArray(dl) && dl.length) {
    return [...new Set(dl.map((d: any) => d.area_cn || d.city || d.province).filter(Boolean))].join("、");
  }
  return rec.company_info?.district_list?.[0]?.area_cn || "";
}

function majorOf(rec: any): string {
  const m = rec.major_cn;
  if (Array.isArray(m) && m.length) return m.join("、");
  if (typeof m === "string" && m) return m;
  return "不限";
}

// 导出供离线 fixture 单测:把国聘一条原始记录映射为 RawPosition。
export function parseRecord(rec: any): RawPosition {
  return {
    id: String(rec.job_id ?? ""),
    enterprise_name: rec.company_name || rec.company_info?.name || "",
    title: rec.job_name || "",
    recruit_type: recruitTypeOf(rec.recruitment_type_cn),
    work_location: locationOf(rec),
    headcount: Number(rec.amount) || 1,
    education: rec.education_cn || "",
    major: majorOf(rec),
    salary_ref: salaryRef(rec),
    experience: rec.experience_cn || undefined,
    desc: typeof rec.contents === "string" ? rec.contents.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 600) : undefined,
    // nature_cn=岗位用工性质;放入 remarks 供 live.ts 的 classifyEmployment 派生 employment_type
    remarks: [rec.nature_cn, rec.company_info?.scale_cn].filter(Boolean).join(" | ") || undefined,
    deadline: rec.end_time || undefined,
    posted_at: rec.start_time || rec.create_time || undefined,
    apply_url: rec.job_id ? `https://www.iguopin.com/job/detail?id=${rec.job_id}` : undefined,
    source: rec.job_id ? `https://www.iguopin.com/job/detail?id=${rec.job_id}` : "https://www.iguopin.com/",
  };
}

const adapter: SourceAdapter = {
  id: "iguopin",
  name: "国聘网",
  homepage: "https://www.iguopin.com/",
  scopes: ["campus", "social", "intern"],
  live: true,
  async fetch(params: FetchParams): Promise<FetchResult> {
    const want = Math.max(1, Math.min(params.limit ?? 50, 500));
    const pageSize = Math.min(100, want);
    // 默认锁定"国央企":央企 + 国企(company_nature 接受数组,OR 关系)
    const company_nature = ["116wwMpd", "11AzDak"];
    const recruitment_type: string[] = [];
    if (params.recruit_type) {
      const code = RECRUIT_CODE[params.recruit_type];
      if (code) recruitment_type.push(code);
    }

    const out: RawPosition[] = [];
    const seen = new Set<string>();
    let page = 1;
    const maxPages = Math.ceil(want / pageSize) + 1;
    try {
      while (out.length < want && page <= maxPages) {
        const body: Record<string, unknown> = { page, page_size: pageSize, company_nature };
        if (recruitment_type.length) body.recruitment_type = recruitment_type;
        if (params.keyword) body.keyword = params.keyword;
        const json = await postJson(body);
        if (json?.code !== 200) return { ok: false, source: this.id, positions: out, error: `code=${json?.code} msg=${json?.msg}` };
        const list: any[] = json?.data?.list ?? [];
        if (list.length === 0) break; // total 字段不可信,空 list = 到底
        for (const rec of list) {
          const r = parseRecord(rec);
          if (!r.id || seen.has(r.id)) continue;
          seen.add(r.id); out.push(r);
        }
        if (list.length < pageSize) break;
        page++;
      }
    } catch (e: any) {
      if (out.length === 0) {
        const hint = /aborted|timeout|fetch failed|ECONN|ENOTFOUND/i.test(e?.message || "")
          ? "网络不可达(国聘 gp-api;受限网络/沙箱会失败,正常机器可访问)" : e?.message;
        return { ok: false, source: this.id, positions: [], error: hint };
      }
      return { ok: true, source: this.id, total: out.length, positions: out, note: `部分结果(中断: ${e?.message})` };
    }
    return { ok: true, source: this.id, total: out.length, positions: out.slice(0, want) };
  },
};

export default adapter;
