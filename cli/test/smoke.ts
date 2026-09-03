// cli/test/smoke.ts — 无网络冒烟测试:加载名录/岗位/时间线 + 跑核心 verb + 国聘适配器解析(离线fixture),任何异常即 FAIL。
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadRoster, allEnterprises, filterEnterprises, findEnterprise, loadCalendar,
  loadPosMeta, loadYear, filterPositions, educationEligible,
} from "../src/loader.js";
import { recommend } from "../src/recommend.js";
import { matchPositions } from "../src/match.js";
import {
  default as iguopinAdapter,
  detailResponseError as iguopinDetailResponseError,
  isStateOwnedRecord,
  parseRecord,
  responseError as iguopinResponseError,
  setIGuopinTransportForTest,
} from "../src/adapters/iguopin.js";
import {
  default as ncssAdapter,
  isStateOwned as isNcssStateOwned,
  parseRecord as parseNcss,
  responseError as ncssResponseError,
} from "../src/adapters/ncss.js";
import {
  default as chinaMobileAdapter,
  parseRecord as parseChinaMobile,
  recruitTypeOf as chinaMobileRecruitType,
  responseError as chinaMobileResponseError,
} from "../src/adapters/china-mobile.js";
import {
  CMB_PARTITIONS,
  default as cmbAdapter,
  parseRecord as parseCmb,
  responseError as cmbResponseError,
} from "../src/adapters/cmb.js";
import {
  default as sinopecAdapter,
  parseRecord as parseSinopec,
  responseError as sinopecResponseError,
} from "../src/adapters/sinopec.js";
import csgAdapter from "../src/adapters/csg.js";
import { fetchPagedSource } from "../src/adapters/adapter-kit.js";
import { ADAPTERS, liveAdapters } from "../src/adapters/index.js";
import {
  dedupePositions, isPositionOpen, matchEnterprise, normalizePosition,
} from "../src/live.js";
import { inferSector, type Position } from "../src/codes.js";

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`FAIL  ${name} ${detail}`); }
}

const roster = loadRoster();
check("roster 非空", roster.meta.total > 0, `total=${roster.meta.total}`);
check("roster 有 T0 企业", (roster.meta.by_tier.T0 ?? 0) > 0);
check("findEnterprise/filter 可用", filterEnterprises({ tier: "T0" }).length > 0);
check("每家企业有 id/name/tier", allEnterprises().every((e) => !!e.id && !!e.name && !!e.tier));

const cal = loadCalendar();
check("时间线非空", cal.length > 0, `len=${cal.length}`);

const meta = loadPosMeta();
console.log(`  岗位 meta: ${meta.total_positions} 个,年份 [${meta.years.join(",")}]`);
if (meta.years.length) {
  const y = Math.max(...meta.years);
  check("某年分片可懒加载", Array.isArray(loadYear(y)));
  check("岗位过滤可用", Array.isArray(filterPositions(loadYear(y), { tier: "T0" })));
}

// 推荐/匹配在无岗位数据时也应不抛异常(返回空桶)
const rec = recommend({ education: "本科", school_tier: "211" });
check("recommend 不抛异常", !!rec.buckets);
const m = matchPositions({ sector: "金融银行" });
check("match 不抛异常", Array.isArray(m));

