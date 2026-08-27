// 适配器共享基座：统一 HTTP JSON、扫描上限、分页完整性和客户端过滤。
// 新增来源只应实现请求构造、响应守卫和字段映射，不应重复发明分页状态机。
import http from "node:http";
import https from "node:https";
import { constants as cryptoConstants } from "node:crypto";
import { brotliDecompressSync, gunzipSync, inflateSync } from "node:zlib";
import type { FetchParams, FetchResult, RawPosition } from "./types.js";

export type JsonRequestOptions = {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  // 仅允许来源适配器按主机显式开启；不得全局降低 TLS 策略。
  legacyTls?: boolean;
};

export function requestJson(url: string, options: JsonRequestOptions = {}): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const body = options.body === undefined
      ? undefined
      : Buffer.from(JSON.stringify(options.body));
    const transport = target.protocol === "http:" ? http : https;
    const timeoutMs = options.timeoutMs ?? 12_000;
    const headers: Record<string, string | number> = {
      Accept: "application/json, text/plain, */*",
      "Accept-Encoding": "gzip, deflate, br",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      ...(options.headers ?? {}),
    };
    if (body) {
      headers["Content-Type"] ??= "application/json";
      headers["Content-Length"] = body.length;
    }
    const requestOptions: https.RequestOptions = {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || undefined,
      path: `${target.pathname}${target.search}`,
      method: options.method ?? (body ? "POST" : "GET"),
      headers,
    };
    if (target.protocol === "https:" && options.legacyTls) {
      requestOptions.secureOptions = cryptoConstants.SSL_OP_LEGACY_SERVER_CONNECT;
    }
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const req = transport.request(requestOptions, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      res.on("error", (error) => finish(() => reject(error)));
      res.on("end", () => finish(() => {
        try {
          const status = res.statusCode ?? 0;
          if (status < 200 || status >= 300) throw new Error(`HTTP ${status}`);
          let payload = Buffer.concat(chunks);
          const encoding = res.headers["content-encoding"];
          if (encoding === "gzip") payload = gunzipSync(payload);
          else if (encoding === "deflate") payload = inflateSync(payload);
          else if (encoding === "br") payload = brotliDecompressSync(payload);
          const text = payload.toString("utf8").trim();
          if (!text) throw new Error("empty response");
          let parsed: unknown = JSON.parse(text);
          // 少量旧站以 text/plain 返回二次 JSON 字符串。
          if (typeof parsed === "string") parsed = JSON.parse(parsed);
          resolve(parsed);
        } catch (error) {
          reject(error);
        }
      }));
    });
    const timer = setTimeout(
      () => req.destroy(new Error("absolute timeout")),
      timeoutMs,
    );
    req.on("error", (error) => finish(() => reject(error)));
    req.setTimeout(timeoutMs, () => req.destroy(new Error("socket timeout")));
    req.once("close", () => clearTimeout(timer));
    if (body) req.write(body);
    req.end();
  });
}

function includes(haystack: unknown, needle?: string): boolean {
  return !needle ||
    String(haystack ?? "").toLowerCase().includes(needle.toLowerCase());
}

export function matchesRawPosition(
  position: RawPosition,
  params: FetchParams,
): boolean {
  if (!includes(position.enterprise_name, params.enterprise)) return false;
  if (!includes(position.work_location, params.location)) return false;
  if (params.recruit_type && position.recruit_type !== params.recruit_type) return false;
  if (params.sector && position.sector !== params.sector) return false;
  if (params.education && !includes(position.education, params.education)) return false;
  if (
    params.major &&
    !includes(position.major, params.major) &&
    !includes(position.major, "不限")
  ) return false;
  if (params.keyword) {
    const searchable = [
      position.enterprise_name,
      position.title,
      position.work_location,
      position.major,
      position.education,
      position.desc,
      position.requirements,
      position.remarks,
    ].filter(Boolean).join(" ");
    if (!includes(searchable, params.keyword)) return false;
  }
  return true;
}

export type PageResult<T> = {
  records: T[];
  // 上游未过滤的记录总数；只用于判断是否到达列表末尾。
  total?: number;
};

export type PagedSourceOptions<T> = {
  source: string;
  params: FetchParams;
  pageSize: number;
  defaultScanLimit?: number;
  maxLimit?: number;
  totalTimeoutMs?: number;
  requestTimeoutMs?: number;
  delayBetweenPagesMs?: number;
  fetchPage(
    page: number,
    pageSize: number,
    timeoutMs: number,
  ): Promise<PageResult<T>>;
  parseRecord(record: T): RawPosition | null;
  recordKey?(record: T, parsed: RawPosition): string | undefined;
  successNote?: string;
  errorHint?(error: unknown): string;
};

