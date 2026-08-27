import type { Metadata } from "next";
import { SITE_URL } from "../lib/site";
import "./globals.css";

export const metadata: Metadata = {
  title: "guoyang-pro — 用 Claude Code 规划你的国央企求职",
  description:
    "国央企求职 CLI。158 家参考名录离线可查，实时扫描国聘与 24365，披露来源、抓取时间、扫描边界和降级状态。",
  metadataBase: new URL(SITE_URL),
  openGraph: {
    title: "guoyang-pro · 国央企 PRO",
    description: "可溯源名录、多源实时岗位、子公司归一化与覆盖状态披露",
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
