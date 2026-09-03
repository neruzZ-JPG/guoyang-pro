// 国务院国资委“人事招聘”栏目公告适配器。
//
// 用户给出的 HTTPS 地址在部分网络会回落到 HTTP；官网当前页面和详情链接也
// 使用 HTTP。这里读取同一栏目公开的静态 HTML，不绕过登录或访问控制。
//
// ── 页面结构实测（2026-09-03）────────────────────────────────────
// 列表：http://www.sasac.gov.cn/n2588035/n2588325/n2588350/index.html
//   - 首页面含带发布日期的招聘公告；详情路径为 .../c<ID>/content.html。
//   - 分页片段为 index_20742332_<倒序页码>.html；首页脚本声明 maxPageNum。
//   - 首页还含不带日期的长期专题链接，不把它冒充当前在招记录。
//   - 该栏目发布的是“招聘公告”，并非逐岗位结构化 API。因此每条结果保留
//     公告标题，不猜测地点、学历、专业、人数、薪资或截止时间。
//   - 公告页是历史归档且不提供统一上下线状态，只返回近 180 天公告，并要求
//     用户回到详情页确认是否仍可报名。
//
// 字段映射：
//   列表 title/正文来源 -> enterprise_name（保守提取）
//   列表 title           -> title / recruit_type（仅按明确文字推断）
//   列表发布日期         -> posted_at
//   详情 content id      -> source_position_id / source / apply_url
// ───────────────────────────────────────────────────────────────────

import http from "node:http";
import { brotliDecompressSync, gunzipSync, inflateSync } from "node:zlib";
import { inferRecruitType } from "../codes.js";
import { matchesRawPosition } from "./adapter-kit.js";
import type {
  DetailResult,
  FetchParams,
  FetchResult,
  RawPosition,
  SourceAdapter,
} from "./types.js";

export const SASAC_HOMEPAGE =
  "https://www.sasac.gov.cn/n2588035/n2588325/n2588350/index.html";
const FETCH_HOMEPAGE =
  "http://www.sasac.gov.cn/n2588035/n2588325/n2588350/index.html";
const LIST_COMPONENT = "index_20742332";
const MAX_RESULTS = 5000;
const RECENT_DAYS = 180;
const TOTAL_TIMEOUT_MS = 20_000;

type Announcement = {
  id: string;
  title: string;
  postedAt: string;
  url: string;
};

type ListingPage = {
  announcements: Announcement[];
  maxPages?: number;
};

function decodeHtml(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: "\"",
  };
  return value
    .replace(/&#(x[0-9a-f]+|\d+);?/gi, (_match, code: string) => {
      const value = code.toLowerCase().startsWith("x")
        ? Number.parseInt(code.slice(1), 16)
        : Number.parseInt(code, 10);
      return Number.isFinite(value) ? String.fromCodePoint(value) : "";
    })
    .replace(/&([a-z]+);/gi, (match, name: string) =>
      named[name.toLowerCase()] ?? match
    );
}

