// 中国移动官方招聘站实时适配器。
// 公开网页 https://job.10086.cn/personal/job/ 使用同一免登录接口，覆盖集团总部、
// 省公司、专业公司、直属单位和部分下属招聘主体。
import {
  constants as cryptoConstants,
  createHash,
  publicEncrypt,
  randomBytes,
} from "node:crypto";
import type { FetchParams, RawPosition, SourceAdapter } from "./types.js";
import { fetchPagedSource, requestJson, type PageResult } from "./adapter-kit.js";
import type { RecruitType } from "../codes.js";

const HOMEPAGE = "https://job.10086.cn/";
const API = `${HOMEPAGE}job-app/job/searchJobs.do`;
const DETAIL_BASE = `${HOMEPAGE}personal/job/detail.html?id=`;
const PAGE_SIZE = 20;

// 该公钥由中国移动公开招聘网页的 job-center.js 提供，用于网页端请求完整性字段。
const PUBLIC_KEY_DER =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAhbieIVi00W3W1i9hYVs1" +
  "EY6iYLF936QV71fmFNtsATK3m7iEbgDNo222M2uRJ1fVFyt00OkwyJ/EzvLL7M2" +
  "iWK7d3fs8OAwsJd0/tBGhFvJU9YUzGibvko3KfOiUr+CMLwrGY4cXyPUs/DHiwq" +
  "Vb+/JhvffKTzzpZxnmOZDY5G7q6FfLFmGueQI7h9NyqyTst1jrfJRq2QG2uDDuM" +
  "NlYEjWNSHI7fg9F91xLhyNNKIO1a3dcpLi8HZEtm4mgs1+i2xH49EzVjLyFjep9" +
  "1nqNUrauXVr22DMGfuggeAzuRxlqo1bVNg9pC1EtcTg4GkWURf4FWngXo4ntHpG" +
  "cd+hecwIDAQAB";
const PUBLIC_KEY = [
  "-----BEGIN PUBLIC KEY-----",
  ...(PUBLIC_KEY_DER.match(/.{1,64}/g) ?? []),
  "-----END PUBLIC KEY-----",
].join("\n");

const EDUCATION: Record<string, string> = {
  "10": "博士研究生",
  "15": "硕士研究生",
  "20": "研究生同等学力",
  "25": "大学本科",
  "30": "大学专科",
  "35": "中专",
  "40": "职高",
  "45": "技校",
  "50": "高中",
  "55": "初中及以下",
  "60": "无学历",
  "99": "其他",
};

const WORK_YEAR: Record<string, string> = {
  "0": "应届毕业生",
  "1": "1年及以上",
  "2": "2年及以上",
  "3": "3年及以上",
  "4": "4年及以上",
  "5": "5年及以上",
  "6": "6年及以上",
  "7": "7年及以上",
  "8": "8年及以上",
  "9": "9年及以上",
  "10": "10年及以上",
  "99": "不限",
};

const WORK_TYPE: Record<string, string> = {
  "01": "实习",
  "02": "全职",
  "03": "兼职",
};

export function recruitTypeOf(value: unknown): RecruitType {
  const code = String(value ?? "");
  if (code === "1") return "campus";
  if (code === "2") return "social";
  if (code === "3") return "intern";
  return "unknown";
}

