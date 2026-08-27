<div align="center">

# 国央企 Pro

**一条命令，看见更多机会**

企业名录 · 岗位搜索 · 招聘日历 · 智能匹配 · 求职规划

面向国央企求职的命令行工具，让信息检索回归高效与专注。

[![npm version](https://img.shields.io/npm/v/@neruzz-jpg/guoyang-pro?color=18181b&label=npm)](https://www.npmjs.com/package/@neruzz-jpg/guoyang-pro)
[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A518-18181b)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-18181b.svg)](LICENSE)

```bash
npx @neruzz-jpg/guoyang-pro@latest help
```

[快速开始](#快速开始) · [常用场景](#常用场景) · [配合-ai-助手](#配合-ai-助手) · [命令一览](#命令一览)

</div>

![国央企 Pro 官网预览](docs/preview.jpg)

---

## 它能做什么

| 能力 | 适合解决的问题 |
|---|---|
| 🏢 企业查询 | 按行业、梯队、监管体系浏览国央企，查看企业详情 |
| 🔎 岗位搜索 | 按企业、城市、学历、专业与招聘类型筛选岗位 |
| 🎯 智能匹配 | 结合个人意向整理更值得关注的岗位与方向 |
| 📊 求职规划 | 生成冲 / 稳 / 保参考组合，辅助安排投递优先级 |
| 📅 招聘日历 | 查看典型招聘节奏，提前准备笔试、面试与投递 |
| 🔗 来源核验 | 查询结果保留来源信息，方便回到投递页面确认 |

## 快速开始

无需全局安装，直接运行：

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
# 北京 · 能源电力 · 校园招聘
guoyang-pro search \
  --sector 能源电力 \
  --location 北京 \
  --type 校招 \
  --limit 20

# 查看某家企业的相关岗位
guoyang-pro enterprise 国家电网 --limit 20
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

## 配合 AI 助手

将下面内容复制给 Claude Code、Codex 或 Cursor：

```text
请先运行 `npx @neruzz-jpg/guoyang-pro@latest help` 了解可用命令，然后帮我规划国央企求职。

请先询问我的学历、专业、院校层级、意向城市、意向行业和招聘类型，
再使用 CLI 查询企业、岗位与招聘时间线，给出可执行的投递清单。

请保留岗位来源，并提醒我以最终投递页面为准。
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
