import {
  Bot,
  Building2,
  Database,
  MessageSquareText,
  RadioTower,
  Search,
  Sparkles,
  Target,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const PACKAGE_NAME = "@neruzz-jpg/guoyang-pro";
export const REPOSITORY_URL = "https://github.com/neruzZ-JPG/guoyang-pro";
export const INSTALL_COMMAND = `npx ${PACKAGE_NAME}@latest help`;
export const DEMO_COMMAND = `npx ${PACKAGE_NAME}@latest search --type 校招 --limit 5`;

export const AI_PROMPT = `请先运行 \`${INSTALL_COMMAND}\` 了解可用命令，然后帮我规划国央企求职。

开始前，请依次询问我的学历、专业、院校层级、意向城市、意向行业、招聘类型和关键词。

然后请：
1. 查询企业名录、在招岗位和招聘时间线；
2. 如果一次查询没有结果，适当放宽条件继续寻找；
3. 对岗位按匹配程度、截止时间和投递价值进行比较；
4. 输出“优先投递 / 可以尝试 / 继续观察”三档清单并说明理由；
5. 保留岗位来源、截止时间和投递入口，提醒我以官方页面为准。`;

export const NAV_ITEMS = [
  { label: "特性", href: "#features" },
  { label: "工作流", href: "#workflow" },
  { label: "示例", href: "#demo" },
];

export type Feature = {
  icon: LucideIcon;
  title: string;
  description: string;
  bullets: string[];
};

export const FEATURES: Feature[] = [
  {
    icon: Building2,
    title: "企业名录",
    description: "集中查看国央企信息，按行业与求职热度快速建立目标企业池。",
    bullets: ["158+ 家参考企业", "行业与梯队筛选", "企业详情与关联岗位"],
  },
  {
    icon: RadioTower,
    title: "实时岗位",
    description: "一处筛选校招、社招和实习机会，减少在多个招聘页面之间反复搜索。",
    bullets: ["多来源岗位查询", "地点与学历条件", "截止时间与投递入口"],
  },
  {
    icon: Sparkles,
    title: "智能匹配",
    description: "结合 AI 比较岗位要求与个人偏好，整理更清晰的投递优先级。",
    bullets: ["岗位匹配分析", "冲 / 稳 / 保参考", "可继续追问调整"],
  },
];

export type FlowStep = {
  icon: LucideIcon;
  title: string;
  meta: string;
  signal: string;
};

export const FLOW: FlowStep[] = [
  {
    icon: Database,
    title: "静态数据层",
    meta: "企业名录 · 招聘日历",
    signal: "离线可查",
  },
  {
    icon: Search,
    title: "实时岗位层",
    meta: "校招 · 社招 · 实习",
    signal: "按需查询",
  },
  {
    icon: Bot,
    title: "AI 分析层",
    meta: "匹配 · 比较 · 投递计划",
    signal: "继续追问",
  },
];

export const PLAN_ROWS = [
  {
    title: "测试技术开发工程师",
    recommendation: "深圳",
    reason: "招商银行",
    priority: true,
  },
  {
    title: "后端开发工程师",
    recommendation: "深圳",
    reason: "招商银行",
    priority: false,
  },
  {
    title: "测试技术开发工程师",
    recommendation: "杭州",
    reason: "招商银行",
    priority: false,
  },
];

export const PRODUCT_STATS = [
  { value: "158+", label: "参考企业" },
  { value: "4", label: "启用数据源" },
  { value: "18+", label: "筛选维度" },
];

export const FAQS = [
  {
    question: "国央企 Pro 能帮我做什么？",
    answer:
      "它可以根据你的学历、专业、城市和求职偏好，帮助寻找国企央企岗位、比较任职要求，并整理投递优先级、截止时间和官方入口。",
  },
  {
    question: "适合校招还是社招？",
    answer:
      "校招、社招和实习都可以使用。你只需要告诉 AI 当前身份和求职目标，它会据此调整岗位筛选条件。",
  },
  {
    question: "需要会写代码吗？",
    answer:
      "不需要。复制提示词给 Claude Code、Codex 或 Cursor，像聊天一样说明需求即可；AI 会完成后续查询与整理。",
  },
  {
    question: "岗位信息可以直接投递吗？",
    answer:
      "结果会尽量保留官方来源和投递入口。岗位状态、截止时间和资格条件请在最终投递页面再次确认。",
  },
];