function text(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function mapped(
  value: unknown,
  mapping: Record<string, string>,
): string | undefined {
  const raw = text(value);
  return raw ? mapping[raw] ?? raw : undefined;
}

function locationOf(record: Record<string, unknown>): string | undefined {
  return [...new Set([
    text(record.province),
    text(record.city),
    text(record.address),
  ].filter((item): item is string => !!item))].join("-") || undefined;
}

function majorOf(requirements?: string): string | undefined {
  if (!requirements) return undefined;
  const clauses = requirements
    .split(/[。\n；;]/)
    .map((item) => item.trim())
    .filter(Boolean);
  const direct = clauses.find(
    (item) => /专业/.test(item) && !/[：:]$/.test(item) && item.length > 6,
  );
  if (direct) return direct.slice(0, 180);
  const headingIndex = clauses.findIndex((item) => /学历与专业|专业要求/.test(item));
  return headingIndex >= 0 ? clauses[headingIndex + 1]?.slice(0, 180) : undefined;
}

function salaryOf(record: Record<string, unknown>): {
  value?: string;
  warning?: string;
} {
  const explicit = text(record.salaryFace);
  if (explicit) return { value: `${explicit}(来源:中国移动招聘,仅供参考)` };
  const low = Number(record.lowestSalary);
  const high = Number(record.higestSalary);
  if (
    (Number.isFinite(low) && low > 0) ||
    (Number.isFinite(high) && high > 0)
  ) {
    const range = low > 0 && high > 0 ? `${low}-${high}` : String(low > 0 ? low : high);
    return {
      value: `${range}(单位未标注;来源:中国移动招聘,仅供参考)`,
      warning: "中国移动招聘列表给出薪资数值但未标注单位，未猜测单位",
    };
  }
  return {};
}

export function parseRecord(record: unknown): RawPosition | null {
  if (!record || typeof record !== "object") return null;
  const raw = record as Record<string, unknown>;
  const id = text(raw.id);
  const enterpriseName = text(raw.company);
  const title = text(raw.name);
  if (!id || !enterpriseName || !title) return null;
  const sourceUrl = `${DETAIL_BASE}${encodeURIComponent(id)}` +
    (String(raw.type ?? "") === "1" ? "&typess=1" : "");
  const recruitType = recruitTypeOf(raw.type);
  const salary = salaryOf(raw);
  const requirements = text(raw.dutyCondition);
  const warnings: string[] = [];
  if (recruitType === "unknown") {
    warnings.push("中国移动招聘类型代码缺失或未知，本岗位标为 unknown");
  }
  if (salary.warning) warnings.push(salary.warning);
  const headcount = Number(raw.recruitCount);
  const workType = mapped(raw.workType, WORK_TYPE);
  return {
    id,
    enterprise_name: enterpriseName,
    title,
    recruit_type: recruitType,
    sector: "电信运营",
    work_location: locationOf(raw),
    headcount: Number.isFinite(headcount) && headcount > 0 ? headcount : undefined,
    education: mapped(raw.degree, EDUCATION),
    major: majorOf(requirements),
    experience: mapped(raw.workYear, WORK_YEAR),
    desc: text(raw.description),
    requirements,
    salary_ref: salary.value,
    remarks: [
      text(raw.companyShortName) ? `招聘单位简称:${text(raw.companyShortName)}` : "",
      text(raw.department) ? `部门:${text(raw.department)}` : "",
      workType ? `工作性质:${workType}` : "",
      "来源:中国移动官方招聘站",
    ].filter(Boolean).join(" | "),
    deadline: text(raw.endTime),
    posted_at: text(raw.startTime),
    apply_url: sourceUrl,
    source: sourceUrl,
    source_id: "china-mobile",
    source_position_id: id,
    source_company_id: text(raw.companyId),
    quality_warnings: warnings.length ? warnings : undefined,
  };
}

export function responseError(json: unknown): string | undefined {
  if (!json || typeof json !== "object") return "malformed response";
  const response = json as Record<string, unknown>;
  if (response.code !== "0000") {
    return `code=${String(response.code)} message=${String(response.message ?? response.msg ?? "")}`;
  }
  if (!response.data || typeof response.data !== "object") return "missing response data";
  if (!Array.isArray((response.data as Record<string, unknown>).jobList)) {
    return "missing response jobList";
  }
  return undefined;
}

function requestHeader(): Record<string, unknown> {
  const timestamp = Date.now();
  const secret = randomBytes(10).toString("base64url").slice(0, 10);
  const md5 = createHash("md5").update(`${timestamp}${secret}`).digest("hex");
  const encrypted = publicEncrypt(
    { key: PUBLIC_KEY, padding: cryptoConstants.RSA_PKCS1_PADDING },
    Buffer.from(secret),
  ).toString("base64");
  const date = new Date(timestamp);
  const pad = (value: number, size: number) => String(value).padStart(size, "0");
  const conversationId = [
    date.getFullYear(),
    pad(date.getMonth() + 1, 2),
    pad(date.getDate(), 2),
    pad(date.getHours(), 2),
    pad(date.getMinutes(), 2),
    pad(date.getSeconds(), 2),
    pad(date.getMilliseconds(), 3),
    pad(randomBytes(3).readUIntBE(0, 3) % 1_000_000, 6),
  ].join("");
  return {
    version: "1.0",
    timestamp,
    digest: `${Buffer.from(md5).toString("base64")};${encrypted}`,
    conversationId,
  };
}

export async function fetchPage(
  _params: FetchParams,
  page: number,
  pageSize: number,
  timeoutMs: number,
): Promise<PageResult<unknown>> {
  const json = await requestJson(API, {
    method: "POST",
    timeoutMs,
    legacyTls: true,
    headers: {
      Origin: HOMEPAGE.replace(/\/$/, ""),
      Referer: `${HOMEPAGE}personal/job/`,
    },
    body: {
      serviceName: "searchJobs",
      header: requestHeader(),
      data: {
        pageNo: page,
        pageSize,
        key: "",
        workYear: "",
        companyId: "",
        degree: "",
        publishTime: "",
        workType: "",
        // type=1/2/3 在“该类型当前无岗位”时会返回业务错误而非空列表。
        // 为保持失败/零结果语义可靠，扫描全部公开岗位并在共享层复核招聘类型。
        type: "",
        category: "",
        subCategory: "",
        workCity: "",
        workProvince: "",
      },
    },
  });
  const error = responseError(json);
  if (error) throw new Error(error);
  const data = (json as Record<string, any>).data;
  const total = Number(data.total);
  return {
    records: data.jobList,
    total: Number.isInteger(total) && total >= 0 ? total : undefined,
  };
}

const adapter: SourceAdapter = {
  id: "china-mobile",
  name: "中国移动官方招聘",
  homepage: HOMEPAGE,
  scopes: ["campus", "social", "intern", "unknown"],
  live: true,
  kind: "official",
  priority: 100,
  coverage: "中国移动集团总部、省公司、专业公司、直属单位及其公开招聘岗位。",
  quality:
    "企业、岗位、招聘类型、地点、学历、职责、要求和截止时间来自中国移动官方招聘列表；缺失薪资单位时不猜测。",
  fetch(params) {
    return fetchPagedSource({
      source: "china-mobile",
      params,
      pageSize: PAGE_SIZE,
      defaultScanLimit: 500,
      totalTimeoutMs: 20_000,
      requestTimeoutMs: 12_000,
      delayBetweenPagesMs: 120,
      fetchPage: (page, pageSize, timeoutMs) =>
        fetchPage(params, page, pageSize, timeoutMs),
      parseRecord,
      successNote: "已扫描中国移动官方招聘列表；最终投递资格以官方详情页为准。",
      errorHint: (error) => {
        const message = error instanceof Error ? error.message : String(error);
        return /timeout|ECONN|ENOTFOUND|TLS|SSL/i.test(message)
          ? `中国移动官方招聘接口网络/TLS不可达: ${message}`
          : message;
      },
    });
  },
};

export default adapter;
