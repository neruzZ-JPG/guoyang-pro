const DEFAULT_SITE_URL = "https://guoyang-pro.vercel.app";

function withProtocol(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

export const SITE_URL = withProtocol(
  process.env.NEXT_PUBLIC_SITE_URL?.trim()
    || DEFAULT_SITE_URL,
).replace(/\/+$/, "");
