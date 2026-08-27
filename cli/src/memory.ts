// cli/src/memory.ts — 本地持久化用户画像与关注列表(~/.guoyangpro/memory.json)。
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, chmodSync } from "node:fs";
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
    const parsed = JSON.parse(readFileSync(FILE, "utf-8")) as Partial<MemoryState>;
    const allowedPrefs = new Set([
      "education", "major", "school_tier", "political", "location", "sector", "recruit_type",
    ]);
    const prefsValid = parsed.prefs === undefined || (
      typeof parsed.prefs === "object" &&
      !Array.isArray(parsed.prefs) &&
      Object.entries(parsed.prefs).every(([key, value]) =>
        allowedPrefs.has(key) && (value === undefined || typeof value === "string"),
      )
    );
    const watchedValid = parsed.watched === undefined || (
      Array.isArray(parsed.watched) &&
      parsed.watched.every((item) =>
        !!item &&
        typeof item === "object" &&
        (item.kind === "enterprise" || item.kind === "position") &&
        typeof item.id === "string" &&
        typeof item.label === "string" &&
        typeof item.added_at === "string" &&
        Number.isFinite(Date.parse(item.added_at)) &&
        (item.year === undefined || Number.isInteger(item.year)) &&
        (item.note === undefined || typeof item.note === "string"),
      )
    );
    const eventsValid = parsed.events === undefined || (
      Array.isArray(parsed.events) &&
      parsed.events.every((item) =>
        !!item &&
        typeof item === "object" &&
        typeof item.at === "string" &&
        Number.isFinite(Date.parse(item.at)) &&
        typeof item.type === "string" &&
        typeof item.detail === "string",
      )
    );
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !prefsValid ||
      !watchedValid ||
      !eventsValid
    ) {
      throw new Error(`记忆文件结构无效: ${FILE}`);
    }
    return {
      prefs: parsed.prefs ?? {},
      watched: parsed.watched ?? [],
      events: parsed.events ?? [],
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return empty();
  }
}

function save(state: MemoryState) {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true, mode: 0o700 });
  chmodSync(DIR, 0o700);
  const tmp = `${FILE}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2), { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, FILE);
}

export function setPrefs(updates: Record<string, unknown>): MemoryState {
  const state = loadMemory();
  const aliases: Record<string, keyof MemoryPrefs> = {
    "school-tier": "school_tier",
    "recruit-type": "recruit_type",
    type: "recruit_type",
  };
  const allowed: (keyof MemoryPrefs)[] = [
    "education", "major", "school_tier", "political", "location", "sector", "recruit_type",
  ];
  for (const [k, v] of Object.entries(updates)) {
    if (v === undefined || v === "") continue;
    const key = aliases[k] ?? (k as keyof MemoryPrefs);
    if (!allowed.includes(key)) continue;
    (state.prefs as Record<string, unknown>)[key] = String(v);
  }
  save(state);
  return state;
}

export function addWatched(
  kind: Watched["kind"], id: string, label: string, year?: number, note?: string,
): MemoryState {
  const state = loadMemory();
  const existing = state.watched.find((w) => w.kind === kind && w.id === id);
  if (existing) {
    existing.label = label;
    existing.year = year;
    existing.note = note;
  } else {
    state.watched.push({
      kind, id, label, year, added_at: new Date().toISOString(), note,
    });
  }
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