// 国聘适配器:用真实抓取的响应 fixture 验证解析(离线,不联网)
const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = join(__dirname, "fixtures", "iguopin-list.json");
if (existsSync(fixture)) {
  const raw = JSON.parse(readFileSync(fixture, "utf-8"));
  const list: any[] = raw?.data?.list ?? [];
  check("国聘 fixture 非空", list.length > 0, `len=${list.length}`);
  const parsed = list.map(parseRecord).filter((p) => p !== null);
  check("解析: 每条有企业名+岗位名", parsed.every((p) => !!p.enterprise_name && !!p.title));
  check("解析: recruit_type 合法", parsed.every((p) => ["campus", "social", "intern", "unknown"].includes(p.recruit_type as string)));
  check("解析: 招聘人数为数字", parsed.every((p) => typeof p.headcount === "number"));
  check("解析: 薪资字段有值(含面议)", parsed.every((p) => !!p.salary_ref));
  check("解析: apply_url 指向国聘详情", parsed.every((p) => (p.apply_url ?? "").includes("iguopin.com/job/detail")));
  console.log(`  样例解析: ${parsed[0].enterprise_name} | ${parsed[0].title} | ${parsed[0].education} | ${parsed[0].work_location} | ${parsed[0].salary_ref}`);
}
const detailFixture = JSON.parse(readFileSync(
  join(__dirname, "fixtures", "iguopin-detail.json"),
  "utf-8",
));
const detailParsed = parseRecord(detailFixture.data);
check("国聘详情: 错误 case 可解析", detailParsed?.id === "195024114728046183");
check("国聘详情: 地点/专业/学历完整", (
  detailParsed?.work_location === "成都" &&
  detailParsed.major === "新闻传播学类" &&
  detailParsed.education === "硕士"
));
check("国聘详情: 识别党员要求", detailParsed?.political?.includes("党员") === true);
check("国聘详情: 拆分职责与任职要求", (
  detailParsed?.desc?.includes("新闻采写") === true &&
  detailParsed.requirements?.includes("2027届") === true
));
check("国聘详情: 严格响应 code", !!iguopinDetailResponseError({ code: 404 }));

let detailUrl = "";
const listBodies: Record<string, unknown>[] = [];
setIGuopinTransportForTest({
  getJson: async (url) => {
    if (url.includes("/api/jobs/v1/info")) {
      detailUrl = url;
      return detailFixture;
    }
    return {
      code: 200,
      data: [{
        value: "000000",
        label: "中国",
        children: [{
          value: "510000",
          label: "四川",
          children: [{ value: "510100", label: "成都", children: null }],
        }],
      }],
    };
  },
  postList: async (body) => {
    listBodies.push(body);
    return { code: 200, msg: "OK", data: { list: [detailFixture.data] } };
  },
});
const liveDetail = await iguopinAdapter.fetchDetail!("195024114728046183");
check("国聘详情: 实时接口命中错误 case", (
  liveDetail.ok &&
  liveDetail.position?.title === "宣传干事" &&
  detailUrl.endsWith("id=195024114728046183")
));
const targeted = await iguopinAdapter.fetch({
  enterprise: "中国东方电气集团有限公司",
  location: "成都",
  recruit_type: "campus",
  major: "新闻传播",
  keyword: "宣传",
  limit: 5,
  scan_limit: 100,
});
check("国聘搜索: 定向条件可召回错误 case", (
  targeted.positions.some((p) => p.id === "195024114728046183")
));
check("国聘搜索: 城市代码数组下推", (
  Array.isArray(listBodies[0]?.district) &&
  (listBodies[0].district as string[]).includes("000000.510000.510100")
));
check("国聘搜索: 企业名称下推", (
  listBodies[0]?.company_name === "中国东方电气集团有限公司"
));
setIGuopinTransportForTest();