function plainText(value: string): string {
  return decodeHtml(value.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function attribute(attributes: string, name: string): string | undefined {
  const match = attributes.match(
    new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"),
  );
  return match ? decodeHtml(match[1] ?? match[2] ?? match[3] ?? "") : undefined;
}

export function parseListingPage(html: string): ListingPage {
  const announcements: Announcement[] = [];
  const seen = new Set<string>();
  const itemPattern =
    /<li\b[^>]*>\s*<a\b([^>]*)>([\s\S]*?)<\/a>\s*<span\b[^>]*>\s*\[?(\d{4}-\d{2}-\d{2})\]?\s*<\/span>\s*<\/li>/gi;
  let match: RegExpExecArray | null;
  while ((match = itemPattern.exec(html))) {
    const href = attribute(match[1], "href");
    const title = plainText(attribute(match[1], "title") ?? match[2]);
    if (!href || !title) continue;
    let url: URL;
    try {
      url = new URL(href, FETCH_HOMEPAGE);
    } catch {
      continue;
    }
    if (
      url.hostname !== "www.sasac.gov.cn" ||
      (url.protocol !== "http:" && url.protocol !== "https:")
    ) continue;
    const id = url.pathname.match(
      /\/n2588035\/n2588325\/n2588350\/c(\d+)\/content\.html$/i,
    )?.[1];
    if (!id || seen.has(id)) continue;
    seen.add(id);
    announcements.push({
      id,
      title,
      postedAt: match[3],
      url: url.toString(),
    });
  }
  // 首页先声明 maxPageNum=0，随后才写入真实页数；不能误取首个 0。
  const maxPageCandidates = [
    ...[...html.matchAll(/\bmaxPageNum\s*=\s*(\d+)\s*;/gi)]
      .map((item) => Number(item[1])),
    ...[...html.matchAll(/maxPageNum20742332=(\d+)/gi)]
      .map((item) => Number(item[1])),
  ].filter((value) => Number.isInteger(value) && value > 0);
  const maxPages = maxPageCandidates.length
    ? Math.max(...maxPageCandidates)
    : undefined;
  return {
    announcements: announcements.sort(
      (left, right) => right.postedAt.localeCompare(left.postedAt),
    ),
    maxPages,
  };
}

export function listingPageUrl(page: number, maxPages: number): string {
  if (page <= 1) return FETCH_HOMEPAGE;
  const suffix = maxPages - page + 1;
  if (suffix < 1) throw new Error(`invalid SASAC page ${page}/${maxPages}`);
  return new URL(
    `${LIST_COMPONENT}_${suffix}.html`,
    FETCH_HOMEPAGE,
  ).toString();
}

export function enterpriseNameFromTitle(title: string): string {
  const cleaned = title
    .replace(/^[\s【】《》“”"'！!：:·-]+/, "")
    .replace(/^校园招聘[！!：:]\s*/, "")
    .trim();
  const yearIndex = cleaned.search(/\b20\d{2}/);
  const marker =
    /(?:20\d{2}(?:届|年度|年)?(?:春季|夏季|秋季)?(?:校园|社会)?(?:招聘|高校精英招募|人才计划)|面向社会公开招聘|面向高校公开招聘|校园招聘|社会招聘|公开招聘|招聘公告|招聘启事|岗位招募|高校精英招募|人才计划)/;
  const markerIndex = cleaned.search(marker);
  const indexes = [yearIndex, markerIndex].filter((index) => index > 0);
  const index = indexes.length ? Math.min(...indexes) : -1;
  const candidate = (index > 0 ? cleaned.slice(0, index) : cleaned)
    .replace(/(?:关于开展|面向社会|面向高校|面向全国|正式启动|全面启动)$/g, "")
    .replace(/招录$/g, "")
    .replace(/[，,：:！!\s]+$/g, "")
    .trim();
  return candidate || "国务院国资委人事招聘";
}

export function announcementToPosition(
  announcement: Announcement,
  sourceOrganization?: string,
): RawPosition {
  const recruitType = inferRecruitType(announcement.title);
  const year = Number(announcement.title.match(/\b(20\d{2})(?:届|年度|年)?/)?.[1]);
  const titleEnterprise = enterpriseNameFromTitle(announcement.title);
  const enterpriseName = titleEnterprise === "国务院国资委人事招聘"
    ? sourceOrganization?.trim() || titleEnterprise
    : titleEnterprise;
  return {
    id: announcement.id,
    year: Number.isInteger(year) ? year : undefined,
    enterprise_name: enterpriseName,
    title: announcement.title,
    recruit_type: recruitType,
    posted_at: announcement.postedAt,
    apply_url: announcement.url,
    source: announcement.url,
    source_id: "sasac",
    source_position_id: announcement.id,
    remarks: [
      "来源:国务院国资委人事招聘栏目",
      sourceOrganization ? `文章来源:${sourceOrganization.trim()}` : "",
      "本条为招聘公告，可能包含多个岗位",
    ].filter(Boolean).join("；"),
    quality_warnings: [
      "国资委栏目提供公告级信息，并非逐岗位结构化数据",
      "列表未统一提供地点、学历、专业、人数和截止时间，请打开官方公告核验是否仍可报名",
    ],
  };
}

function decodeBody(buffer: Buffer, encoding?: string): string {
  const normalized = (encoding ?? "").toLowerCase();
  if (normalized.includes("gzip")) return gunzipSync(buffer).toString("utf8");
  if (normalized.includes("deflate")) return inflateSync(buffer).toString("utf8");
  if (normalized.includes("br")) return brotliDecompressSync(buffer).toString("utf8");
  return buffer.toString("utf8");
}

function getText(url: string, timeoutMs: number, redirects = 0): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };
    const req = http.get(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Encoding": "gzip, deflate, br",
        "Accept-Language": "zh-CN,zh;q=0.9",
        Connection: "close",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
          "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
    }, (res) => {
      const status = res.statusCode ?? 0;
      const location = res.headers.location;
      if (status >= 300 && status < 400 && location) {
        res.resume();
        if (redirects >= 3) {
          finish(() => reject(new Error("too many redirects")));
          return;
        }
        getText(new URL(location, url).toString(), timeoutMs, redirects + 1)
          .then(
            (body) => finish(() => resolve(body)),
            (error) => finish(() => reject(error)),
          );
        return;
      }
      if (status < 200 || status >= 300) {
        res.resume();
        finish(() => reject(new Error(`HTTP ${status}`)));
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (chunk) => {
        const part = Buffer.from(chunk);
        size += part.length;
        if (size > 2 * 1024 * 1024) {
          req.destroy(new Error("response exceeds 2 MiB"));
          return;
        }
        chunks.push(part);
      });
      res.on("error", (error) => finish(() => reject(error)));
      res.on("end", () => finish(() => {
        try {
          resolve(decodeBody(
            Buffer.concat(chunks),
            String(res.headers["content-encoding"] ?? ""),
          ));
        } catch (error) {
          reject(error);
        }
      }));
    });
    const timer = setTimeout(
      () => req.destroy(new Error("absolute timeout")),
      timeoutMs,
    );
    req.setTimeout(timeoutMs, () => req.destroy(new Error("socket timeout")));
    req.on("error", (error) => finish(() => reject(error)));
    req.once("close", () => clearTimeout(timer));
  });
}

