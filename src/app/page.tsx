"use client";

import {
  ArrowRight,
  Bot,
  Check,
  Copy,
  ExternalLink,
  Github,
  MessageSquareText,
  RadioTower,
  Sparkles,
  Target,
  Terminal,
  UserRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";

const PACKAGE_NAME = "@neruzz-jpg/guoyang-pro";
const REPOSITORY_URL = "https://github.com/neruzZ-JPG/guoyang-pro";
const INSTALL_COMMAND = `npx ${PACKAGE_NAME}@latest help`;
const DEMO_COMMAND = `npx ${PACKAGE_NAME}@latest search --type 校招 --limit 5`;

const PROMPT = `你是我的国央企求职分析助手。请先在终端运行 \`${INSTALL_COMMAND}\` 了解可用命令。

开始前，请依次询问我的学历、专业、院校层级、意向城市、意向行业、招聘类型和关键词。

然后请：
1. 调用 guoyang-pro 查询企业名录、实时岗位和招聘时间线；
2. 如果一次查询为 0，主动放宽条件继续查，不要把单次未命中说成全网没有岗位；
3. 对岗位按匹配度、截止时间和投递价值进行分析；
4. 输出“优先投递 / 可以尝试 / 继续观察”三档清单，并说明理由；
5. 保留岗位来源、截止时间和投递地址，提醒我以官方投递页面为准。`;

const FEATURES: Array<{
  icon: LucideIcon;
  title: string;
  description: string;
  bullets: string[];
}> = [
  {
    icon: MessageSquareText,
    title: "一段提示词开始",
    description: "不需要记住参数。把提示词交给 AI，它会先询问你的背景和求职偏好。",
    bullets: ["自动收集个人画像", "自动拆解求职目标", "适配 Claude Code / Codex / Cursor"],
  },
  {
    icon: RadioTower,
    title: "AI 自动查询",
    description: "AI 根据你的回答组合 CLI 参数，查询企业、实时岗位与招聘节奏。",
    bullets: ["自动调用 guoyang-pro", "零结果时主动放宽条件", "保留来源和投递入口"],
  },
  {
    icon: Target,
    title: "输出投递计划",
    description: "AI 不只罗列岗位，还会比较条件、解释理由并整理下一步行动。",
    bullets: ["优先投递 / 可以尝试 / 继续观察", "匹配理由与风险提示", "可继续追问和调整"],
  },
];

const FLOW = [
  {
    icon: UserRound,
    title: "告诉 AI 你的需求",
    meta: "学历 · 专业 · 城市 · 行业",
    signal: "Prompt",
  },
  {
    icon: Terminal,
    title: "AI 调用 guoyang-pro",
    meta: "查询企业、岗位与日历",
    signal: "Run",
  },
  {
    icon: Bot,
    title: "得到投递分析",
    meta: "优先级、理由与下一步",
    signal: "Plan",
  },
];

function CopyButton({
  value,
  label = "复制",
  compact = false,
}: {
  value: string;
  label?: string;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    let succeeded = false;

    try {
      await navigator.clipboard.writeText(value);
      succeeded = true;
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      succeeded = document.execCommand("copy");
      textarea.remove();
    }

    if (succeeded) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  }

  return (
    <button
      className={compact ? "copy-button copy-button-compact" : "copy-button"}
      onClick={handleCopy}
      type="button"
      aria-label={copied ? "已复制" : label}
    >
      {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
      {!compact && <span>{copied ? "已复制" : label}</span>}
    </button>
  );
}

export default function Home() {
  return (
    <div className="gp-shell" id="top">
      <header className="gp-header">
        <div className="gp-container gp-nav">
          <a className="gp-wordmark" href="#top" aria-label="国央企 Pro 首页">
            国央企 <em>Pro</em>
          </a>
          <nav className="gp-nav-links" aria-label="主要导航">
            <a href="#ai">AI 使用</a>
            <a href="#workflow">工作流</a>
            <a href="#demo">真实示例</a>
          </nav>
          <a className="gp-github" href={REPOSITORY_URL} target="_blank" rel="noreferrer">
            <Github size={16} aria-hidden="true" />
            <span>GitHub</span>
          </a>
        </div>
      </header>

      <main>
        <section className="gp-container gp-hero" aria-labelledby="hero-title">
          <div className="gp-hero-copy">
            <p className="gp-eyebrow">
              <span>AI × 国央企求职</span>
              <span aria-hidden="true" />
              <span>Prompt First</span>
            </p>
            <h1 id="hero-title">
              把提示词给 AI，
              <br /><em>让它替你查与分析</em>
            </h1>
            <p className="gp-hero-description">
              复制一段提示词给 Claude Code、Codex 或 Cursor。
              <br />AI 会询问你的求职画像，调用 guoyang-pro 查询真实岗位，
              <br />再帮你比较机会、解释理由并整理投递计划。
            </p>
            <div className="gp-hero-actions">
              <CopyButton value={PROMPT} label="复制提示词给 AI" />
              <a href="#demo">查看真实查询 <ArrowRight size={15} /></a>
            </div>
            <div className="gp-command-strip" aria-label="无需 AI 时的运行命令">
              <span>也可以直接运行</span>
              <code>{INSTALL_COMMAND}</code>
              <CopyButton value={INSTALL_COMMAND} compact />
            </div>
          </div>

          <div className="gp-terminal gp-ai-terminal" aria-label="AI 使用示例">
            <div className="gp-terminal-bar">
              <span className="gp-terminal-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span>AI 求职助手</span>
              <span />
            </div>
            <div className="gp-terminal-body">
              <div className="gp-ai-message">
                <span>YOU</span>
                <p>帮我规划国央企求职，筛选适合我的岗位。</p>
              </div>
              <div className="gp-ai-message gp-ai-message-assistant">
                <span>AI</span>
                <p>先告诉我你的学历、专业、城市偏好和校招 / 社招意向。</p>
              </div>
              <div className="gp-terminal-rule" />
              <p className="gp-terminal-ready">AI 正在调用 CLI</p>
              <p className="gp-terminal-command">
                <span>$</span> {DEMO_COMMAND}
              </p>
              <p className="gp-terminal-found">2026-08-27 实测命中 5 条 · 实时结果会变化</p>
              <div className="gp-ai-summary">
                <span>AI</span>
                <div>
                  <strong>已找到可进一步分析的校招岗位</strong>
                  <small>下一步：结合你的画像排序，并输出投递清单。</small>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="gp-section gp-container" id="ai" aria-labelledby="features-title">
          <div className="gp-section-heading">
            <p className="gp-kicker">AI 使用方式</p>
            <h2 id="features-title">你描述目标，AI 完成查询与分析</h2>
            <p>guoyang-pro 提供可靠的查询能力，AI 负责理解你的需求并把结果变成行动建议。</p>
          </div>
          <div className="gp-feature-grid">
            {FEATURES.map(({ icon: Icon, title, description, bullets }) => (
              <article className="gp-feature-card" key={title}>
                <div className="gp-feature-icon"><Icon size={23} strokeWidth={1.55} aria-hidden="true" /></div>
                <h3>{title}</h3>
                <p>{description}</p>
                <ul>
                  {bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="gp-section gp-workflow gp-container" id="workflow" aria-labelledby="workflow-title">
          <div className="gp-section-heading">
            <p className="gp-kicker">三步工作流</p>
            <h2 id="workflow-title">从一句话，到一份投递计划</h2>
            <p>不需要先研究 CLI 参数。AI 会根据你的回答选择命令、查询数据并继续追问。</p>
          </div>
          <div className="gp-flow">
            {FLOW.map(({ icon: Icon, title, meta, signal }, index) => (
              <div className="gp-flow-item" key={title}>
                <article className={index === 1 ? "gp-flow-card gp-flow-card-dark" : "gp-flow-card"}>
                  <Icon size={22} strokeWidth={1.5} aria-hidden="true" />
                  <h3>{title}</h3>
                  <p>{meta}</p>
                  <span><i /> {signal}</span>
                </article>
                {index < FLOW.length - 1 && (
                  <div className="gp-flow-arrow" aria-hidden="true">
                    <span />
                    <ArrowRight size={16} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="gp-section gp-demo gp-container" id="demo" aria-labelledby="demo-title">
          <div className="gp-code-window" aria-label="搜索命令输出示例">
            <div className="gp-code-bar">
              <span className="gp-terminal-dots" aria-hidden="true"><i /><i /><i /></span>
              <span>search — guoyang-pro</span>
              <span />
            </div>
            <div className="gp-code-body">
              <p className="gp-code-command"><span>$</span> {DEMO_COMMAND}</p>
              <p className="gp-code-status">✓ 2026-08-27 实测 · 命中 5 条 · 实时 / 部分覆盖</p>
              <div className="gp-code-table">
                <div className="gp-code-head"><span>岗位</span><span>地点</span><span>来源</span></div>
                <div><strong>测试技术开发工程师</strong><span>深圳</span><span>招商银行</span></div>
                <div><strong>测试技术开发工程师</strong><span>杭州</span><span>招商银行</span></div>
                <div><strong>后端开发工程师</strong><span>深圳</span><span>招商银行</span></div>
              </div>
              <div className="gp-code-footer">
                <span><i /> 实时岗位会随招聘上下线变化</span>
                <CopyButton value={DEMO_COMMAND} label="复制命令" />
              </div>
            </div>
          </div>
          <div className="gp-demo-copy">
            <p className="gp-kicker">真实查询</p>
            <h2 id="demo-title">示例不是摆设，<br />命令可以直接运行</h2>
            <p>这条宽口径校招查询已在 2026-08-27 实测命中。岗位会随招聘上下线变化，因此页面展示实测日期，而不承诺固定数量。</p>
            <ul>
              <li><Check size={15} /> 使用已发布的 npm 包</li>
              <li><Check size={15} /> 返回真实岗位与官方投递链接</li>
              <li><Check size={15} /> AI 可继续筛选、比较与归纳</li>
            </ul>
            <a href={REPOSITORY_URL} target="_blank" rel="noreferrer">
              查看完整文档 <ExternalLink size={14} />
            </a>
          </div>
        </section>

        <section className="gp-cta gp-container" aria-labelledby="cta-title">
          <div>
            <p className="gp-kicker gp-kicker-light">推荐使用方式</p>
            <h2 id="cta-title">把提示词给 AI，剩下的让它来做</h2>
            <p>AI 会主动询问、调用 CLI、核验来源，并整理成可执行的投递计划。</p>
          </div>
          <CopyButton value={PROMPT} label="复制完整提示词" />
        </section>
      </main>

      <footer className="gp-footer">
        <div className="gp-container gp-footer-main">
          <div>
            <a className="gp-wordmark" href="#top">国央企 <em>Pro</em></a>
            <p>给 AI 一段提示词，让它帮你查岗位、做分析。</p>
          </div>
          <nav aria-label="页脚导航">
            <a href={`${REPOSITORY_URL}#快速开始`} target="_blank" rel="noreferrer">文档</a>
            <a href={`${REPOSITORY_URL}#使用提示`} target="_blank" rel="noreferrer">数据说明</a>
            <a href={REPOSITORY_URL} target="_blank" rel="noreferrer">GitHub</a>
          </nav>
        </div>
        <div className="gp-container gp-footer-bottom">
          <span>© 2026 国央企 Pro</span>
          <span>MIT License</span>
          <span>Node.js ≥ 18</span>
          <span>岗位信息请以最终投递页面为准</span>
        </div>
      </footer>
    </div>
  );
}