// 名录匹配(live.ts normalize 依赖此路径把岗位归属到企业→补梯队/行业)
const icbc = findEnterprise("中国工商银行股份有限公司");
check("名录匹配: 工商银行→T0/金融银行", !!icbc && icbc.tier === "T0" && String(icbc.sector) === "金融银行", icbc ? `${icbc.tier}/${icbc.sector}` : "未找到");
const sgcc = findEnterprise("国家电网");
check("名录匹配: 国家电网→T0/能源电力", !!sgcc && sgcc.tier === "T0");
check("名录匹配: 宽泛词不随机命中", findEnterprise("中国") === undefined);
check("学历门槛: 硕士可投本科及以上", educationEligible("本科及以上", "硕士"));
check("学历门槛: 本科不可投硕士及以上", !educationEligible("硕士及以上", "本科"));
check("学历枚举: 本科可投本科、硕士", educationEligible("本科、硕士", "本科"));
check("学历枚举: 本科可投本科或硕士", educationEligible("本科或硕士", "本科"));
check("学历精确限制: 硕士不可投仅限本科", !educationEligible("仅限本科", "硕士"));
check("学历上限: 硕士可投本科及以下为否", !educationEligible("本科及以下", "硕士"));
check("学历上限: 本科可投硕士以下", educationEligible("硕士以下", "本科"));
check("学历排除: 硕士不能投本科及以上硕士除外", !educationEligible("本科及以上（硕士除外）", "硕士"));
check("学历区间: 博士不能投本科至硕士", !educationEligible("本科至硕士", "博士"));
check("学历精确: 最高学历要求本科", !educationEligible("最高学历要求本科", "硕士"));
check("行业推断: 新能源汽车优先汽车制造", inferSector("新能源汽车制造") === "汽车制造");
check("行业推断: 建筑材料优先建材机械", inferSector("建筑材料集团") === "建材机械");
check("行业推断: 化学研究所不猜油气化工", inferSector("中国科学院化学研究所") === undefined);
check("行业推断: 化学制药归医药健康", inferSector("化学制药有限公司") === "医药健康");
check("行业推断: 基金会不猜证券保险", inferSector("公益基金会") === undefined);

// 24365 聚合枚举不可信:仅从明确文字推断招聘类型；薪资为千元/月口径。
const ncssCampus = parseNcss({
  recName: "四川九洲电器集团有限责任公司",
  jobName: "系统研发岗（校招）",
  recruitType: "0",
  lowMonthPay: 9,
  highMonthPay: 9,
  headCount: 0,
  recProperty: "国有企业",
  jobId: "ncss-campus",
});
check("24365: 标题校招优先于不可靠枚举", ncssCampus?.recruit_type === "campus");
check("24365: 薪资按千元/月而非万元/月", ncssCampus?.salary_ref?.includes("千元/月") === true);
check("24365: 0 人不冒充真实人数", ncssCampus?.headcount === undefined);

const ncssUnknown = parseNcss({
  recName: "示例国企",
  jobName: "算法工程师",
  recruitType: "0",
  lowMonthPay: 6,
  highMonthPay: 8,
  recProperty: "国有企业",
  jobId: "ncss-unknown",
});
check("24365: 无明确信号时标 unknown", ncssUnknown?.recruit_type === "unknown");
check("24365: unknown 附质量告警", (ncssUnknown?.quality_warnings?.length ?? 0) > 0);
const ncssMixed = parseNcss({
  recName: "示例国企",
  jobName: "2026校园招聘及社会招聘公告",
  recProperty: "国有企业",
  jobId: "ncss-mixed",
});
check("24365: 混合招聘公告标 unknown", ncssMixed?.recruit_type === "unknown");
check("24365: 非法发布时间不抛异常", parseNcss({
  recName: "示例国企",
  jobName: "岗位",
  recProperty: "国有企业",
  jobId: "ncss-time",
  publishDate: Number.NaN,
})?.posted_at === undefined);
check("24365: 单位性质严格白名单", isNcssStateOwned({ recProperty: "国有企业" }) && !isNcssStateOwned({ recProperty: "非国有企业" }));
check("24365: 严格响应 flag", !!ncssResponseError({ flag: "false", errors: [], data: { list: [] } }));
check("24365: 非空 errors 视为失败", !!ncssResponseError({ flag: true, errors: ["denied"], data: { list: [] } }));

