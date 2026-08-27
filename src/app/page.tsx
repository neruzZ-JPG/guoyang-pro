"use client";

import { useState } from "react";

const PACKAGE_NAME = "@neruzz-jpg/guoyang-pro";
const REPOSITORY_URL = "https://github.com/neruzZ-JPG/guoyang-pro";
const NPM_URL = "https://www.npmjs.com/package/@neruzz-jpg/guoyang-pro";

const PROMPT = `跑 \`npx ${PACKAGE_NAME}@latest help\` 把命令摸清楚，帮我规划国央企求职。

先问我：学历、专业、院校层级(985/211/双一流/普通本科)、政治面貌、
意向城市、意向行业(电力/油气/金融/通信/烟草...)、校招还是社招。
然后用 CLI 查企业名录、实时岗位、来源状态与招聘时间线。
不要把“当前扫描窗口未命中”说成“全网没有岗位”；提醒我核验投递页、
用工性质与薪资口径。`;

type Status = "live" | "building" | "none";
type DataRow = { name: string; nature: string; route: Status; routeText: string };

const DATA: DataRow[] = [
  { name: "央企名录 / 梯队", nature: "慢变参考", route: "live", routeText: "随包静态" },
  { name: "行业分类", nature: "慢变参考", route: "live", routeText: "随包静态" },
  { name: "招聘日历", nature: "慢变参考", route: "live", routeText: "随包静态" },
  { name: "在招岗位", nature: "每天开/关", route: "live", routeText: "多源实时扫描" },
  { name: "投递截止日", nature: "每天开/关", route: "live", routeText: "来源字段" },
];

const ARCH = [
  {
    kind: "静态层（随包发布）",
    items: ["央企/地方国企名录", "第一/二/三梯队分级", "行业分类", "年度招聘日历"],
    note: "慢变参考数据，版本化打进 npm 包，装好即查、离线可用——这是产品的护城河。",
  },
  {
    kind: "实时层（运行时拉源）",
    items: ["国聘 / 24365", "子公司归一化", "来源与抓取时间", "24 小时降级缓存"],
    note: "按扫描窗口实时拉取并披露 scanned / complete / degraded；未扫到底时，不把零命中解释为全源无岗位。",
  },
];

const PROJECT_LINKS = [
  { name: "GitHub 仓库", href: REPOSITORY_URL, desc: "neruzZ-JPG/guoyang-pro" },
  { name: "npm 包", href: NPM_URL, desc: PACKAGE_NAME },
];

function RouteBadge({ status, text }: { status: Status; text: string }) {
  const color =
    status === "live"
      ? "var(--success)"
      : status === "building"
        ? "var(--warning)"
        : "var(--muted-foreground)";
  return <span style={{ color }}>{text}</span>;
}

export default function Home() {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(PROMPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <main className="page">
      {/* Hero */}
      <h1 className="brand">国央企 Pro</h1>
      <p className="lede">$ npx {PACKAGE_NAME}@latest help</p>
      <p className="tagline">
        国央企招聘，<strong>静态的随包带走，在招的实时拉取</strong>。名录、梯队、招聘日历
        这些慢变数据打进包里，装好即查、离线可用；而「在招岗位」像大厂一样每天开/关——
        所以运行时扫描国聘、24365 等公开源，并显示来源、抓取时间与覆盖边界；
        网络失败时只回退到 24 小时内缓存。
      </p>

      {/* Prompt Card */}
      <div className="prompt-card">
        <div className="prompt-header">
          <span>复制到 Claude Code / Codex / Cursor</span>
          <button className="copy-btn" onClick={handleCopy}>
            {copied ? "✓ 已复制" : "⧉ 复制"}
          </button>
        </div>
        <div className="prompt-body">{PROMPT}</div>
      </div>

      {/* Hybrid Architecture */}
      <p className="section-label">Hybrid Architecture · 混合架构</p>
      <div className="arch-grid">
        {ARCH.map((a) => (
          <div className="arch-card" key={a.kind}>
            <div className="arch-kind">{a.kind}</div>
            <ul className="arch-list">
              {a.items.map((it) => (
                <li key={it}>{it}</li>
              ))}
            </ul>
            <p className="arch-note">{a.note}</p>
          </div>
        ))}
      </div>

      {/* Data Routing */}
      <p className="section-label">Data Routing</p>
      <table className="status-table">
        <thead>
          <tr>
            <th>数据</th>
            <th>性质</th>
            <th>路线</th>
          </tr>
        </thead>
        <tbody>
          {DATA.map((d) => (
            <tr key={d.name}>
              <td>{d.name}</td>
              <td>{d.nature}</td>
              <td>
                <RouteBadge status={d.route} text={d.routeText} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Install */}
      <p className="section-label">Install</p>
      <pre className="code-block">npx {PACKAGE_NAME}@latest help</pre>

      {/* Project links */}
      <p className="section-label">项目入口</p>
      <div className="siblings">
        {PROJECT_LINKS.map((link) => (
          <a className="sibling" key={link.href} href={link.href}>
            <span>
              <span className="sibling-name">{link.name}</span>
              <span className="sibling-desc">{link.desc}</span>
            </span>
            <span className="sibling-arrow">↗</span>
          </a>
        ))}
      </div>

      {/* Footer */}
      <footer className="footer">
        <a href={REPOSITORY_URL}>GitHub</a>
        <span style={{ margin: "0 0.5rem" }}>&middot;</span>
        <a href={NPM_URL}>npm</a>
        <span style={{ margin: "0 0.5rem" }}>&middot;</span>
        <a href="https://github.com/neruzZ-JPG">维护者：neruzZ-JPG</a>
      </footer>
    </main>
  );
}
