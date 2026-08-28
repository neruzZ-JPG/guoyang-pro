import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "国央企 Pro",
    short_name: "国央企 Pro",
    description: "AI 国企央企招聘求职助手：寻找岗位、比较要求、整理投递清单。",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f0e7",
    theme_color: "#1b1b19",
    lang: "zh-CN",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