check("国聘: 脏记录缺企业/岗位时拒绝", parseRecord({ job_id: "dirty" }) === null);
check("国聘: 单位性质代码严格白名单", isStateOwnedRecord({ company_info: { nature: "11AzDak" } }) && !isStateOwnedRecord({ company_info: { nature: "private" } }));
check("国聘: 缺失响应列表视为协议错误", !!iguopinResponseError({ code: 200, data: {} }));
const iguopinMixed = parseRecord({
  job_id: "mixed",
  company_name: "示例国企",
  job_name: "岗位",
  recruitment_type_cn: "校园招聘及社会招聘",
});
check("国聘: 混合招聘类型标 unknown", iguopinMixed?.recruit_type === "unknown");
const iguopinSalary = parseRecord({
  job_id: "salary",
  company_name: "示例国企",
  job_name: "岗位",
  recruitment_type_cn: "社会招聘",
  min_wage: 5,
  max_wage: 8,
});
check("国聘: 缺失薪资单位不猜元/月", iguopinSalary?.salary_ref?.includes("单位未标注") === true);
const iguopinMissingSalary = parseRecord({
  job_id: "no-salary",
  company_name: "示例国企",
  job_name: "岗位",
  recruitment_type_cn: "社会招聘",
});
check("国聘: 缺失薪资不伪装面议", iguopinMissingSalary?.salary_ref === undefined);

const [iguopinBadLimit, ncssBadLimit, chinaMobileBadLimit, cmbBadLimit] = await Promise.all([
  iguopinAdapter.fetch({ limit: 100, scan_limit: 10 }),
  ncssAdapter.fetch({ limit: 100, scan_limit: 10 }),
  chinaMobileAdapter.fetch({ limit: 100, scan_limit: 10 }),
  cmbAdapter.fetch({ limit: 100, scan_limit: 10 }),
]);
check("国聘: 适配器自身拒绝 scan_limit < limit", !iguopinBadLimit.ok && iguopinBadLimit.scanned === 0);
check("24365: 适配器自身拒绝 scan_limit < limit", !ncssBadLimit.ok && ncssBadLimit.scanned === 0);
check("中国移动: 适配器自身拒绝 scan_limit < limit", !chinaMobileBadLimit.ok && chinaMobileBadLimit.scanned === 0);
check("招商银行: 适配器自身拒绝 scan_limit < limit", !cmbBadLimit.ok && cmbBadLimit.scanned === 0);

const chinaMobileParsed = parseChinaMobile({
  id: "cm-1",
  company: "中国移动通信集团广东有限公司",
  companyShortName: "广东公司",
  name: "数据中心运维工程师",
  type: "2",
  province: "广东省",
  city: "韶关市",
  address: "浈江区",
  degree: "25",
  workYear: "3",
  workType: "02",
  recruitCount: null,
  startTime: "2026-08-24",
  endTime: "2026-12-31",
  dutyCondition: "学历与专业：本科及以上学历，电气、自动化相关专业。3年及以上工作经验。",
});
check("中国移动: 官方类型代码映射社招", chinaMobileParsed?.recruit_type === "social");
check("中国移动: 学历代码映射大学本科", chinaMobileParsed?.education === "大学本科");
check("中国移动: 未标人数不伪造人数", chinaMobileParsed?.headcount === undefined);
check("中国移动: 地点保留完整层级", chinaMobileParsed?.work_location === "广东省-韶关市-浈江区");
check("中国移动: 官方详情可回链", chinaMobileParsed?.apply_url?.includes("job.10086.cn/personal/job/detail.html?id=cm-1") === true);
check("中国移动: 未知类型保守降级", chinaMobileRecruitType("9") === "unknown");
check("中国移动: 严格响应 code", !!chinaMobileResponseError({ code: "9999", data: { jobList: [] } }));
check("中国移动: 缺失列表视为协议错误", !!chinaMobileResponseError({ code: "0000", data: {} }));

const cmbCampus = CMB_PARTITIONS.find((item) => item.recruitType === "campus")!;
const cmbParsed = parseCmb({
  publishGID: "cmb-1",
  jobDisplay: "后端开发工程师",
  branchCode: "108116",
  branchCodeName: "招银网络科技",
  locationName: "深圳市",
  expiredOn: "2026-09-20",
}, cmbCampus);
check("招商银行: 科技子公司保留法律主体", cmbParsed?.enterprise_name === "招银网络科技有限公司");
check("招商银行: 分区决定招聘类型", cmbParsed?.recruit_type === "campus");
check("招商银行: 列表缺失学历专业人数时不猜测", cmbParsed?.education === undefined && cmbParsed?.major === undefined && cmbParsed?.headcount === undefined);
check("招商银行: 官方详情可回链", cmbParsed?.apply_url?.includes("career.cmbchina.com/positionDetail/school") === true);
check("招商银行: 严格响应 returnCode", !!cmbResponseError({ returnCode: "ERR", body: { data: [], total: 0 } }));
check("招商银行: 缺失 total 视为协议错误", !!cmbResponseError({ returnCode: "SUC0000", body: { data: [] } }));

