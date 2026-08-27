// 中国南方电网官方招聘候选适配器。
// 2026-08 已验证公开 guest token 与 webPost/search 协议可用，但校园/社会招聘
// 当前均返回完整空列表。按项目规约，未实测拿到真实岗位前保持 live:false。
import type { FetchResult, SourceAdapter } from "./types.js";

const disabled = (): FetchResult => ({
  ok: false,
  source: "csg",
  positions: [],
  scanned: 0,
  exhausted: false,
  truncated: true,
  fetched_at: new Date().toISOString(),
  error: "候选源未启用：官方游客接口当前无可验证的在招岗位",
});

const adapter: SourceAdapter = {
  id: "csg",
  name: "中国南方电网官方招聘（候选）",
  homepage: "https://zhaopin.csg.cn/",
  scopes: ["campus", "social"],
  live: false,
  kind: "official",
  priority: 100,
  coverage: "南方电网及所属单位校园招聘、社会招聘。",
  disabled_reason:
    "公开游客认证和分页接口已验证，但当前校园/社会招聘均为完整空列表；出现可核验真实岗位后再启用。",
  quality: "候选源；不得把历史公告或空列表冒充当前在招岗位。",
  async fetch() {
    return disabled();
  },
};

export default adapter;
