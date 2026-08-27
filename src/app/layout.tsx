import type { Metadata } from "next";
import { SITE_URL } from "../lib/site";
import "./marketing.css";

export const metadata: Metadata = {
  title: "国央企 Pro — 企业、岗位与求职规划 CLI",
  description:
    "面向国央企求职场景的命令行助手：企业查询、岗位搜索、招聘日历、智能匹配与投递规划。",
  metadataBase: new URL(SITE_URL),
  openGraph: {
    title: "国央企 Pro · 一条命令找到值得投的机会",
    description: "企业名录、岗位搜索、招聘日历、智能匹配与求职规划。",
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