export async function fetchPagedSource<T>(
  options: PagedSourceOptions<T>,
): Promise<FetchResult> {
  const fetchedAt = new Date().toISOString();
  const maxLimit = options.maxLimit ?? 5000;
  const requestedLimit = options.params.limit ?? 50;
  const requestedScanLimit = options.params.scan_limit ??
    options.defaultScanLimit ??
    Math.max(requestedLimit * 20, 1000);
  if (requestedScanLimit < requestedLimit) {
    return {
      ok: false,
      source: options.source,
      positions: [],
      scanned: 0,
      exhausted: false,
      truncated: true,
      fetched_at: fetchedAt,
      error: "scan_limit must be greater than or equal to limit",
    };
  }
  const want = Math.max(1, Math.min(requestedLimit, maxLimit));
  const scanLimit = Math.max(1, Math.min(requestedScanLimit, maxLimit));
  const deadline = Date.now() + (options.totalTimeoutMs ?? 20_000);
  const positions: RawPosition[] = [];
  const seen = new Set<string>();
  let page = 1;
  let scanned = 0;
  let exhausted = false;
  let stoppedByLimit = false;
  let previousPageSignature = "";

  try {
    while (positions.length < want && scanned < scanLimit) {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) throw new Error("overall timeout");
      const pageResult = await options.fetchPage(
        page,
        options.pageSize,
        Math.min(options.requestTimeoutMs ?? 12_000, remainingMs),
      );
      if (!Array.isArray(pageResult.records)) {
        throw new Error("missing response list");
      }
      const records = pageResult.records;
      if (records.length === 0) {
        exhausted = true;
        break;
      }
      const pageSignature = records.map((record) => {
        try {
          const parsed = options.parseRecord(record);
          return parsed
            ? options.recordKey?.(record, parsed) ??
              parsed.source_position_id ??
              parsed.id ??
              `${parsed.enterprise_name}\u0000${parsed.title}`
            : "";
        } catch {
          return "";
        }
      }).join("|");
      if (pageSignature && pageSignature === previousPageSignature) {
        return {
          ok: true,
          source: options.source,
          positions,
          scanned,
          exhausted: false,
          truncated: true,
          fetched_at: fetchedAt,
          note: "上游返回重复分页，已停止扫描并保留已验证结果",
        };
      }
      previousPageSignature = pageSignature;

      const allowed = Math.min(records.length, scanLimit - scanned);
      let processed = 0;
      for (let index = 0; index < allowed; index++) {
        const record = records[index];
        scanned++;
        processed++;
        let parsed: RawPosition | null;
        try {
          parsed = options.parseRecord(record);
        } catch {
          parsed = null;
        }
        if (!parsed || !matchesRawPosition(parsed, options.params)) continue;
        const key = options.recordKey?.(record, parsed) ??
          parsed.source_position_id ??
          parsed.id ??
          `${parsed.enterprise_name}\u0000${parsed.title}`;
        if (seen.has(key)) continue;
        seen.add(key);
        positions.push(parsed);
        if (positions.length >= want) {
          stoppedByLimit = true;
          break;
        }
      }

      const inspectedWholePage = processed === records.length;
      const reachedKnownEnd = pageResult.total !== undefined &&
        page * options.pageSize >= pageResult.total;
      if (
        inspectedWholePage &&
        (records.length < options.pageSize || reachedKnownEnd)
      ) {
        exhausted = true;
        break;
      }
      page++;
      if (options.delayBetweenPagesMs) {
        await new Promise((resolve) =>
          setTimeout(resolve, options.delayBetweenPagesMs)
        );
      }
    }
  } catch (error) {
    const message = options.errorHint?.(error) ??
      (error instanceof Error ? error.message : String(error));
    if (positions.length > 0) {
      return {
        ok: true,
        source: options.source,
        positions,
        scanned,
        exhausted: false,
        truncated: true,
        fetched_at: fetchedAt,
        note: `扫描中断，保留 ${positions.length} 条已验证结果: ${message}`,
      };
    }
    return {
      ok: false,
      source: options.source,
      positions: [],
      scanned,
      exhausted: false,
      truncated: true,
      fetched_at: fetchedAt,
      error: message,
    };
  }

  const truncated = !exhausted && (stoppedByLimit || scanned >= scanLimit);
  return {
    ok: true,
    source: options.source,
    total: exhausted ? positions.length : undefined,
    positions,
    scanned,
    exhausted,
    truncated,
    fetched_at: fetchedAt,
    note: truncated
      ? (
          stoppedByLimit
            ? `达到返回上限 ${want}，源中可能还有更多匹配岗位`
            : `扫描达到上限 ${scanLimit}，结果可能不完整`
        )
      : options.successNote,
  };
}