const sinopecParsed = parseSinopec({
  id: "sinopec-1",
  orgName: "胜利油田",
  department: "中石化测试有限公司",
  duties: "算法工程师",
  number: 2,
  workLocation: "北京市",
  positionCondition: "硕士及以上学历，计算机相关专业，3年以上工作经验。",
  salaryText: "20万-30万",
  timeStart: "2026.08.01 00:00:00",
  timeEnd: "2026.12.31 23:59:59",
});
check("中国石化候选: 官方字段保守映射", sinopecParsed?.recruit_type === "social" && sinopecParsed.headcount === 2);
check("中国石化候选: 薪资带来源提示", sinopecParsed?.salary_ref?.includes("来源:中国石化招聘") === true);
check("中国石化候选: 严格响应 success", !!sinopecResponseError({ success: false, code: "E", data: { records: [], total: 0 } }));
check("候选源未实测真实在招前保持停用", !sinopecAdapter.live && !csgAdapter.live);
check("注册表同时披露启用和候选源", ADAPTERS.length === 6 && liveAdapters().length === 4);

const partialPaged = await fetchPagedSource({
  source: "fixture-paged",
  params: { limit: 2, scan_limit: 3 },
  pageSize: 2,
  fetchPage: async (page) => ({
    records: page === 1
      ? [
          { id: "a", company: "示例国企", title: "A" },
          { id: "b", company: "示例国企", title: "B" },
        ]
      : [
          { id: "c", company: "示例国企", title: "C" },
          { id: "d", company: "示例国企", title: "D" },
        ],
    total: 4,
  }),
  parseRecord: (raw: any) => ({
    id: raw.id,
    enterprise_name: raw.company,
    title: raw.title,
    recruit_type: "social",
  }),
});
check("共享分页: 页内达到返回上限不虚报扫描量", partialPaged.scanned === 2);
check("共享分页: 未扫完整页不标 exhausted", !partialPaged.exhausted && partialPaged.truncated);

const completePaged = await fetchPagedSource({
  source: "fixture-complete",
  params: { limit: 10, scan_limit: 10 },
  pageSize: 2,
  fetchPage: async () => ({
    records: [{ id: "a", company: "示例国企", title: "A" }],
    total: 1,
  }),
  parseRecord: (raw: any) => ({
    id: raw.id,
    enterprise_name: raw.company,
    title: raw.title,
    recruit_type: "social",
  }),
});
check("共享分页: 已检查完整末页才标 exhausted", completePaged.exhausted && !completePaged.truncated);

