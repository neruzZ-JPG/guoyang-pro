# 国央企 Pro

把提示词给 AI，让它帮你查岗位、做分析。也可以直接使用 CLI 完成企业查询、岗位搜索、招聘日历与求职规划。

## 推荐：交给 AI 使用

将下面内容复制给 Claude Code、Codex 或 Cursor：

```text
你是我的国央企求职分析助手。请先运行 `npx @neruzz-jpg/guoyang-pro@latest help` 了解可用命令。

请询问我的学历、专业、院校层级、意向城市、意向行业、招聘类型和关键词；
然后调用 guoyang-pro 查询真实岗位。如果一次查询为 0，请主动放宽条件继续查。
最后输出“优先投递 / 可以尝试 / 继续观察”三档清单，并保留来源、截止时间和投递地址。
```

## 快速开始

```bash
npx @neruzz-jpg/guoyang-pro@latest help
```

或全局安装：

```bash
npm install -g @neruzz-jpg/guoyang-pro
guoyang-pro help
```

需要 Node.js 18 或更高版本。

## 常用命令

```bash
# 浏览企业
guoyang-pro enterprises --sector 金融银行
guoyang-pro enterprise 国家电网

# 搜索岗位
# 2026-08-27 实测命中；实时数量会变化
guoyang-pro search --type 校招 --limit 5

# 匹配与规划
guoyang-pro match --sector 电信运营 --keywords 数据,算法
guoyang-pro recommend --education 本科 --school-tier 211 --sector 金融银行

# 招聘节奏与趋势
guoyang-pro calendar
guoyang-pro hot --by sector
guoyang-pro stats
```

## 使用提示

- 查询结果保留来源信息，重要条件请回到最终投递页面核验。
- 零结果只代表当前查询范围未命中，不代表所有渠道均无岗位。
- 实时岗位会随招聘上下线变化，示例中的命中数量不是固定承诺。
- 企业梯队、匹配度和冲稳保属于求职参考，不代表官方评级或录取结论。

项目主页：[github.com/neruzZ-JPG/guoyang-pro](https://github.com/neruzZ-JPG/guoyang-pro)
