// cli/src/memory.ts — 本地持久化用户画像与关注列表(~/.guoyangpro/memory.json)。
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export type MemoryPrefs = {
  education?: string;
  major?: string;
  school_tier?: string;   // 院校层级:985/211/双一流/普通本科
  political?: string;     // 政治面貌
  location?: string;      // 意向城市
  sector?: string;        // 意向行业
  recruit_type?: string;  // 校招/社招
};

export type Watched = {
  kind: "enterprise" | "position";
  id: string;
  label: string;
  year?: number;
  added_at: string;
  note?: string;
};

export type MemoryEvent = { at: string; type: string; detail: string };

export type MemoryState = {
  prefs: MemoryPrefs;
  watched: Watched[];
  events: MemoryEvent[];
};

const DIR = join(homedir(), ".guoyangpro");
const FILE = join(DIR, "memory.json");

function empty(): MemoryState {
  return { prefs: {}, watched: [], events: [] };
}

export function memoryPath(): string { return FILE; }

export function loadMemory(): MemoryState {
  try {
    return JSON.parse(readFileSync(FILE, "utf-8"));
  } catch {
    return empty();
  }
}

function save(state: MemoryState) {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
  writeFileSync(FILE, JSON.stringify(state, null, 2));
}

export function setPrefs(updates: Record<string, unknown>): MemoryState {
  const state = loadMemory();
  const allowed: (keyof MemoryPrefs)[] = [
    "education", "major", "school_tier", "political", "location", "sector", "recruit_type",
  ];
  for (const [k, v] of Object.entries(updates)) {
    if (v === undefined || v === "") continue;
    if (!allowed.includes(k as keyof MemoryPrefs)) continue;
    (state.prefs as Record<string, unknown>)[k] = String(v);
  }
  save(state);
  return state;
}

export function addWatched(
  kind: Watched["kind"], id: string, label: string, year?: number, note?: string,
): MemoryState {
  const state = loadMemory();
  state.watched.push({
    kind, id, label, year, added_at: new Date().toISOString(), note,
  });
  save(state);
  return state;
}

export function logEvent(type: string, detail: string): MemoryState {
  const state = loadMemory();
  state.events.push({ at: new Date().toISOString(), type, detail });
  if (state.events.length > 200) state.events = state.events.slice(-200);
  save(state);
  return state;
}

export function clearMemory(): MemoryState {
  const state = empty();
  save(state);
  return state;
}