// 子公司关联:保留招聘主体,只在明确集团规则下继承母集团梯队/行业。
const affiliate = matchEnterprise("航天海鹰（哈尔滨）钛业有限公司");
check("子公司归一化:航天海鹰→航天科工", affiliate.enterprise?.short === "航天科工" && affiliate.confidence === "affiliate");
const unknownEnterprise = matchEnterprise("完全未知国有企业有限公司");
check("未知企业不猜母集团", !unknownEnterprise.enterprise && unknownEnterprise.confidence === "none");
check(
  "招商银行分行归一化为独立金融企业",
  matchEnterprise("招商银行重庆分行").enterprise?.short === "招商银行" &&
    matchEnterprise("招商银行重庆分行").confidence === "affiliate",
);
check(
  "招银网络科技归一化为招商银行",
  matchEnterprise("招银网络科技有限公司").enterprise?.short === "招商银行",
);
check(
  "招商银行不误归招商局交通板块",
  matchEnterprise("招商银行股份有限公司").enterprise?.sector === "金融银行",
);
check("碰撞保护: 大唐电信归中国信科", matchEnterprise("大唐电信科技股份有限公司").enterprise?.short === "中国信科");
check("碰撞保护: 大唐财富不归中国大唐", !matchEnterprise("大唐财富投资管理有限公司").enterprise);
check("碰撞保护: 中化岩土不归中国中化", !matchEnterprise("中化岩土集团股份有限公司").enterprise);
check("碰撞保护: 中化学不归中国中化", !matchEnterprise("中化学建设投资集团有限公司").enterprise);
check("碰撞保护: 通用投资控股别名不参与包含匹配", findEnterprise("北京投资控股有限公司") === undefined);
check("碰撞保护: 中国电子科技研究所不误命中国电子", findEnterprise("中国电子科技集团公司第二十八研究所") === undefined);

function position(id: string, title: string): Position {
  return {
    id,
    year: 2026,
    enterprise_id: "",
    enterprise_name: "示例国企",
    title,
    recruit_type: "unknown",
    work_location: "北京",
    headcount: 1,
    education: "本科",
    major: "不限",
    employment_type: "未明确",
    source_id: "fixture",
  };
}
const distinctChinese = dedupePositions([
  position("1", "材料工程师"),
  position("2", "算法工程师"),
]);
check("中文岗位标题不会被错误去重", distinctChinese.length === 2);

const sourceA = {
  ...position("iguopin:1", "总体设计(J13420)"),
  source_id: "iguopin",
  source_urls: ["https://www.iguopin.com/job/detail?id=1"],
};
const sourceB = {
  ...position("ncss:2", "总体设计(J13420)"),
  source_id: "ncss",
  source_urls: ["https://www.ncss.cn/student/jobs/2.html"],
};
const merged = dedupePositions([sourceA, sourceB]);
check("跨源同岗按岗位代码去重", merged.length === 1);
check("跨源去重保留全部来源", merged[0].source_urls?.length === 2);

const campus = { ...position("campus", "软件工程师"), recruit_type: "campus" as const };
const social = { ...position("social", "软件工程师"), recruit_type: "social" as const };
check("不同招聘批次不错误合并", dedupePositions([campus, social]).length === 2);

const sameParentA = {
  ...position("a", "数据工程师"),
  enterprise_id: "eb751e0",
  enterprise_name: "中国移动通信集团有限公司",
  match_confidence: "exact" as const,
};
const sameParentB = {
  ...position("b", "数据工程师"),
  enterprise_id: "eb751e0",
  enterprise_name: "中国移动",
  match_confidence: "exact" as const,
};
check("同母集团不同原名可正确去重", dedupePositions([sameParentA, sameParentB]).length === 1);

const noMajor = normalizePosition({
  enterprise_name: "未知国企",
  title: "岗位",
  recruit_type: "unknown",
});
check("缺失专业保持未标注", noMajor.major === "未标注");
check("缺失专业不会匹配任意专业", filterPositions([noMajor], { major: "法学" }).length === 0);
const trailingMajor = { ...position("major", "岗位"), major: "计算机、" };
check("专业尾部分隔符不造成万能匹配", filterPositions([trailingMajor], { major: "法学" }).length === 0);
check("专业大类可匹配具体专业", filterPositions([
  { ...position("major-family", "岗位"), major: "计算机类" },
], { major: "计算机科学与技术" }).length === 1);
check("专业排除优先于大类匹配", filterPositions([
  { ...position("major-exclude", "岗位"), major: "计算机相关专业（不含软件工程）" },
], { major: "软件工程" }).length === 0);
check("除外专业不会误匹配", filterPositions([
  { ...position("major-other", "岗位"), major: "除法学外其他专业" },
], { major: "法学" }).length === 0);

