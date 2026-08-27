# guoyang-pro · 国央企 PRO

国央企求职 CLI：可溯源企业名录、国聘/24365 实时岗位扫描、子公司归一化、24 小时缓存和招聘规划。CLI 零运行时依赖，支持 Node.js ≥18。

```bash
# npm 包发布后
npx @neruzz-jpg/guoyang-pro@latest help

# 实时岗位。limit 是返回量，scan-limit 是每源最大扫描量
guoyang-pro search --sector 能源电力 --type 校招 \
  --limit 20 --scan-limit 2000

# 企业详情会扫描其已识别子公司岗位
guoyang-pro enterprise 国家电网 --scan-limit 3000

# 真实源健康检查
guoyang-pro sources

# 不联网复用相同筛选与覆盖参数的最近 24 小时实时缓存
guoyang-pro search --sector 能源电力 --cache-only
```

尚未发布 npm 包时，可从当前仓库本地运行：

```bash
git clone https://github.com/neruzZ-JPG/guoyang-pro.git
cd guoyang-pro/cli
npm ci
npm run build
node dist/index.js help
```

## 结果可信度

每次岗位查询都会返回 `data`：

- `mode`: `live` / `cache` / `offline`；
- `scanned`: 实际扫描记录数；
- `degraded`: 部分源失败或扫描被截断；
- `complete`: 所有启用源均确认扫描到末尾时才为 `true`；
- `sources[].ok/exhausted/truncated/note/error`: 逐源状态。

`complete=false` 时，零结果只能解释为“当前扫描窗口未命中”，不能解释为“全源没有岗位”。

`--year` 只用于 `--offline` 随包快照；包内没有该年份快照时会报错。`hot/cold/stats` 在覆盖不完整时标为 `partial_sample`。

## 数据边界

- 国聘为主源；24365 为补充聚合源。
- 24365 的招聘类型枚举不可靠，只从明确岗位文字推断；无法判断时为 `unknown`。
- 24365 薪资按“千元/月”列表口径展示，并标注“仅供参考”。
- 招聘主体保持原名；只有精确名称、明确别名或受控集团规则命中时才继承母集团梯队。
- 跨源同岗会合并来源，冲突字段写入 `quality_warnings`。
- 实时源失败时仅回退到 24 小时内缓存；缓存路径为 `~/.guoyangpro/cache/positions.json`。
- 梯队、冲稳保和“相对易上岸”是启发式参考，不是官方录取数据。

更完整的架构、来源、命令与开发说明见
[neruzZ-JPG/guoyang-pro](https://github.com/neruzZ-JPG/guoyang-pro#readme)。
