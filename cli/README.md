# guoyang-pro · 国央企 PRO

用 Claude Code 规划你的国央企求职(国企/央企)。
[guoyang.ha7ch.com](https://guoyang.ha7ch.com) · 与 [job-pro](https://job.ha7ch.com)(大厂)、[kaogong-pro](https://kaogong.ha7ch.com)(考公)同系列。

把下面这段 prompt 粘进 Claude Code / Codex / Cursor：

```
跑 `npx @ha7ch/guoyang-pro@latest help` 把命令摸清楚，帮我规划国央企求职。

先问我：学历、专业、院校层级(985/211/双一流/普通本科)、政治面貌、
意向城市、意向行业(电力/油气/金融/通信/烟草...)、校招还是社招。
然后用 CLI 拉真实数据：查央企名录与梯队、实时在招岗位、招聘时间线。
提醒我用工性质(在编/正式 vs 劳务派遣)与薪资口碑的差异。
```

## 为什么是"混合架构"

国央企求职有两类数据，性质完全不同，所以分两条路存取：

| 数据 | 性质 | 路线 |
|---|---|---|
| **名录 / 梯队 / 行业 / 招聘日历** | 慢变参考数据 | **随包静态发布**(像考公数据集) |
| **在招岗位** | 时变数据(像大厂一样每天开/关) | **运行时实时拉取**(像 job-pro 适配器) |

岗位不提前快照存死——否则发出去就过期；名录与时间线则打包进 npm 包，离线可用、稳定，是产品的护城河。

## 命令

```bash
npx @ha7ch/guoyang-pro@latest help

# 名录(静态,离线可用)
guoyang-pro enterprises --tier T0                 # 顶级梯队企业
guoyang-pro enterprises --sector 金融银行          # 按行业
guoyang-pro enterprise 国家电网                     # 单企业详情 + 在招岗位

# 岗位(实时,默认联网拉各源)
guoyang-pro search --sector 能源电力 --type 校招 --location 北京
guoyang-pro search --enterprise 中石油 --education 硕士
guoyang-pro search --sector 金融银行 --offline      # 仅用本地快照(不联网)
guoyang-pro sources                                # 查实时数据源接通状态

# 规划
guoyang-pro recommend --education 本科 --school-tier 211 --sector 金融银行
guoyang-pro match --sector 电信运营 --location 上海 --keywords 数据,算法
guoyang-pro calendar --sector 金融银行             # 招聘时间线/投递日历
guoyang-pro stats
```

## 数据来源

- **名录**：国务院国资委央企名录(~99家)、财政部中央金融企业(~27家)、中国烟草、国铁集团、地方头部国企。
- **岗位(实时)**：[国聘网 iguopin.com](https://www.iguopin.com/)(国资委牵头聚合，覆盖 85%+ 央企国企岗)、[国家大学生就业服务平台 24365](https://www.ncss.cn/)、各大型央企招聘官网。
- **招聘日历**：各行业校招/社招典型时间线规律(以各企业当年公告为准)。

## 诚实披露

- 岗位为各源**实时聚合**，命中量随当下在招情况变化；`sources` 可查每个源是否接通。
- **薪资**国央企高度保密，仅以公开/口碑参考标注（"仅供参考"），数据质量天然弱于大厂。
- **竞争度/冲稳保**为启发式估算(企业梯队+学历门槛 vs 院校层级)，**非官方录取数据**。
- **用工性质**(在编/正式、合同制、劳务派遣)由岗位文本自动派生，识别不到标"未明确"，不臆断。

## 开发

```bash
cd cli
npm install
npx tsx src/index.ts help          # 跑源码
npx tsx src/ingest-enterprises.ts  # 重建名录 raw/enterprises/*.json → data/enterprises/roster.json
npx tsx src/ingest-positions.ts    # (可选)把抓取快照入库为离线分片
npm test                           # 冒烟测试
npm run build                      # tsc → dist/
```

零运行时依赖(Node ≥18，用内置 fetch/zlib)。MIT。
