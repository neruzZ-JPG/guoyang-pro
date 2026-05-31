// cli/src/format.ts — TTY 友好的 UTF-8 表格渲染(中文按2列宽)。
import type { Enterprise, Position } from "./codes.js";

export function isTty(): boolean {
  return !!process.stdout.isTTY;
}

function charWidth(ch: string): number {
  const code = ch.codePointAt(0) ?? 0;
  if (code >= 0x4e00 && code <= 0x9fff) return 2;
  if (code >= 0x3000 && code <= 0x303f) return 2;
  if (code >= 0xff00 && code <= 0xffef) return 2;
  return 1;
}

function strWidth(s: string): number {
  let w = 0;
  for (const ch of s) w += charWidth(ch);
  return w;
}

function clip(s: string, max: number): string {
  let w = 0;
  let out = "";
  for (const ch of s) {
    const cw = charWidth(ch);
    if (w + cw > max) return out + "…";
    out += ch;
    w += cw;
  }
  return out;
}

function pad(s: string, width: number): string {
  const diff = width - strWidth(s);
  return diff > 0 ? s + " ".repeat(diff) : s;
}

export function renderTable(headers: string[], rows: string[][]): string {
  if (rows.length === 0) return "(无)";
  const widths = headers.map((h, i) =>
    Math.max(strWidth(h), ...rows.map((r) => strWidth(r[i] ?? ""))),
  );
  const sep = widths.map((w) => "─".repeat(w)).join("  ");
  const head = headers.map((h, i) => pad(h, widths[i])).join("  ");
  const body = rows
    .map((r) => r.map((c, i) => pad(c ?? "", widths[i])).join("  "))
    .join("\n");
  return `${head}\n${sep}\n${body}`;
}

export function formatEnterprises(ents: Enterprise[]): string {
  const headers = ["梯队", "简称", "行业", "监管", "总部", "备注"];
  const rows = ents.map((e) => [
    e.tier,
    clip(e.short, 16),
    clip(String(e.sector), 12),
    clip(String(e.regulator), 12),
    clip(e.hq ?? "", 8),
    clip(e.notes ?? "", 20),
  ]);
  return renderTable(headers, rows);
}

export function formatPositions(positions: Position[]): string {
  const headers = ["企业", "岗位", "类型", "学历", "专业", "人数", "地点", "用工"];
  const t: Record<string, string> = { campus: "校招", social: "社招", intern: "实习" };
  const rows = positions.map((p) => [
    clip(p.enterprise_name, 14),
    clip(p.title, 18),
    t[p.recruit_type] ?? p.recruit_type,
    clip(p.education, 8),
    clip(p.major, 14),
    String(p.headcount),
    clip(p.work_location, 10),
    p.employment_type === "未明确" ? "" : p.employment_type,
  ]);
  return renderTable(headers, rows);
}
