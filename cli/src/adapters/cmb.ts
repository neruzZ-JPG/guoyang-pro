// 招商银行官方招聘适配器。
// 同一公开 API 按实习、应届校招、社招三个招聘类型分区；适配器以全局
// scan_limit 在分区间公平分配，避免任一类型独占扫描预算。
import type {
  FetchParams,
  FetchResult,
  RawPosition,
  SourceAdapter,
} from "./types.js";
import { fetchPagedSource, requestJson, type PageResult } from "./adapter-kit.js";
import type { RecruitType } from "../codes.js";

const HOMEPAGE = "https://career.cmbchina.com/";
const PAGE_SIZE = 20;
const BUSINESS_ID = "LZ4101CMBRecruitmentPCFront";

export type CmbPartition = {
  id: string;
  prefix: "campusRecruitmentWebsite" | "socialRecruitmentWebsite";
  recruitType: RecruitType;
  recruitmentTypeId: string;
  route: "school" | "social";
};

export const CMB_PARTITIONS: CmbPartition[] = [
  {
    id: "campus",
    prefix: "campusRecruitmentWebsite",
    recruitType: "campus",
    recruitmentTypeId: "96574F8D-C7ED-4772-AE7C-BAC896D190C1",
    route: "school",
  },
  {
    id: "social",
    prefix: "socialRecruitmentWebsite",
    recruitType: "social",
    recruitmentTypeId: "48E013CF-A9DE-4FA4-9CEE-4967B162CAEF",
    route: "social",
  },
  {
    id: "intern",
    prefix: "campusRecruitmentWebsite",
    recruitType: "intern",
    recruitmentTypeId: "DF94FD6D-26D3-4A19-9E69-577C4BA1DE82",
    route: "school",
  },
];