const invalidEnterpriseId = normalizePosition({
  enterprise_id: "does-not-exist",
  enterprise_name: "未知国企",
  title: "岗位",
});
check("无效 enterprise_id 不标 exact", invalidEnterpriseId.match_confidence === "none" && invalidEnterpriseId.enterprise_id === "");
const conflictingEnterpriseId = normalizePosition({
  enterprise_id: "eb751e0",
  enterprise_name: "中国工商银行",
  title: "柜员",
});
check("企业ID与名称冲突时采用名称匹配", conflictingEnterpriseId.enterprise_id === "e309e46" && conflictingEnterpriseId.sector === "金融银行");
const invalidEnums = normalizePosition({
  enterprise_name: "未知国企",
  title: "岗位",
  recruit_type: "0" as any,
  employment_type: "正式工" as any,
  tier: "T9" as any,
  sector: "制造业",
});
check("非法运行时枚举被保守降级", invalidEnums.recruit_type === "unknown" && invalidEnums.employment_type === "未明确" && !invalidEnums.tier);

const syntheticA = normalizePosition({ enterprise_name: "示例国企", title: "A", work_location: "北京" });
const syntheticB = normalizePosition({ enterprise_name: "示例国企", title: "B", work_location: "上海" });
check("无源ID岗位生成不碰撞稳定ID", syntheticA.id !== syntheticB.id && syntheticA.id.includes("synthetic:"));
const syntheticYearA = normalizePosition({ enterprise_name: "示例国企", title: "A", year: 2025 });
const syntheticYearB = normalizePosition({ enterprise_name: "示例国企", title: "A", year: 2026 });
check("合成ID包含年份批次", syntheticYearA.id !== syntheticYearB.id);

check("明确过期岗位被过滤", !isPositionOpen({ ...position("old", "旧岗位"), deadline: "2026-01-01 12:00:00" }));
check("中文已截止文案被过滤", !isPositionOpen({ ...position("closed", "旧岗位"), deadline: "已截止" }));
check("中文有效截止日期可解析", isPositionOpen({ ...position("cn-date", "岗位"), deadline: "2026年12月31日" }));
const badDeadline = normalizePosition({
  enterprise_name: "未知国企",
  title: "岗位",
  deadline: "2026/02/30",
});
check("非法截止日期附质量告警", badDeadline.quality_warnings?.some((w) => w.includes("截止时间无法解析")) === true);
check("有效岗位不被过期源记录覆盖", dedupePositions([
  { ...position("old-source", "同岗(J99999)"), deadline: "2026-01-01" },
  { ...position("active-source", "同岗(J99999)"), deadline: "2026-12-31" },
].filter(isPositionOpen)).length === 1);

const multiLocation = dedupePositions([
  { ...position("loc-a", "研发岗"), work_location: "北京、上海", recruit_type: "campus" },
  { ...position("loc-b", "研发岗"), work_location: "北京、深圳", recruit_type: "campus" },
]);
check("多地点集合不同不错误合并", multiLocation.length === 2);
const codeConflict = dedupePositions([
  { ...position("code-a", "算法工程师 J12345"), recruit_type: "campus" },
  { ...position("code-b", "财务经理 J12345"), recruit_type: "social", work_location: "上海" },
]);
check("岗位代码相同但标题冲突不错误合并", codeConflict.length === 2);
const ncssFirst = {
  ...position("ncss-order", "顺序测试(J88888)"),
  source_id: "ncss",
  education: "硕士",
  major: "未标注",
};
const iguopinSecond = {
  ...position("iguopin-order", "顺序测试(J88888)"),
  source_id: "iguopin",
  education: "本科",
  major: "计算机类",
};
const forward = dedupePositions([ncssFirst, iguopinSecond])[0];
const reverse = dedupePositions([iguopinSecond, ncssFirst])[0];
check("跨源字段优先级与输入顺序无关", forward.education === "本科" && reverse.education === "本科" && forward.source_id === "iguopin" && reverse.source_id === "iguopin");

console.log(`\n${fail === 0 ? "✓ PASS" : "✗ FAIL"}  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
