// cli/src/adapters/types.ts
// 实时数据源适配器契约。国央企"在招岗位"是时变数据(像大厂一样每天开/关),
// 不能提前快照存死,故走 job-pro 式实时路线:运行时打各源 API 拉取并归一化。
// 每个源(国聘/24365/国家电网/应届生...)实现一个 SourceAdapter。
import type { Position, RecruitType } from "../codes.js";

export type FetchParams = {
  keyword?: string;
  sector?: string;       // 行业(已归一化中文枚举)
  location?: string;     // 城市
  recruit_type?: RecruitType; // 校招/社招/实习
  enterprise?: string;   // 指定企业名/简称
  enterprise_hint?: string; // 用户原始企业查询，供支持企业名下推的适配器使用
  enterprise_id?: string; // 归一化企业 id（适配器通常无法直接下推）
  tier?: string;
  education?: string;
  major?: string;
  employment_type?: string;
  limit?: number;        // 最终期望返回上限
  scan_limit?: number;   // 每个源最多扫描的原始记录数；与最终 limit 分离
};

// 适配器返回的"半成品"岗位:必须有企业名+岗位名,其余字段尽量填。
// enterprise_id/tier/sector/employment_type 等由 live.ts 统一用名录归一化补齐。
export type RawPosition = Partial<Position> & {
  enterprise_name: string;
  title: string;
};

export type FetchResult = {
  ok: boolean;
  source: string;         // 适配器 id
  total?: number;         // 该源命中总量(若已知)
  scanned: number;        // 实际扫描的原始记录数
  exhausted: boolean;     // 是否确认扫到源列表末尾
  truncated: boolean;     // 是否因 scan_limit/timeout 提前停止
  fetched_at: string;
  positions: RawPosition[];
  error?: string;
  note?: string;
};

export type DetailResult = {
  ok: boolean;
  source: string;
  fetched_at: string;
  position?: RawPosition;
  error?: string;
};

export type SourceAdapter = {
  id: string;             // "iguopin" | "ncss" | "sgcc" ...
  name: string;           // 中文名
  homepage: string;
  scopes: RecruitType[];  // 支持的招聘类型
  live: boolean;          // 是否已接通(false=占位/待逆向)
  kind?: "official" | "aggregator"; // 一手企业官网或聚合公共平台
  priority?: number;      // 跨源字段冲突时的来源优先级；官方一手源通常更高
  coverage?: string;      // 企业/岗位范围说明
  disabled_reason?: string;
  quality?: string;       // 字段质量/覆盖边界的诚实披露
  fetch(params: FetchParams): Promise<FetchResult>;
  fetchDetail?(sourcePositionId: string): Promise<DetailResult>;
};
