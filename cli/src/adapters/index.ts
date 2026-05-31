// cli/src/adapters/index.ts
// 实时数据源适配器注册表。岗位为时变数据,运行时由这些适配器实时拉取。
import type { SourceAdapter } from "./types.js";
import iguopin from "./iguopin.js";
import ncss from "./ncss.js";

export const ADAPTERS: SourceAdapter[] = [
  iguopin, // 主源:国聘网(国资委牵头,覆盖85%+央企国企岗)
  ncss,    // 次源:24365 国家大学生就业服务平台(高校毕业生岗为主)
];

export function liveAdapters(): SourceAdapter[] {
  return ADAPTERS.filter((a) => a.live);
}

export function adapterById(id: string): SourceAdapter | undefined {
  return ADAPTERS.find((a) => a.id === id);
}
