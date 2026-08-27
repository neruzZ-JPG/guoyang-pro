# guoyang-pro · 国央企 PRO

面向 Claude Code / Codex / Cursor 的国央企求职 CLI：

- 158 家中央与地方国企参考名录；
- 国聘、24365 多源实时岗位扫描；
- 二三级子公司到母集团的保守归一化；
- 24 小时本地缓存与来源、抓取时间、覆盖状态披露；
- 招聘日历、岗位匹配和冲稳保启发式规划。

当前维护仓库：[neruzZ-JPG/guoyang-pro](https://github.com/neruzZ-JPG/guoyang-pro)

新版 npm 包：[`@neruzz-jpg/guoyang-pro`](https://www.npmjs.com/package/@neruzz-jpg/guoyang-pro)

```text
跑 `npx @neruzz-jpg/guoyang-pro@latest help` 把命令摸清楚，帮我规划国央企求职。

先问我学历、专业、院校层级、政治面貌、意向城市、意向行业和招聘类型；
再查询企业名录、实时岗位、来源状态与招聘时间线。
不要把“当前扫描窗口未命中”说成“全网没有岗位”，并提醒我核验投递页、
用工性质和薪资口径。
```

## 数据路线

| 数据 | 路线 | 说明 |
|---|---|---|
| 企业名录、行业、梯队 | 随 npm 包静态发布 | 离线可查；梯队是编辑性求职热度参考，不是官方评级 |
| 招聘时间线 | 随包静态发布 | 行业典型规律，以企业当年公告为准 |
| 在招岗位 | 运行时扫描国聘、24365 | 每条保留来源、抓取时间和质量提示 |
| 短期岗位缓存 | `~/.guoyangpro/cache/positions.json` | 实时源全失败时回退到 24 小时内缓存；权限 `0600` |
| 离线快照 | `cli/data/positions/*.json.gz` | 可选；当前包可能没有快照，只有显式 `--offline` 时使用 |

## 常用命令

```bash
# npm 包发布后
npx @neruzz-jpg/guoyang-pro@latest help

# 静态名录
guoyang-pro enterprises --tier T0
guoyang-pro enterprises --sector 金融银行

# 实时岗位；limit 是返回量，scan-limit 是每源最大扫描量
guoyang-pro search --sector 能源电力 --type 校招 --location 北京 \
  --limit 20 --scan-limit 2000
guoyang-pro search --enterprise 国家电网 --education 本科

# 不联网复用“相同筛选与覆盖参数”的最近 24 小时实时缓存
# （不同于随包 --offline 快照）
guoyang-pro search --sector 能源电力 --cache-only

# 企业详情也实时扫描所属子公司岗位
guoyang-pro enterprise 国家电网 --limit 20 --scan-limit 3000

# 检查真实源健康；--static 只看配置、不联网
guoyang-pro sources
guoyang-pro sources --static

# search 后可用完整 id 或源岗位 id 查看近期缓存详情
guoyang-pro detail --id iguopin:215568737309296192

# 规划命令共享实时/缓存岗位池
guoyang-pro recommend --education 本科 --school-tier 211 --sector 金融银行
guoyang-pro match --sector 电信运营 --location 上海 --keywords 数据,算法
guoyang-pro hot --by sector
guoyang-pro stats
```

> `@neruzz-jpg/guoyang-pro` 尚未发布时，请先克隆本仓库，再进入 `cli/`
> 执行 `npm ci && npm run build && node dist/index.js help`。

## 如何理解查询结果

返回的 `data` 字段会披露：

- `mode`：`live` / `cache` / `offline`；`--cache-only` 可显式只读 24 小时缓存；
- `fetched_at` 或 `cache_updated_at`；
- `scanned`：本次实际扫描的上游记录数；
- `degraded`：部分源失败或扫描窗口被截断；
- `complete`：只有所有启用源都确认扫描到列表末尾时才为 `true`；
- `sources[].ok/exhausted/truncated/note/error`：逐源健康与覆盖边界。

当 `complete=false` 时，零结果只表示“当前扫描窗口未命中”，不能推断全源没有岗位。可提高 `--scan-limit`，上限为每源 5000 条。`--year` 只适用于 `--offline` 随包快照；当前包没有对应年份快照时会明确报错。

## 数据可信度策略

### 企业与行业

- 官方名录参考：[国务院国资委央企名录](https://www.sasac.gov.cn/n2588045/n27271785/n27271792/c14159097/content.html)、[财政部](https://www.mof.gov.cn/)、[国家金融监督管理总局](https://www.nfra.gov.cn/)、[国铁集团](http://www.china-railway.com.cn/)、[国家烟草专卖局](http://www.tobacco.gov.cn/)。
- 招聘主体保持源站原名；只有精确名称、明确别名或受控集团规则命中时才继承母集团梯队。
- 未收录子公司仍可依据国聘的企业行业字段参与行业查询，但不会被强行猜测梯队。
- `match_confidence` 为 `exact` / `affiliate` / `none`。

### 岗位

- 国聘是主源，使用其企业性质、行业、招聘类型、地点、学历、薪资和截止时间字段。
- 24365 是聚合补充源，仅保留 `recProperty` 明确为国有/央企/国企的记录。
- 24365 的 `recruitType` 枚举与标题存在冲突，因此只从“校招/应届/实习/社招”等明确文字推断；无法判断时标为 `unknown`。
- 24365 的 `lowMonthPay/highMonthPay` 按“千元/月”列表口径展示，并始终标“仅供参考”。
- 跨源同岗会合并 `source_urls`；招聘类型或薪资冲突写入 `quality_warnings`。
- 明确过期岗位会被过滤；异常未来发布时间会留下质量告警。
- `hot/cold/stats` 在未完整扫描全部源时明确标为 `partial_sample`，不把样本数称为全量岗位总数。

## 边界

- 实时公共接口可能限流、改版或临时不可达。
- 目前没有各企业招聘官网的全量专用适配器；国聘和 24365 之外的岗位可能漏检。
- 企业梯队、冲稳保和“相对易上岸”均为启发式参考，不是官方录取数据。
- 用工性质由岗位文本派生；识别不到时保持“未明确”。
- 薪资、截止时间和投递资格必须以最终投递页为准。

## 开发与验证

```bash
npm ci
npm run check

cd cli
npm run check
npm run build
npm pack --dry-run
```

CLI 零运行时依赖，支持 Node.js ≥18。MIT。

Web 端部署到 Vercel 时会优先使用 Vercel 提供的生产域名；如绑定自定义域名，
请设置 `NEXT_PUBLIC_SITE_URL=https://你的域名`，用于 Open Graph 与 sitemap。

## 发布新版 CLI

首次发布前，请确认 npm 账号拥有 `@neruzz-jpg` scope，然后执行：

```bash
cd cli
npm login
npm publish --access public
```

发布成功后，README 中的 `npx @neruzz-jpg/guoyang-pro@latest ...` 命令即可直接使用。

本项目基于 MIT 许可的上游项目继续开发；原始版权声明保留在 `LICENSE`
和 `cli/LICENSE` 中，当前维护与发布入口以上述仓库和 npm 包为准。
