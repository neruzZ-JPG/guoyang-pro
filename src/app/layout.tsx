import type { Metadata } from "next";
import { SITE_URL } from "../lib/site";
import "./marketing.css";

export const metadata: Metadata = {
  title: "国央企 Pro — 把提示词给 AI，让它帮你查岗位",
  description:
    "把提示词交给 Claude Code、Codex 或 Cursor，让 AI 调用 guoyang-pro 查询真实岗位、比较机会并生成投递计划。",
  metadataBase: new URL(SITE_URL),
  openGraph: {
    title: "国央企 Pro · 把提示词给 AI，让它帮你查岗位",
    description: "AI 自动询问求职画像、调用 CLI 查询真实岗位，并整理可执行的投递清单。",
    url: SITE_URL,
  },
  keywords: [
    "国企招聘", "央企招聘", "国央企", "国聘", "校招", "社招",
    "guoyang-pro", "国央企 Pro", "CLI", "Claude Code",
    "央企名录", "混合架构", "npx @neruzz-jpg/guoyang-pro",
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Noto+Serif+SC:wght@400;700&family=Geist+Mono&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
