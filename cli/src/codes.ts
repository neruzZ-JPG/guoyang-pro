// cli/src/codes.ts
// 国央企 PRO 领域模型。两个核心实体：
//   Enterprise —— 央企/国企名录(按梯队/行业/监管主体分类),数据集型,小而稳。
//   Position   —— 招聘岗位(按招聘年份分片),来自国聘/24365/各企业官网快照。
// 与考公不同:国央企没有"进面分/政治面貌/省份"统一官方数据,核心维度是
//   梯队(热度) / 行业 / 用工性质(编制vs派遣) / 招聘类型(校招vs社招) / 薪资口碑。

// ── 梯队(求职热度/含金量) ──────────────────────────────────────────
// T0 "宇宙尽头": 烟草、电网、三桶油核心、六大行总行、部分金融央企
// T1 头部: 运营商、航天、中核中广核、招商局、华润、中建中铁
// T2 主力: 多数产业央企子公司、股份制银行、地方头部国企(城投/能源/交投)
// T3 一般: 一般地方国企、央企三级以下子公司、劳务派遣岗
export const TIERS = {
  T0: "T0 顶级(烟草/电网/三桶油核心/六大行总行)",
  T1: "T1 头部(运营商/航天/中核中广核/招商局/华润/中建中铁)",
  T2: "T2 主力(产业央企子公司/股份行/地方头部国企)",
  T3: "T3 一般(一般地方国企/三级以下子公司/派遣岗)",
} as const;
export type Tier = keyof typeof TIERS;

// ── 行业 ────────────────────────────────────────────────────────────
export const SECTORS = [
  "能源电力", "油气化工", "电信运营", "金融银行", "证券保险",
  "建筑工程", "交通运输", "航空航天军工", "汽车制造", "钢铁有色",
  "烟草", "农业粮食", "科技数字", "传媒文化", "医药健康",
  "建材机械", "商贸物流", "地方城投", "其他",
] as const;
export type Sector = (typeof SECTORS)[number];

// ── 监管主体 ────────────────────────────────────────────────────────
export const REGULATORS = {
  sasac: "国务院国资委",        // 产业类央企(~99家)
  mof: "财政部",               // 中央金融企业(~27家)
  miit_tobacco: "国家烟草专卖局", // 中国烟草体系
  crc: "国铁集团",              // 铁路
  cpd: "中央宣传部",            // 中央文化企业
  local: "地方国资委",          // 省/市属地方国企
} as const;
export type Regulator = keyof typeof REGULATORS;

// ── 招聘类型 ────────────────────────────────────────────────────────
export const RECRUIT_TYPES = {
  campus: "校园招聘",
  social: "社会招聘",
  intern: "实习",
  unknown: "未标注",
} as const;
export type RecruitType = keyof typeof RECRUIT_TYPES;

export function resolveRecruitType(input?: string): RecruitType | undefined {
  if (!input) return undefined;
  if (input in RECRUIT_TYPES) return input as RecruitType;
  const m: Record<string, RecruitType> = {
    "校招": "campus", "校园": "campus", "应届": "campus",
    "社招": "social", "社会": "social",
    "实习": "intern", "intern": "intern",
    "未知": "unknown", "未标注": "unknown", "unknown": "unknown",
  };
  return m[input];
}

