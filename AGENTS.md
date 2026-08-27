# guoyang-pro · 架构与适配器开发约定(给 agent / 开发者)

## Git 工作流

- 开始任何开发任务前，先检查当前分支并自动切换到 `dev`；默认不在 `master` 上开发。
- 切换分支时保留用户已有工作区改动，不得为切换分支擅自丢弃、覆盖或重置修改。
- 开发完成后执行与改动相匹配的检查；检查通过后，由 agent 主动创建清晰的 Git commit，并 push 到 `origin/dev`。
- commit 只包含本次任务相关改动；发现用户或其他任务的无关修改时，不得混入提交。
- 除非用户明确要求，不自动合并到 `master`、不直接 push `master`、不 force push、不改写远端历史。
- push 失败时应报告具体原因并保留本地 commit，不以危险操作绕过分支保护或权限限制。

## 混合架构(核心决策)

国央企求职数据分两类，**绝不混为一谈**：

1. **慢变参考数据 → 静态入库**(`cli/data/`，随 npm 包发布)
   - 企业名录 `data/enterprises/roster.json`(国资委99 + 金融27 + 烟草 + 铁路 + 地方头部)
   - 招聘日历 `data/calendar/calendar.json`
   - 生产：`raw/enterprises/*.json` → `npx tsx src/ingest-enterprises.ts` → `roster.json`
2. **时变数据(在招岗位)→ 运行时实时拉取**(适配器，不预存)
   - 岗位像大厂一样每天开/关，快照会过期，故走 job-pro 式实时适配器
   - `data/positions/*.json.gz` 只是**可选的离线快照**(`--offline` 用)，非主路径
   - 成功结果写入 `~/.guoyangpro/cache/positions.json`；实时源全失败时只允许回退到 24 小时内缓存
   - `--cache-only` 显式只读 24 小时缓存；`--offline` 只读随包快照，二者语义不得混淆
   - `enterprise/detail/recommend/match/hot/cold/stats` 与 `search` 共用实时/缓存岗位层，禁止各自读取不同口径

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
    return {
      ok: true, source: "iguopin", total, positions,
      scanned, exhausted, truncated, fetched_at: new Date().toISOString(),
    };
  },
};
export default adapter;
```

接通后在 `src/adapters/index.ts` 注册到 `ADAPTERS`。

### 适配器开发硬要求
- **零运行时依赖**：只用 Node 内置(`fetch`、`zlib`)。不要 import 第三方包。
- **真接通才 `live:true`**：必须 curl/实测能拉到真实岗位记录；拿不到就 `live:false` 并在 notes 说明(诚实披露，参考 job-pro 的 honest-stub)。
- **超时与容错**：fetch 加超时(AbortController, ~10s)；失败返回 `{ok:false, error}`，不要抛未捕获异常(`live.ts` 用 allSettled，但仍应自处理)。
- **分页**：`params.limit` 是最终返回量，`params.scan_limit` 是最多扫描量。不能把“前 N 条未命中”说成“全源无岗位”。
- **覆盖披露**：每次返回真实 `scanned/exhausted/truncated/fetched_at`；达到返回上限也必须 `truncated:true`。
- **失败语义**：上游可达但零命中可 `ok:true`；请求失败才 `ok:false`。编排层所有源失败必须非零退出或回退新鲜缓存。
- **归一化映射**：在 notes/字段映射里写清源字段 → RawPosition 字段。
- **未知优先**：上游枚举语义未核验时使用 `unknown`，不得默认猜成社招/正式/T2。
- **来源统一**：填 `source_id/source_position_id/source`；`source` 使用可访问的详情 URL。

## 企业覆盖与可信度

- 招聘主体原名保留在 `enterprise_name`。
- `match_confidence=exact` 才表示静态名录精确匹配；`affiliate` 表示受控规则关联母集团；`none` 不继承母集团梯队。
- 未收录子公司可以使用上游企业行业字段参与行业查询，但不能为了覆盖率凭空补梯队。
- 新增集团规则必须有明确品牌/集团关系证据，并为正例与未知企业各补一条测试。

## 数据重建

- 企业 raw 必须包含可核验 `source/sources`；生成的 `meta.sources` 不得为空。
- 岗位 raw 为空时默认拒绝覆盖现有快照；只有显式 `GUOYANG_ALLOW_EMPTY_INGEST=1` 才允许空构建。
- 岗位分片在临时目录生成并校验后原子替换，避免失败时破坏现有数据。

## 命令面(`src/index.ts` VERBS)
`enterprises / enterprise / search / detail / recommend / match / hot / cold / calendar / stats / memory / sources / tiers / sectors / regulators / selftest / help / version`

## 验证
```bash
cd cli && npm run check && npm run build && node dist/index.js selftest
```

实时适配器变更还需在可联网环境执行：

```bash
node dist/index.js sources
node dist/index.js search --sector 航空航天军工 --limit 5 --scan-limit 500
```

## 文档纪律
改了行为就更新本文件与 README;每次数据扩充在 commit message 写清来源与覆盖。
