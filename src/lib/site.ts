const DEFAULT_LOCAL_URL = "http://localhost:3000";

function withProtocol(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

export const SITE_URL = withProtocol(
  process.env.NEXT_PUBLIC_SITE_URL?.trim()
    || process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
    || process.env.VERCEL_URL?.trim()
    || DEFAULT_LOCAL_URL,
);
