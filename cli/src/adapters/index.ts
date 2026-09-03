// cli/src/adapters/index.ts
// 实时数据源适配器注册表。岗位为时变数据,运行时由这些适配器实时拉取。
import type { SourceAdapter } from "./types.js";
import chinaMobile from "./china-mobile.js";
import cmb from "./cmb.js";
import csg from "./csg.js";
import iguopin from "./iguopin.js";
import ncss from "./ncss.js";
import sasac from "./sasac.js";
import sinopec from "./sinopec.js";

export const ADAPTERS: SourceAdapter[] = [
  chinaMobile, // 一手源：中国移动集团及所属单位
  cmb,         // 一手源：招商银行总分行、信用卡中心及科技子公司
  sasac,       // 官方聚合源：国务院国资委人事招聘公告
  iguopin,     // 综合源：国聘网
  ncss,        // 综合源：24365 国家大学生就业服务平台
  sinopec,     // 候选一手源：接口已接通，当前在招列表为空
  csg,         // 候选一手源：协议已验证，出现真实在招岗位后再启用
];

export function liveAdapters(): SourceAdapter[] {
  return ADAPTERS.filter((a) => a.live);
}

export function adapterById(id: string): SourceAdapter | undefined {
  return ADAPTERS.find((a) => a.id === id);
}

export function sourcePriority(id?: string): number {
  return adapterById(id ?? "")?.priority ?? 0;
}
