import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "guoyang.pro — 用 Claude Code 规划你的国央企求职",
  description:
    "国央企求职工具(国企/央企)。名录 / 梯队 / 招聘日历随包静态发布、离线可查;在招岗位实时拉国聘等源——岗位像大厂一样每天开关,不预存。零依赖 CLI。",
  metadataBase: new URL("https://guoyang.ha7ch.com"),
  openGraph: {
    title: "guoyang.pro · 国央企 PRO",
    description: "名录/梯队/日历随包发布,在招岗位实时拉取——用 Claude Code 规划国央企求职",
    url: "https://guoyang.ha7ch.com",
  },
  keywords: [
    "国企招聘", "央企招聘", "国央企", "国聘", "校招", "社招",
    "guoyang-pro", "国央企 Pro", "CLI", "Claude Code",
    "央企名录", "混合架构", "npx @ha7ch/guoyang-pro",
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
