# guoyang-pro · 架构与适配器开发约定(给 agent / 开发者)

## 混合架构(核心决策)

国央企求职数据分两类，**绝不混为一谈**：

1. **慢变参考数据 → 静态入库**(`cli/data/`，随 npm 包发布)
   - 企业名录 `data/enterprises/roster.json`(国资委99 + 金融27 + 烟草 + 铁路 + 地方头部)
   - 招聘日历 `data/calendar/calendar.json`
   - 生产：`raw/enterprises/*.json` → `npx tsx src/ingest-enterprises.ts` → `roster.json`
2. **时变数据(在招岗位)→ 运行时实时拉取**(适配器，不预存)
   - 岗位像大厂一样每天开/关，快照会过期，故走 job-pro 式实时适配器
   - `data/positions/*.json.gz` 只是**可选的离线快照**(`--offline` 用)，非主路径

## 实时适配器契约(`src/adapters/types.ts`)

每个数据源一个文件 `src/adapters/<id>.ts`，`export default` 一个 `SourceAdapter`：

```ts
import type { SourceAdapter, FetchParams, FetchResult } from "./types.js";
const adapter: SourceAdapter = {
  id: "iguopin",
  name: "国聘网",
  homepage: "https://www.iguopin.com/",
  scopes: ["campus", "social"],
  live: true,                    // 真接通了才置 true(冒烟能拉到真实岗位)
  async fetch(params: FetchParams): Promise<FetchResult> {
    // 用全局 fetch() 打该源 API(零依赖)。把每条岗位填成 RawPosition:
    //   必填 enterprise_name + title；尽量填 work_location/education/major/
    //   headcount/recruit_type/apply_url/source/salary_ref/remarks
    // enterprise_id / tier / sector / employment_type 由 live.ts 用名录统一归一化，适配器不用管。
    return { ok: true, source: "iguopin", total, positions };
  },
};
export default adapter;
```

接通后在 `src/adapters/index.ts` 注册到 `ADAPTERS`。

### 适配器开发硬要求
- **零运行时依赖**：只用 Node 内置(`fetch`、`zlib`)。不要 import 第三方包。
- **真接通才 `live:true`**：必须 curl/实测能拉到真实岗位记录；拿不到就 `live:false` 并在 notes 说明(诚实披露，参考 job-pro 的 honest-stub)。
- **超时与容错**：fetch 加超时(AbortController, ~10s)；失败返回 `{ok:false, error}`，不要抛未捕获异常(`live.ts` 用 allSettled，但仍应自处理)。
- **分页**：按 `params.limit` 控制拉取量，避免拉爆。
- **归一化映射**：在 notes/字段映射里写清源字段 → RawPosition 字段。

## 命令面(`src/index.ts` VERBS)
`enterprises / enterprise / search / detail / recommend / match / hot / cold / calendar / stats / memory / sources / tiers / sectors / regulators / selftest / help / version`

## 验证
```bash
cd cli && npx tsc --noEmit && npx tsx test/smoke.ts && npx tsx src/index.ts selftest
```

## 文档纪律
改了行为就更新本文件与 README;每次数据扩充在 commit message 写清来源与覆盖。
