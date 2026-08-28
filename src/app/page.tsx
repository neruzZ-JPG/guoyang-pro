import {
  ArrowRight,
  Check,
  ExternalLink,
  Github,
} from "lucide-react";
import { CopyButton } from "../components/copy-button";
import {
  AI_PROMPT,
  DEMO_COMMAND,
  FAQS,
  FEATURES,
  FLOW,
  NAV_ITEMS,
  PLAN_ROWS,
  PRODUCT_STATS,
  REPOSITORY_URL,
} from "./content";
import { SITE_URL } from "../lib/site";

export default function Home() {
  const softwareJsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "国央企 Pro",
    alternateName: "guoyang-pro",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Windows, macOS, Linux",
    inLanguage: "zh-CN",
    url: SITE_URL,
    downloadUrl: "https://www.npmjs.com/package/@neruzz-jpg/guoyang-pro",
    softwareVersion: "0.2.0",
    license: "https://opensource.org/license/mit",
    description:
      "面向国企、央企校招与社招的 AI 求职助手，帮助寻找岗位、比较要求并整理投递优先级。",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "CNY",
    },
    featureList: [
      "国企央企企业查询",
      "校招、社招与实习岗位搜索",
      "岗位匹配与投递优先级",
      "招聘日历与截止时间",
      "官方来源与投递入口",
    ],
  };

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map(({ question, answer }) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: {
        "@type": "Answer",
        text: answer,
      },
    })),
  };

  return (
    <div className="gp-shell" id="top">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <header className="gp-header">
        <div className="gp-container gp-nav">
          <a className="gp-wordmark" href="#top" aria-label="国央企 Pro 首页">
            国央企 <em>Pro</em>
          </a>
          <nav className="gp-nav-links" aria-label="主要导航">
            {NAV_ITEMS.map(({ label, href }) => (
              <a href={href} key={href}>{label}</a>
            ))}
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
              <span>你的国央企求职助手</span>
              <span aria-hidden="true" />
              <span>为你筛选机会</span>
            </p>
            <h1 id="hero-title">
              一条命令，
              <br /><em>看见更多国央企机会</em>
            </h1>
            <p className="gp-hero-description">
              面向国央企求职的命令行工具。
              <br />企业名录、实时岗位、智能匹配、招聘日历，
              <br />让信息检索回归高效与专注。
            </p>
            <div className="gp-hero-actions">
              <CopyButton value={AI_PROMPT} label="复制提示词给 AI" />
              <a href="#demo">查看实际演示 <ArrowRight size={15} /></a>
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
                <span><i /> 中国移动官方招聘</span>
                <b>在线</b>
              </div>
              <div className="gp-source-row">
                <span><i /> 招商银行官方招聘</span>
                <b>在线</b>
              </div>
              <div className="gp-terminal-rule" />
              <p className="gp-terminal-command">
                <span>$</span> guoyang-pro search
                <br /><em>--type 校招 --limit 5</em>
              </p>
              <p className="gp-terminal-found">找到 5 个岗位</p>
              <div className="gp-terminal-result">
                <span>01</span>
                <div>
                  <strong>测试技术开发工程师</strong>
                  <small>深圳 · 校园招聘 · 招商银行</small>
                </div>
              </div>
              <div className="gp-terminal-result">
                <span>02</span>
                <div>
                  <strong>后端开发工程师</strong>
                  <small>深圳 · 校园招聘 · 招商银行</small>
                </div>
              </div>
              <p className="gp-terminal-note">结果包含来源与投递入口 · 以官方页面为准</p>
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
            <h2 id="workflow-title">信息进来，机会出去</h2>
            <p>静态名录、实时岗位与 AI 分析各司其职，组成完整的求职信息流。</p>
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
              <span>你的投递清单</span>
              <span />
            </div>
            <div className="gp-code-body">
              <p className="gp-code-command"><span>$</span> {DEMO_COMMAND}</p>
              <p className="gp-code-status">✓ 查询完成 · 返回真实岗位与官方投递入口</p>
              <div className="gp-code-table">
                <div className="gp-code-head"><span>岗位</span><span>地点</span><span>来源</span></div>
                {PLAN_ROWS.map(({ title, recommendation, reason, priority }) => (
                  <div key={`${title}-${recommendation}`}>
                    <strong>{title}</strong>
                    <span className={priority ? "gp-plan-priority" : undefined}>{recommendation}</span>
                    <span>{reason}</span>
                  </div>
                ))}
              </div>
              <div className="gp-code-footer">
                <span><i /> 岗位会随招聘上下线变化</span>
                <CopyButton value={DEMO_COMMAND} label="复制命令" />
              </div>
            </div>
          </div>
          <div className="gp-demo-copy">
            <p className="gp-kicker">实际演示</p>
            <h2 id="demo-title">从命令到结果，<br />只需几秒</h2>
            <p>按照企业、行业、城市、学历与招聘类型组合筛选，结果保留来源与投递信息，方便继续核验和行动。</p>
            <ul>
              <li><Check size={15} /> 条件可组合</li>
              <li><Check size={15} /> 结果可核验</li>
              <li><Check size={15} /> 可交给 AI 继续分析</li>
            </ul>
            <a href={REPOSITORY_URL} target="_blank" rel="noreferrer">
              查看完整文档 <ExternalLink size={14} />
            </a>
          </div>
        </section>

        <section className="gp-stats gp-container" aria-label="产品数据">
          {PRODUCT_STATS.map(({ value, label }) => (
            <div key={label}>
              <strong>{value}</strong>
              <span>{label}</span>
            </div>
          ))}
        </section>

        <section className="gp-cta gp-container" aria-labelledby="cta-title">
          <div>
            <p className="gp-kicker gp-kicker-light">开始使用</p>
            <h2 id="cta-title">让终端成为你的求职助手</h2>
            <p>复制一段提示词，在 Claude Code、Codex 或 Cursor 中开始规划。</p>
          </div>
          <CopyButton value={AI_PROMPT} label="复制提示词" />
        </section>

        <section className="gp-section gp-faq gp-container" id="faq" aria-labelledby="faq-title">
          <div className="gp-section-heading">
            <p className="gp-kicker">常见问题</p>
            <h2 id="faq-title">第一次使用？这里有答案</h2>
            <p>国企央企校招、社招、岗位筛选和投递规划，都可以从一句话开始。</p>
          </div>
          <div className="gp-faq-list">
            {FAQS.map(({ question, answer }) => (
              <details key={question}>
                <summary>{question}</summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
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
          <span>岗位信息请以最终投递页面为准</span>
        </div>
      </footer>
    </div>
  );
}