function isRecent(postedAt: string, now = Date.now()): boolean {
  const timestamp = Date.parse(`${postedAt}T23:59:59+08:00`);
  return Number.isFinite(timestamp) &&
    timestamp >= now - RECENT_DAYS * 24 * 60 * 60 * 1000;
}

function detailUrl(id: string): string {
  return new URL(`c${id}/content.html`, FETCH_HOMEPAGE).toString();
}

export function parseDetailPage(
  html: string,
  sourcePositionId: string,
): RawPosition | null {
  const rawTitle = html.match(/<title>\s*([\s\S]*?)\s*[－-]\s*国务院国有资产监督管理委员会\s*<\/title>/i)?.[1];
  const title = rawTitle ? plainText(rawTitle) : "";
  if (!title) return null;
  const sourceOrganization = html.match(
    /<meta\s+name=["']source["']\s+content=["']([^"']*)["']/i,
  )?.[1];
  const postedAt = html.match(
    /<meta\s+name=["']publishdate["']\s+content=["'](\d{4}-\d{2}-\d{2})["']/i,
  )?.[1] ?? "";
  return announcementToPosition({
    id: sourcePositionId,
    title,
    postedAt,
    url: detailUrl(sourcePositionId),
  }, sourceOrganization ? decodeHtml(sourceOrganization) : undefined);
}

const adapter: SourceAdapter = {
  id: "sasac",
  name: "国务院国资委人事招聘",
  homepage: SASAC_HOMEPAGE,
  scopes: ["campus", "social", "intern", "unknown"],
  live: true,
  kind: "aggregator",
  priority: 70,
  coverage:
    "国务院国资委人事招聘栏目近 180 天、带发布日期的中央企业及委属单位招聘公告。",
  quality:
    "官方栏目提供公告级而非逐岗位数据；保留公告原题和详情链接，不猜测列表未提供的岗位字段与截止状态。",
  async fetchDetail(sourcePositionId: string): Promise<DetailResult> {
    const fetchedAt = new Date().toISOString();
    if (!/^\d+$/.test(sourcePositionId)) {
      return {
        ok: false,
        source: this.id,
        fetched_at: fetchedAt,
        error: "国资委公告 id 必须为数字",
      };
    }
    try {
      const html = await getText(detailUrl(sourcePositionId), 12_000);
      const position = parseDetailPage(html, sourcePositionId);
      return position
        ? { ok: true, source: this.id, fetched_at: fetchedAt, position }
        : {
            ok: false,
            source: this.id,
            fetched_at: fetchedAt,
            error: `公告 ${sourcePositionId} 缺少可识别的标题`,
          };
    } catch (error) {
      return {
        ok: false,
        source: this.id,
        fetched_at: fetchedAt,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
  async fetch(params: FetchParams): Promise<FetchResult> {
    const fetchedAt = new Date().toISOString();
    const requestedLimit = params.limit ?? 50;
    const requestedScanLimit = params.scan_limit ??
      Math.max(requestedLimit * 10, 300);
    if (requestedScanLimit < requestedLimit) {
      return {
        ok: false,
        source: this.id,
        positions: [],
        scanned: 0,
        exhausted: false,
        truncated: true,
        fetched_at: fetchedAt,
        error: "scan_limit must be greater than or equal to limit",
      };
    }
    const want = Math.max(1, Math.min(requestedLimit, MAX_RESULTS));
    const scanLimit = Math.max(1, Math.min(requestedScanLimit, MAX_RESULTS));
    const deadline = Date.now() + TOTAL_TIMEOUT_MS;
    const positions: RawPosition[] = [];
    const seen = new Set<string>();
    let scanned = 0;
    let page = 1;
    let maxPages: number | undefined;
    let exhausted = false;
    let stoppedByLimit = false;

    try {
      while (positions.length < want && scanned < scanLimit) {
        const remainingMs = deadline - Date.now();
        if (remainingMs <= 0) throw new Error("overall timeout");
        const url = listingPageUrl(page, maxPages ?? 1);
        const html = await getText(url, Math.min(12_000, remainingMs));
        const parsed = parseListingPage(html);
        if (page === 1) {
          maxPages = parsed.maxPages;
          if (!maxPages) throw new Error("missing maxPageNum");
        }
        if (parsed.announcements.length === 0) {
          exhausted = true;
          break;
        }

        const allowed = Math.min(
          parsed.announcements.length,
          scanLimit - scanned,
        );
        for (const announcement of parsed.announcements.slice(0, allowed)) {
          scanned++;
          if (!isRecent(announcement.postedAt) || seen.has(announcement.id)) continue;
          seen.add(announcement.id);
          const position = announcementToPosition(announcement);
          if (!matchesRawPosition(position, params)) continue;
          positions.push(position);
          if (positions.length >= want) {
            stoppedByLimit = true;
            break;
          }
        }
        if (stoppedByLimit) break;

        // 从第二个物理页起列表按发布日期倒序；整页均越过新鲜度窗口后，
        // 视为已扫完本适配器声明的“近 180 天”覆盖范围。
        const pastFreshWindow = page > 1 &&
          parsed.announcements.every((item) => !isRecent(item.postedAt));
        const reachedLastPage = maxPages !== undefined && page >= maxPages;
        if (pastFreshWindow || reachedLastPage) {
          exhausted = true;
          break;
        }
        page++;
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (positions.length === 0) {
        return {
          ok: false,
          source: this.id,
          positions: [],
          scanned,
          exhausted: false,
          truncated: true,
          fetched_at: fetchedAt,
          error: `国资委人事招聘栏目不可达或页面结构已变化: ${message}`,
        };
      }
      return {
        ok: true,
        source: this.id,
        positions,
        scanned,
        exhausted: false,
        truncated: true,
        fetched_at: fetchedAt,
        note: `扫描中断，保留 ${positions.length} 条已验证公告: ${message}`,
      };
    }

    const truncated = !exhausted && (stoppedByLimit || scanned >= scanLimit);
    return {
      ok: true,
      source: this.id,
      total: exhausted ? positions.length : undefined,
      positions,
      scanned,
      exhausted,
      truncated,
      fetched_at: fetchedAt,
      note: truncated
        ? (
            stoppedByLimit
              ? `达到返回上限 ${want}；国资委栏目可能还有更多近 180 天招聘公告`
              : `扫描达到上限 ${scanLimit}；国资委栏目结果可能不完整`
          )
        : "已扫描国资委人事招聘栏目近 180 天公告；请到公告详情确认岗位拆分与报名状态。",
    };
  },
};

export default adapter;
