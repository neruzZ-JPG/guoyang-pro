import type { Metadata } from "next";
import { SITE_URL } from "../lib/site";
import "./marketing.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "国企央企招聘求职助手｜AI 岗位筛选与投递规划 - 国央企 Pro",
    template: "%s - 国央企 Pro",
  },
  description:
    "面向国企、央企校招与社招的 AI 求职助手。按专业、城市和求职偏好寻找岗位，比较任职要求，整理投递优先级、截止时间与官方入口。",
  applicationName: "国央企 Pro",
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "zh_CN",
    siteName: "国央企 Pro",
    title: "国企央企招聘求职助手｜AI 帮你筛选岗位",
    description: "说出专业、城市和求职偏好，AI 帮你寻找机会、比较要求并整理投递清单。",
    url: SITE_URL,
    images: [
      {
        url: "/og-image.jpg",
        width: 1425,
        height: 891,
        alt: "国央企 Pro：AI 国企央企招聘求职助手",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "国企央企招聘求职助手｜国央企 Pro",
    description: "AI 帮你寻找国企央企岗位、比较要求并排好投递优先级。",
    images: ["/og-image.jpg"],
  },
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
  },
  manifest: "/manifest.webmanifest",
  category: "career",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
