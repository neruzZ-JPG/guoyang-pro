# 国央企 Pro

找到适合你的岗位，知道下一份该投哪里。可以交给 AI 使用，也可以直接查询企业、岗位与招聘日历。

## 推荐：交给 AI 使用

将下面内容复制给 Claude Code、Codex 或 Cursor：

```text
你是我的国央企求职助手。请使用 `npx @neruzz-jpg/guoyang-pro@latest help` 提供的能力帮我规划求职。

请询问我的学历、专业、院校层级、意向城市、意向行业、招聘类型和关键词；
然后帮我寻找和分析岗位。如果暂时没有合适结果，请调整条件继续寻找。
最后输出“优先投递 / 可以尝试 / 继续观察”三档清单，并告诉我理由、截止时间和投递入口。
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
# 查看当前校招机会
guoyang-pro search --type 校招 --limit 5

# 国聘岗位即使未进入最近搜索缓存，也可按 ID 实时核验详情
guoyang-pro detail --id 195024114728046183
guoyang-pro detail --id iguopin:195024114728046183

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
- 国聘搜索会优先把企业名称和可识别城市下推到上游，再在本地复核专业、关键词等条件，降低固定扫描窗口漏检。
- `detail --id` 在缓存和离线快照未命中时，会向支持该来源的公开详情接口实时查询；目前支持国聘岗位 ID。
- 岗位会随招聘上下线变化，建议定期重新查询。
- 企业梯队、匹配度和冲稳保属于求职参考，不代表官方评级或录取结论。

项目主页：[github.com/neruzZ-JPG/guoyang-pro](https://github.com/neruzZ-JPG/guoyang-pro)
