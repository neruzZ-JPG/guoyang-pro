"use client";

import {
  ArrowRight,
  Bot,
  Check,
  Copy,
  Database,
  ExternalLink,
  Globe2,
  Github,
  RadioTower,
  Target,
  Terminal,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";

const PACKAGE_NAME = "@neruzz-jpg/guoyang-pro";
const REPOSITORY_URL = "https://github.com/neruzZ-JPG/guoyang-pro";
const INSTALL_COMMAND = `npx ${PACKAGE_NAME}@latest help`;
const DEMO_COMMAND = "guoyang-pro search --enterprise 华润集团 --limit 5";

const PROMPT = `请先运行 \`${INSTALL_COMMAND}\` 了解命令，然后帮我规划国央企求职。

请先询问我的学历、专业、院校层级、意向城市、意向行业和招聘类型；
再查询企业名录、实时岗位与招聘时间线，给出可执行的投递清单。

请保留岗位来源，并提醒我以最终投递页面为准。`;

const FEATURES: Array<{
  icon: LucideIcon;
  title: string;
  description: string;
  bullets: string[];
}> = [
  {
    icon: Database,
    title: "企业名录",
    description: "集中浏览国央企信息，快速建立目标企业池。",
    bullets: ["158+ 家参考企业", "行业与梯队筛选", "企业详情与关联岗位"],
  },
  {
    icon: RadioTower,
    title: "实时岗位",
    description: "按需查询公开招聘信息，减少在多个页面间反复搜索。",
    bullets: ["多来源聚合", "投递入口与截止时间", "来源状态可核验"],
  },
  {
    icon: Target,
    title: "智能匹配",
    description: "把个人偏好转成筛选条件，辅助安排投递优先级。",
    bullets: ["学历与专业条件", "城市与行业偏好", "冲 / 稳 / 保参考"],
  },
];

const FLOW = [
  {
    icon: Globe2,
    title: "数据来源",
    meta: "公开招聘信息",
    signal: "Online",
  },
  {
    icon: Terminal,
    title: "guoyang-pro",
    meta: "标准化命令输出",
    signal: "stdout",
  },
  {
    icon: Bot,
    title: "AI 助手",
    meta: "Claude Code · Codex · Cursor",
    signal: "data",
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
            <a href="#features">特性</a>
            <a href="#workflow">工作流</a>
            <a href="#demo">示例</a>
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
              <span>央国企求职助手</span>
              <span aria-hidden="true" />
              <span>Terminal Product</span>
            </p>
            <h1 id="hero-title">
              一条命令，
              <br /><em>看见更多机会</em>
            </h1>
            <p className="gp-hero-description">
              面向国央企求职的命令行工具。
              <br />企业名录、实时岗位、智能匹配、招聘日历，
              <br />让信息检索回归高效与专注。
            </p>
            <div className="gp-command-strip" aria-label="运行命令">
              <code>
                <span>$</span> {INSTALL_COMMAND}
              </code>
              <CopyButton value={INSTALL_COMMAND} compact />
            </div>
          </div>

          <div className="gp-terminal" aria-label="命令行使用示例">
            <div className="gp-terminal-bar">
              <span className="gp-terminal-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span>guoyang-pro — zsh</span>
              <span />
            </div>
            <div className="gp-terminal-body">
              <p className="gp-terminal-ready">✓ 数据源就绪</p>
              <div className="gp-source-row">
                <span><i /> 国聘网</span>
                <b>实时</b>
              </div>
              <div className="gp-source-row">
                <span><i /> 国家大学生就业服务平台</span>
                <b>实时</b>
              </div>
              <div className="gp-terminal-rule" />
              <p className="gp-terminal-command">
                <span>$</span> guoyang-pro search
                <br /><em>--enterprise 华润集团 --limit 5</em>
              </p>
              <p className="gp-terminal-found">找到 5 个岗位</p>
              <div className="gp-terminal-result">
                <span>01</span>
                <div><strong>投资分析岗</strong><small>深圳 · 硕士 · 校园招聘</small></div>
              </div>
              <div className="gp-terminal-result">
                <span>02</span>
                <div><strong>数字化运营岗</strong><small>北京 · 本科及以上 · 校园招聘</small></div>
              </div>
              <p className="gp-terminal-note">结果附带来源与投递地址 · 以官方页面为准</p>
            </div>
          </div>
        </section>

        <section className="gp-section gp-container" id="features" aria-labelledby="features-title">
          <div className="gp-section-heading">
            <p className="gp-kicker">核心能力</p>
            <h2 id="features-title">为求职决策而生</h2>
            <p>从企业筛选到岗位核验，用更少的操作获得更清晰的结果。</p>
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
            <p className="gp-kicker">工作流</p>
            <h2 id="workflow-title">数据进来，决策出去</h2>
            <p>公开招聘信息经过标准化处理，再交给你熟悉的 AI 助手继续分析。</p>
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
              <p className="gp-code-status">✓ 查询完成 · 5 个结果 · 来源可核验</p>
              <div className="gp-code-table">
                <div className="gp-code-head"><span>岗位</span><span>地点</span><span>学历</span></div>
                <div><strong>投资分析岗</strong><span>深圳</span><span>硕士</span></div>
                <div><strong>数字化运营岗</strong><span>北京</span><span>本科+</span></div>
                <div><strong>财务管理岗</strong><span>上海</span><span>本科+</span></div>
              </div>
              <div className="gp-code-footer">
                <span><i /> complete</span>
                <CopyButton value={DEMO_COMMAND} label="复制命令" />
              </div>
            </div>
          </div>
          <div className="gp-demo-copy">
            <p className="gp-kicker">实际演示</p>
            <h2 id="demo-title">从命令到结果，<br />只需几秒</h2>
            <p>按照企业、行业、城市、学历与招聘类型组合筛选。输出保留来源和投递信息，方便继续核验与行动。</p>
            <ul>
              <li><Check size={15} /> 条件可组合</li>
              <li><Check size={15} /> 结果可核验</li>
              <li><Check size={15} /> 可直接交给 AI 助手</li>
            </ul>
            <a href={REPOSITORY_URL} target="_blank" rel="noreferrer">
              查看完整文档 <ExternalLink size={14} />
            </a>
          </div>
        </section>

        <section className="gp-cta gp-container" aria-labelledby="cta-title">
          <div>
            <p className="gp-kicker gp-kicker-light">开始使用</p>
            <h2 id="cta-title">让终端成为你的求职助手</h2>
            <p>复制一段提示词，在 Claude Code、Codex 或 Cursor 中开始规划。</p>
          </div>
          <CopyButton value={PROMPT} label="复制提示词" />
        </section>
      </main>

      <footer className="gp-footer">
        <div className="gp-container gp-footer-main">
          <div>
            <a className="gp-wordmark" href="#top">国央企 <em>Pro</em></a>
            <p>企业名录 · 实时岗位 · 智能匹配</p>
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
