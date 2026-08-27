// 中国石化官方社会招聘适配器。
// 公开接口与官网 https://job.sinopec.com/#/social/index 使用同一分页参数：
// POST /api/sz/socialJobInfo/selectSocialJobVoByPage
// body: { endTag: "N", page, limit, searchLike? }。
// endTag=N 仅取当前在招；历史记录虽然公开可查，但不得混入实时在招结果。
import type { FetchParams, RawPosition, SourceAdapter } from "./types.js";
import { fetchPagedSource, requestJson, type PageResult } from "./adapter-kit.js";

const HOMEPAGE = "https://job.sinopec.com/";
const API = `${HOMEPAGE}api/sz/socialJobInfo/selectSocialJobVoByPage`;
const DETAIL_BASE = `${HOMEPAGE}#/social/jobDetail?id=`;
const PAGE_SIZE = 30;

function text(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function educationOf(record: Record<string, unknown>): string | undefined {
  const explicit = text(record.educationNormText);
  if (explicit) return explicit;
  const condition = text(record.positionCondition) ?? "";
  const candidates = [
    condition.match(/(博士(?:研究生)?(?:及以上)?)/)?.[1],
    condition.match(/(硕士(?:研究生)?(?:及以上)?)/)?.[1],
    condition.match(/((?:大学)?本科(?:及以上)?)/)?.[1],
    condition.match(/((?:大学)?专科(?:及以上)?)/)?.[1],
  ].filter((item): item is string => !!item);
  return candidates[0];
}

function experienceOf(condition?: string): string | undefined {
  if (!condition) return undefined;
  return condition.match(/(\d+\s*年(?:及以上|以上)?(?:相关)?工作经验)/)?.[1] ??
    condition.match(/(工作经验不限|经验不限)/)?.[1];
}

function majorOf(condition?: string): string | undefined {
  if (!condition) return undefined;
  return condition
    .split(/[。\n；;]/)
    .map((item) => item.trim())
    .find((item) => /专业/.test(item))
    ?.slice(0, 180);
}

export function parseRecord(record: unknown): RawPosition | null {
  if (!record || typeof record !== "object") return null;
  const raw = record as Record<string, unknown>;
  const id = text(raw.id);
  const enterpriseName = text(raw.department) ?? text(raw.orgName);
  const title = text(raw.duties) ?? text(raw.jobName);
  if (!id || !enterpriseName || !title) return null;
  const endTag = text(raw.endTag) ?? "N";
  const sourceUrl = `${DETAIL_BASE}${encodeURIComponent(id)}&endTag=${encodeURIComponent(endTag)}`;
  const headcount = Number(raw.number);
  const condition = text(raw.positionCondition);
  const salary = text(raw.salaryText);
  const parentOrg = text(raw.orgName);
  const projectName = text(raw.jobName);
  const warnings: string[] = [];
  if (!text(raw.educationNormText) && educationOf(raw)) {
    warnings.push("学历要求由中国石化官方岗位条件文本提取，请以详情页为准");
  }
  return {
    id,
    enterprise_name: enterpriseName,
    title,
    recruit_type: "social",
    sector: "油气化工",
    work_location: text(raw.workLocation) ?? text(raw.qualifications),
    headcount: Number.isFinite(headcount) && headcount > 0 ? headcount : undefined,
    education: educationOf(raw),
    major: majorOf(condition),
    experience: experienceOf(condition),
    requirements: condition,
    salary_ref: salary
      ? `${salary}(来源:中国石化招聘,仅供参考)`
      : undefined,
    remarks: [
      parentOrg && parentOrg !== enterpriseName ? `所属单位:${parentOrg}` : "",
      projectName && projectName !== title ? `招聘项目:${projectName}` : "",
      text(raw.jobCode) ? `岗位代码:${text(raw.jobCode)}` : "",
      text(raw.postTreatment) ? `待遇说明:${text(raw.postTreatment)}` : "",
      "来源:中国石化官方招聘站",
    ].filter(Boolean).join(" | "),
    deadline: text(raw.timeEnd)?.replace(/\./g, "-"),
    posted_at: text(raw.timeStart)?.replace(/\./g, "-"),
    apply_url: sourceUrl,
    source: sourceUrl,
    source_id: "sinopec",
    source_position_id: id,
    source_company_id: text(raw.departmentId),
    quality_warnings: warnings.length ? warnings : undefined,
  };
}

export function responseError(json: unknown): string | undefined {
  if (!json || typeof json !== "object") return "malformed response";
  const response = json as Record<string, unknown>;
  if (response.success !== true || response.code !== "S000000") {
    return `code=${String(response.code)} message=${String(response.message ?? "")}`;
  }
  if (!response.data || typeof response.data !== "object") return "missing response data";
  const data = response.data as Record<string, unknown>;
  if (!Array.isArray(data.records)) return "missing response records";
  const total = Number(data.total);
  if (!Number.isInteger(total) || total < 0) return "invalid response total";
  return undefined;
}

export async function fetchPage(
  params: FetchParams,
  page: number,
  pageSize: number,
  timeoutMs: number,
): Promise<PageResult<unknown>> {
  const json = await requestJson(API, {
    method: "POST",
    timeoutMs,
    headers: {
      Origin: HOMEPAGE.replace(/\/$/, ""),
      Referer: `${HOMEPAGE}#/social/index`,
    },
    body: {
      endTag: "N",
      page,
      limit: pageSize,
      searchLike: params.keyword ?? "",
    },
  });
  const error = responseError(json);
  if (error) throw new Error(error);
  const data = (json as Record<string, any>).data;
  return {
    records: data.records,
    total: Number(data.total),
  };
}

const adapter: SourceAdapter = {
  id: "sinopec",
  name: "中国石化官方社会招聘",
  homepage: HOMEPAGE,
  scopes: ["social"],
  live: false,
  kind: "official",
  priority: 100,
  coverage: "中国石化及所属单位官方社会招聘岗位；只读取 endTag=N 的当前在招列表。",
  disabled_reason:
    "官方接口与当前在招过滤已接通，但 2026-08 实测 endTag=N 为完整空列表；出现可验证真实岗位后再启用。",
  quality:
    "招聘主体、岗位、人数、地点、条件、薪资参考和截止时间来自中国石化官方接口；历史岗位不会混入实时结果。",
  fetch(params) {
    return fetchPagedSource({
      source: "sinopec",
      params,
      pageSize: PAGE_SIZE,
      defaultScanLimit: 500,
      totalTimeoutMs: 20_000,
      requestTimeoutMs: 12_000,
      delayBetweenPagesMs: 120,
      fetchPage: (page, pageSize, timeoutMs) =>
        fetchPage(params, page, pageSize, timeoutMs),
      parseRecord,
      successNote: "已扫到中国石化当前在招社会招聘列表末尾；若为零结果，表示官网当前 endTag=N 列表为空。",
    });
  },
};

export default adapter;