/** 从上游行业、企业名等文本中做保守的行业归一化；无法可靠判断时返回 undefined。 */
export function inferSector(text?: string): Sector | undefined {
  const t = (text ?? "").replace(/\s+/g, "");
  if (!t) return undefined;
  if (/基金会/.test(t)) return undefined;
  const priorityRules: [RegExp, Sector][] = [
    [/新能源汽车|新能源车|电动汽车/, "汽车制造"],
    [/建筑材料|新型建材/, "建材机械"],
    [/化学制药|生物制药|医药|医疗|健康/, "医药健康"],
  ];
  const priority = priorityRules.find(([re]) => re.test(t));
  if (priority) return priority[1];
  const rules: [RegExp, Sector][] = [
    [/烟草|中烟/, "烟草"],
    [/银行|农信|信用社/, "金融银行"],
    [/证券|保险|信托|产业基金|投资基金|基金管理|资产管理|金融控股|投资银行/, "证券保险"],
    [/电网|电力|发电|水电|核电|风电|光伏|新能源|能源投资/, "能源电力"],
    [/石油|石化|油气|煤化工|化工产业|化工集团/, "油气化工"],
    [/移动通信|电信|联通|通信运营|信息通信/, "电信运营"],
    [/航天|航空工业|航空发动机|兵器|军工|船舶|雷达|导弹/, "航空航天军工"],
    [/铁路|轨道交通|航空运输|机场|港口|航运|物流运输|高速公路/, "交通运输"],
    [/建筑|施工|工程建设|基础设施建设|勘察设计/, "建筑工程"],
    [/汽车|整车|乘用车|商用车/, "汽车制造"],
    [/钢铁|有色|矿业|金属冶炼/, "钢铁有色"],
    [/粮食|农业|农垦|种业|食品/, "农业粮食"],
    [/传媒|出版|文化|影视|广播电视/, "传媒文化"],
    [/软件|互联网|大数据|人工智能|电子信息|数字科技|计算机/, "科技数字"],
    [/机械|装备制造|建材|水泥/, "建材机械"],
    [/商贸|贸易|供应链|仓储物流/, "商贸物流"],
    [/城投|城市投资|城市建设投资/, "地方城投"],
  ];
  const matches = [...new Set(rules.filter(([re]) => re.test(t)).map(([, sector]) => sector))];
  return matches.length === 1 ? matches[0] : undefined;
}

/** 上游未给可靠枚举时，只依据明确文字做保守推断。 */
export function inferRecruitType(text?: string): RecruitType {
  const t = text ?? "";
  const matches: RecruitType[] = [];
  if (/实习|intern/i.test(t)) matches.push("intern");
  if (/校园招聘|校招|应届|毕业生|管培生|春招|秋招/.test(t)) matches.push("campus");
  if (/社会招聘|社招|成熟人才/.test(t)) matches.push("social");
  return matches.length === 1 ? matches[0] : "unknown";
}

// ── 用工性质(求职者最关心的"坑"之一) ──────────────────────────────
// 同岗位"在编/正式"与"劳务派遣"薪资可差 2-3 倍。几乎只写在岗位备注/JD 自由文本里,
// 需在入库时用 classifyEmployment() 从原文派生成结构化字段(借鉴考公 programs[] 思路)。
export const EMPLOYMENT_TYPES = ["在编/正式", "合同制", "劳务派遣", "未明确"] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

const DISPATCH_RE = /劳务派遣|派遣制|第三方用工|外包用工/;
const FORMAL_RE = /(在编|正式编制|事业编|入编|纳入编制|签订劳动合同.{0,6}本部|集团本部)/;
const CONTRACT_RE = /合同制|劳动合同|聘用制/;
/** 从岗位文本(JD/备注/标题)派生用工性质。识别不到返回"未明确"(诚实披露,不臆断为正式)。 */
export function classifyEmployment(text: string): EmploymentType {
  const t = text || "";
  if (DISPATCH_RE.test(t)) return "劳务派遣";
  if (FORMAL_RE.test(t)) return "在编/正式";
  if (CONTRACT_RE.test(t)) return "合同制";
  return "未明确";
}

// ── 企业(名录) ─────────────────────────────────────────────────────
export type Enterprise = {
  id: string;            // slug,如 "sgcc" / "cnpc" / "icbc"
  name: string;          // 全称,如 "国家电网有限公司"
  short: string;         // 常用简称,如 "国家电网"
  tier: Tier;
  sector: Sector | string;
  regulator: Regulator | string;
  listed?: string;       // 上市代码(若上市),否则空
  hq?: string;           // 总部所在城市
  recruit_site?: string; // 招聘官网
  ats?: string;          // 招聘系统:北森/Moka/国聘/自建
  aliases?: string[];    // 别名(用于检索/匹配岗位归属)
  notes?: string;        // 求职者关心的点:薪资口碑/落户/编制
  source?: string;       // 名录数据来源
};

