# 国央企 Pro

一条命令，看见更多机会。企业查询、岗位搜索、招聘日历、智能匹配与求职规划。

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
guoyang-pro search --sector 能源电力 --location 北京 --type 校招

# 匹配与规划
guoyang-pro match --sector 电信运营 --keywords 数据,算法
guoyang-pro recommend --education 本科 --school-tier 211 --sector 金融银行

# 招聘节奏与趋势
guoyang-pro calendar
guoyang-pro hot --by sector
guoyang-pro stats
```

## 配合 AI 助手

```text
请先运行 `npx @neruzz-jpg/guoyang-pro@latest help` 了解可用命令，然后帮我规划国央企求职。

请询问我的学历、专业、院校层级、意向城市、意向行业和招聘类型，
再使用 CLI 查询企业、岗位与招聘时间线，给出可执行的投递清单。
```

## 使用提示

- 查询结果保留来源信息，重要条件请回到最终投递页面核验。
- 零结果只代表当前查询范围未命中，不代表所有渠道均无岗位。
- 企业梯队、匹配度和冲稳保属于求职参考，不代表官方评级或录取结论。

项目主页：[github.com/neruzZ-JPG/guoyang-pro](https://github.com/neruzZ-JPG/guoyang-pro)