function text(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function enterpriseNameOf(branchName?: string): string | undefined {
  if (!branchName) return undefined;
  if (/^招商银行/.test(branchName)) return branchName;
  if (/^招银网络科技/.test(branchName)) return "招银网络科技有限公司";
  if (/^招银/.test(branchName)) return branchName;
  if (/^(总行|信用卡中心|私人银行部|资产托管部)/.test(branchName)) {
    return `招商银行${branchName}`;
  }
  return `招商银行${branchName}`;
}

export function parseRecord(
  record: unknown,
  partition: CmbPartition,
): RawPosition | null {
  if (!record || typeof record !== "object") return null;
  const raw = record as Record<string, unknown>;
  const id = text(raw.publishGID);
  const title = text(raw.jobDisplay);
  const branch = text(raw.branchCodeName);
  const enterpriseName = enterpriseNameOf(branch);
  if (!id || !title || !enterpriseName) return null;
  const sourceUrl =
    `${HOMEPAGE}positionDetail/${partition.route}?publishId=${encodeURIComponent(id)}`;
  const deadline = raw.longTermRecruitment === true
    ? "长期有效"
    : text(raw.expiredOn);
  return {
    id,
    enterprise_name: enterpriseName,
    title,
    recruit_type: partition.recruitType,
    sector: "金融银行",
    work_location: text(raw.locationName),
    deadline,
    apply_url: sourceUrl,
    source: sourceUrl,
    source_id: "cmb",
    source_position_id: id,
    source_company_id: text(raw.branchCode),
    remarks: [
      branch ? `所属机构:${branch}` : "",
      text(raw.jobTypeName) ? `职位类别:${text(raw.jobTypeName)}` : "",
      "来源:招商银行官方招聘站",
    ].filter(Boolean).join(" | "),
    quality_warnings: [
      "列表接口未提供学历、专业和招聘人数，未从职位名称猜测；请打开官方详情页核验",
    ],
  };
}

export function responseError(json: unknown): string | undefined {
  if (!json || typeof json !== "object") return "malformed response";
  const response = json as Record<string, unknown>;
  if (response.returnCode !== "SUC0000") {
    return `returnCode=${String(response.returnCode)} error=${String(response.errorMsg ?? "")}`;
  }
  if (!response.body || typeof response.body !== "object") return "missing response body";
  const body = response.body as Record<string, unknown>;
  if (!Array.isArray(body.data)) return "missing response data";
  const total = Number(body.total);
  if (!Number.isInteger(total) || total < 0) return "invalid response total";
  return undefined;
}

export async function fetchPage(
  params: FetchParams,
  partition: CmbPartition,
  page: number,
  pageSize: number,
  timeoutMs: number,
): Promise<PageResult<unknown>> {
  const url = `${HOMEPAGE}api/${partition.prefix}/job/getList`;
  const json = await requestJson(url, {
    method: "POST",
    timeoutMs,
    headers: {
      "X-B3-BusinessId": BUSINESS_ID,
      Referer: HOMEPAGE,
    },
    body: {
      orgIdList: [],
      keywords: params.keyword ?? "",
      locationIdList: [],
      pageIndex: page,
      pageSize,
      recruitmentTypeId: partition.recruitmentTypeId,
      jobTypeIdList: [],
    },
  });
  const error = responseError(json);
  if (error) throw new Error(error);
  const body = (json as Record<string, any>).body;
  return {
    records: body.data,
    total: Number(body.total),
  };
}

function invalidLimits(
  requestedLimit: number,
  requestedScanLimit: number,
): FetchResult | undefined {
  if (requestedScanLimit >= requestedLimit) return undefined;
  return {
    ok: false,
    source: "cmb",
    positions: [],
    scanned: 0,
    exhausted: false,
    truncated: true,
    fetched_at: new Date().toISOString(),
    error: "scan_limit must be greater than or equal to limit",
  };
}

async function fetchPartitions(params: FetchParams): Promise<FetchResult> {
  const fetchedAt = new Date().toISOString();
  const requestedLimit = Math.max(1, Math.min(params.limit ?? 50, 5000));
  const requestedScanLimit = Math.max(
    1,
    Math.min(params.scan_limit ?? Math.max(requestedLimit * 20, 1000), 5000),
  );
  const invalid = invalidLimits(requestedLimit, requestedScanLimit);
  if (invalid) return invalid;
  const partitions = params.recruit_type
    ? CMB_PARTITIONS.filter((item) => item.recruitType === params.recruit_type)
    : CMB_PARTITIONS;
  if (partitions.length === 0) {
    return {
      ok: true,
      source: "cmb",
      total: 0,
      positions: [],
      scanned: 0,
      exhausted: true,
      truncated: false,
      fetched_at: fetchedAt,
      note: "招商银行官方招聘不支持该招聘类型",
    };
  }

  const baseScan = Math.floor(requestedScanLimit / partitions.length);
  const scanRemainder = requestedScanLimit % partitions.length;
  const baseLimit = Math.floor(requestedLimit / partitions.length);
  const limitRemainder = requestedLimit % partitions.length;
  const budgets = partitions.map((partition, index) => ({
    partition,
    scan: baseScan + (index < scanRemainder ? 1 : 0),
    limit: baseLimit + (index < limitRemainder ? 1 : 0),
  }));
  const activeBudgets = budgets.filter((budget) => budget.scan > 0);
  const settled = await Promise.all(activeBudgets.map((budget) => {
    const { partition } = budget;
    const partitionScan = budget.scan;
    const partitionLimit = Math.max(
      1,
      Math.min(
        partitionScan,
        budget.limit || 1,
      ),
    );
    return (
    fetchPagedSource({
      source: `cmb:${partition.id}`,
      params: {
        ...params,
        recruit_type: partition.recruitType,
        limit: partitionLimit,
        scan_limit: partitionScan,
      },
      pageSize: PAGE_SIZE,
      defaultScanLimit: partitionScan,
      totalTimeoutMs: 20_000,
      requestTimeoutMs: 12_000,
      delayBetweenPagesMs: 120,
      fetchPage: (page, pageSize, timeoutMs) =>
        fetchPage(params, partition, page, pageSize, timeoutMs),
      parseRecord: (record) => parseRecord(record, partition),
    })
    );
  }));
  const successful = settled.filter((item) => item.ok);
  const positions = settled
    .flatMap((item) => item.positions)
    .slice(0, requestedLimit);
  const scanned = settled.reduce((sum, item) => sum + item.scanned, 0);
  const exhausted = activeBudgets.length === partitions.length &&
    successful.length === settled.length &&
    settled.every((item) => item.exhausted);
  const truncated = !exhausted || positions.length >= requestedLimit;
  const failed = settled.filter((item) => !item.ok);
  if (successful.length === 0) {
    return {
      ok: false,
      source: "cmb",
      positions: [],
      scanned,
      exhausted: false,
      truncated: true,
      fetched_at: fetchedAt,
      error: failed.map((item) => item.error).filter(Boolean).join("; ") ||
        "all 招商银行招聘分区 failed",
    };
  }
  return {
    ok: true,
    source: "cmb",
    total: exhausted ? positions.length : undefined,
    positions,
    scanned,
    exhausted,
    truncated,
    fetched_at: fetchedAt,
    note: failed.length
      ? `部分招聘分区失败: ${failed.map((item) => item.source).join(", ")}`
      : truncated
        ? "已按校招、社招、实习分区公平扫描；达到返回/扫描边界，可能还有更多岗位"
        : "已扫描招商银行官方招聘各目标分区",
  };
}

const adapter: SourceAdapter = {
  id: "cmb",
  name: "招商银行官方招聘",
  homepage: HOMEPAGE,
  scopes: ["campus", "social", "intern"],
  live: true,
  kind: "official",
  priority: 100,
  coverage: "招商银行总行、分行、信用卡中心及招银网络科技等公开校招、社招和实习岗位。",
  quality:
    "招聘主体、岗位、类型、地点和截止时间来自招商银行官方列表；列表未提供的学历、专业、人数不猜测。",
  fetch: fetchPartitions,
};

export default adapter;
