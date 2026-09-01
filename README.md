<div align="center">

# 国央企 Pro

**找到适合你的岗位，知道下一份该投哪里**

找机会 · 看要求 · 排优先级 · 定投递计划

告诉 AI 你的专业、城市和求职偏好，它会帮你寻找机会、比较岗位并整理下一步行动。

[![npm version](https://img.shields.io/npm/v/@neruzz-jpg/guoyang-pro?color=18181b&label=npm)](https://www.npmjs.com/package/@neruzz-jpg/guoyang-pro)
[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A518-18181b)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-18181b.svg)](LICENSE)

[在线体验](https://guoyang-pro.vercel.app/) · [npm](https://www.npmjs.com/package/@neruzz-jpg/guoyang-pro)

```text
你是我的国央企求职助手。

请询问我的学历、专业、院校层级、意向城市、意向行业、招聘类型和关键词；
然后帮我寻找和分析岗位，输出“优先投递 / 可以尝试 / 继续观察”
三档清单，并告诉我推荐理由、截止时间和投递入口。
```

[交给 AI](#把提示词交给-ai) · [快速开始](#快速开始) · [常用场景](#常用场景) · [命令一览](#命令一览)

</div>

![国央企 Pro 官网预览](docs/preview.jpg)

---

## 复制给 AI，开始找岗位

将下面的完整提示词复制给 Claude Code、Codex 或 Cursor：

```text
你是我的国央企求职助手。请使用 `npx @neruzz-jpg/guoyang-pro@latest help` 提供的能力帮我规划求职。

开始前，请依次询问我的学历、专业、院校层级、意向城市、意向行业、招聘类型和关键词。

然后请：
1. 帮我寻找合适的企业和岗位；
2. 如果暂时没有合适结果，调整条件继续寻找；
3. 比较岗位要求、截止时间和我的匹配程度；
4. 输出“优先投递 / 可以尝试 / 继续观察”三档清单，并说明理由；
5. 告诉我截止时间和投递入口，提醒我以官方页面为准。
```

AI 会完成这条链路：

```text
了解你的情况 → 寻找机会 → 比较岗位 → 给出投递顺序
```

## 它能做什么

| 能力 | 适合解决的问题 |
|---|---|
| 🏢 企业查询 | 按行业、梯队、监管体系浏览国央企，查看企业详情 |
| 🔎 岗位搜索 | 按企业、城市、学历、专业与招聘类型筛选岗位 |
| 🤖 AI 协作 | 让 AI 继续追问、比较机会并给出下一步行动 |
| 🎯 智能匹配 | 结合个人意向整理更值得关注的岗位与方向 |
| 📊 求职规划 | 生成分档投递清单，辅助安排投递优先级 |
| 📅 招聘日历 | 查看典型招聘节奏，提前准备笔试、面试与投递 |
| 🔗 来源核验 | 查询结果保留来源信息，方便回到投递页面确认 |

## 快速开始

如果希望自己直接使用 CLI，无需全局安装：

```bash
npx @neruzz-jpg/guoyang-pro@latest help
```

也可以安装后使用更短的命令：

```bash
npm install -g @neruzz-jpg/guoyang-pro
guoyang-pro help
```

> 需要 Node.js 18 或更高版本。

## 常用场景

### 1. 浏览目标企业

```bash
# 查看热门梯队企业
guoyang-pro enterprises --tier T0

# 查看金融银行方向企业
guoyang-pro enterprises --sector 金融银行
```

### 2. 搜索在招岗位

```bash
# 查看当前校招机会
npx @neruzz-jpg/guoyang-pro@latest search --type 校招 --limit 5

# 再根据结果逐步增加城市、行业、学历等条件
guoyang-pro search --location 北京 --limit 5
```

### 3. 生成匹配与投递参考

```bash
# 按个人偏好匹配岗位
guoyang-pro match \
  --sector 电信运营 \
  --location 上海 \
  --keywords 数据,算法

# 生成冲 / 稳 / 保参考组合
guoyang-pro recommend \
  --education 本科 \
  --school-tier 211 \
  --sector 金融银行
```

### 4. 查看招聘节奏

```bash
guoyang-pro calendar
guoyang-pro hot --by sector
guoyang-pro stats
```

## 命令一览

| 命令 | 用途 |
|---|---|
| `enterprises` | 浏览与筛选企业名录 |
| `enterprise` | 查看单个企业及相关岗位 |
| `search` | 搜索岗位 |
| `detail` | 查看岗位详情；缓存未命中时按来源实时查询（当前支持国聘） |
| `recommend` | 生成冲 / 稳 / 保参考组合 |
| `match` | 根据个人意向进行匹配 |
| `calendar` | 查看招聘日历 |
| `hot` / `cold` | 查看当前样本的冷热方向 |
| `stats` | 查看查询样本概览 |
| `memory` | 保存求职画像与关注项 |
| `sources` | 查看来源状态 |

完整参数请运行：

```bash
guoyang-pro help
```

## 使用提示

- 岗位状态、截止时间、资格条件与薪资以最终投递页面为准。
- 搜索结果会标注来源和覆盖状态；零结果不等于所有渠道均无岗位。
- 国聘搜索会优先下推企业名称和可识别城市，再在本地复核专业、关键词等条件，降低固定扫描窗口漏检。
- 国聘岗位可直接执行 `guoyang-pro detail --id <国聘岗位ID>` 实时核验详情，不要求先通过列表搜索命中。
- 岗位会随招聘上下线变化，建议定期重新查询。
- 企业梯队、匹配度和冲稳保属于求职参考，不代表官方评级或录取结论。
- 本工具不要求用户上传账号密码、简历或其他敏感个人信息。

## 本地开发

```bash
git clone https://github.com/neruzZ-JPG/guoyang-pro.git
cd guoyang-pro
npm ci
npm run check
```

CLI 位于 `cli/`，支持 Node.js ≥18，采用 [MIT License](LICENSE)。