// ── 岗位 ────────────────────────────────────────────────────────────
export type Position = {
  id: string;             // 岗位唯一 id(源站 id 或 入库生成)
  year: number;           // 招聘年份(分片键)
  enterprise_id: string;  // 关联 Enterprise.id(无法归属时为 "")
  enterprise_name: string;// 招聘企业名(原文)
  tier?: Tier;            // 冗余企业梯队(便于不 join 直接筛/排序)
  sector?: string;        // 冗余企业行业
  title: string;          // 岗位名
  recruit_type: RecruitType; // 校招/社招/实习
  work_location: string;  // 工作地点
  headcount: number;      // 招聘人数(未知按 1)
  education: string;      // 学历要求
  major: string;          // 专业要求(原文,可含多专业;"不限"表示不限)
  employment_type: EmploymentType; // 用工性质(派生)
  salary_ref?: string;    // 薪资参考(公开/口碑,必带来源与"仅供参考")
  political?: string;     // 政治面貌要求(如限党员)
  experience?: string;    // 经验要求(应届/N年)
  desc?: string;          // 岗位职责
  requirements?: string;  // 任职要求
  remarks?: string;       // 备注(用工性质/落户/其他限制原文)
  deadline?: string;      // 投递截止
  posted_at?: string;     // 发布时间
  apply_url?: string;     // 投递/详情链接
  source?: string;        // 数据来源 URL(溯源)
  source_id?: string;     // 数据源稳定 id,如 iguopin/ncss
  source_position_id?: string; // 数据源岗位 id
  source_company_id?: string;  // 数据源企业 id
  source_urls?: string[]; // 跨源合并后的全部溯源链接
  fetched_at?: string;    // 实时抓取时间
  match_confidence?: "exact" | "affiliate" | "inferred" | "none";
  quality_warnings?: string[];
};

// ── 招聘时间线(日历) ───────────────────────────────────────────────
export type CalendarEntry = {
  sector: string;         // 行业/企业类别
  recruit_type: RecruitType;
  window: string;         // 时间窗,如 "9月-11月"
  note: string;           // 说明
  examples?: string[];    // 代表企业
};

// ── 数据集元信息 ────────────────────────────────────────────────────
export type EnterpriseRoster = {
  meta: {
    version: string;
    built_at: string;
    total: number;
    by_tier: Record<string, number>;
    by_regulator: Record<string, number>;
    sources?: string[];
  };
  enterprises: Enterprise[];
};

export type PositionShard = {
  year: number;
  positions: Position[];
};

export type PositionMeta = {
  version: string;
  built_at: string;
  years: number[];
  total_positions: number;
  per_year: Record<number, number>;
  // 诚实披露:各源覆盖了哪些企业/行业、数据时点、是否为快照
  coverage?: Record<string, { positions: number; note?: string }>;
};

// 把用户输入解析成行业枚举(支持别名)
export function resolveSector(input?: string): string | undefined {
  if (!input) return undefined;
  if ((SECTORS as readonly string[]).includes(input)) return input;
  const m: Record<string, Sector> = {
    "电力": "能源电力", "电网": "能源电力", "能源": "能源电力",
    "石油": "油气化工", "石化": "油气化工", "油气": "油气化工", "化工": "油气化工",
    "通信": "电信运营", "运营商": "电信运营", "电信": "电信运营",
    "银行": "金融银行", "金融": "金融银行",
    "保险": "证券保险", "证券": "证券保险",
    "建筑": "建筑工程", "基建": "建筑工程", "工程": "建筑工程",
    "交通": "交通运输", "铁路": "交通运输", "航空": "交通运输",
    "军工": "航空航天军工", "航天": "航空航天军工",
    "汽车": "汽车制造",
    "钢铁": "钢铁有色", "有色": "钢铁有色",
    "烟草": "烟草",
    "农业": "农业粮食", "粮食": "农业粮食",
    "科技": "科技数字", "互联网": "科技数字", "数字": "科技数字",
    "传媒": "传媒文化", "文化": "传媒文化",
    "医药": "医药健康", "医疗": "医药健康",
    "城投": "地方城投",
  };
  return m[input];
}
