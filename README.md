<div align="center">

# 国央企 Pro

**把提示词给 AI，让它帮你查岗位、做分析**

Claude Code · Codex · Cursor · 企业名录 · 实时岗位 · 投递计划

AI 会询问你的求职画像，调用 guoyang-pro 查询真实岗位，再整理成可执行的投递清单。

[![npm version](https://img.shields.io/npm/v/@neruzz-jpg/guoyang-pro?color=18181b&label=npm)](https://www.npmjs.com/package/@neruzz-jpg/guoyang-pro)
[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A518-18181b)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-18181b.svg)](LICENSE)

```text
你是我的国央企求职分析助手。请先在终端运行
`npx @neruzz-jpg/guoyang-pro@latest help` 了解可用命令。

请询问我的学历、专业、院校层级、意向城市、意向行业、招聘类型和关键词；
然后调用 guoyang-pro 查询并分析岗位，输出“优先投递 / 可以尝试 / 继续观察”
三档清单，保留来源、截止时间和投递地址。
```

[交给 AI](#把提示词交给-ai) · [快速开始](#快速开始) · [常用场景](#常用场景) · [命令一览](#命令一览)

</div>

![国央企 Pro 官网预览](docs/preview.jpg)

---

## 把提示词交给 AI

将下面的完整提示词复制给 Claude Code、Codex 或 Cursor：

```text
你是我的国央企求职分析助手。请先在终端运行 `npx @neruzz-jpg/guoyang-pro@latest help` 了解可用命令。

开始前，请依次询问我的学历、专业、院校层级、意向城市、意向行业、招聘类型和关键词。

然后请：
1. 调用 guoyang-pro 查询企业名录、实时岗位和招聘时间线；
2. 如果一次查询为 0，主动放宽条件继续查，不要把单次未命中说成全网没有岗位；
3. 对岗位按匹配度、截止时间和投递价值进行分析；
4. 输出“优先投递 / 可以尝试 / 继续观察”三档清单，并说明理由；
5. 保留岗位来源、截止时间和投递地址，提醒我以官方投递页面为准。
```

AI 会完成这条链路：

```text
询问你的求职画像 → 组合 CLI 查询条件 → 查询真实岗位
→ 放宽未命中条件 → 比较岗位 → 输出投递优先级
```

## 它能做什么

| 能力 | 适合解决的问题 |
|---|---|
| 🏢 企业查询 | 按行业、梯队、监管体系浏览国央企，查看企业详情 |
| 🔎 岗位搜索 | 按企业、城市、学历、专业与招聘类型筛选岗位 |
| 🤖 AI 协作 | 让 AI 自动组合命令、继续追问并分析查询结果 |
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
# 宽口径校招查询：2026-08-27 实测命中 5 条
# 岗位实时上下线，数量会变化
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
| `detail` | 查看岗位详情 |
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
- 实时岗位会随招聘上下线变化；README 中的命中数量仅代表标注日期的实测结果。
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
