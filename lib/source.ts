/**
 * 数据源适配器（方案A）：对接 PanSou 聚合搜索 API
 * 项目地址：https://github.com/fish2018/pansou（开源，可 Docker 自部署）
 * 接口约定：GET {SOURCE_API_URL}/api/search?kw=关键词&res=merge
 * 响应：{ merged_by_type: { baidu: [{url,password,note,datetime,source}], quark: [...] } }
 */
import type { Category, PanType, Resource } from "./types";
import { detectPanType, classifyCategory, parseFileSize } from "./meta";

/** 归一化后的待入库资源 */
export interface NormalizedResource {
  title: string;
  description: string | null;
  category: Category;
  pan_type: PanType;
  share_url: string;
  extract_code: string | null;
  file_size: number | null;
  source: string | null;
  published_at: string | null;
}

interface MergedEntry {
  url?: string;
  password?: string | null;
  note?: string;
  datetime?: string;
  source?: string;
}

interface PanSouResponse {
  // 兼容两种返回结构：新版包裹在 data 字段里，旧版在顶层
  data?: {
    merged_by_type?: Record<string, MergedEntry[]>;
  };
  merged_by_type?: Record<string, MergedEntry[]>;
}

/** 带超时的 fetch */
async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 25000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 从 PanSou 拉取某关键词的资源列表
 * 只保留可识别网盘类型的链接，按 share_url 去重
 * 内容安全：过滤磁力/ed2k 链接、成人垃圾来源与成人关键词
 */
const BLOCKED_SOURCES = ["u3c3", "sukebei"]; // 已知的成人内容插件源，整条屏蔽

const BLOCKED_WORDS = [
  "做爱", "啪啪", "无套", "约炮", "少妇", "人妻", "自慰", "裸聊", "援交",
  "肉欲", "情色", "色情", "福利姬", "无码", "有码", "jav", "磁力搜索", "黄色",
];

function isAdultSpam(note: string, source: string | undefined): boolean {
  const s = (source ?? "").toLowerCase();
  if (BLOCKED_SOURCES.some((b) => s.includes(b))) return true;
  const t = note.toLowerCase();
  return BLOCKED_WORDS.some((w) => t.includes(w));
}

/** 数据源地址列表：SOURCE_API_URLS（逗号/空格分隔，支持多个，国内外结合）+ 兼容旧 SOURCE_API_URL */
export function getSourceUrls(): string[] {
  const raw = [process.env.SOURCE_API_URLS ?? "", process.env.SOURCE_API_URL ?? ""].join(",");
  const list = raw
    .split(/[\s,，;；]+/)
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter((s) => s.startsWith("http"));
  return Array.from(new Set(list));
}

/** 从全部数据源并发抓取同一关键词，跨源按链接去重后合并 */
export async function fetchFromSource(
  keyword: string,
  opts: { refresh?: boolean; timeoutMs?: number } = {}
): Promise<NormalizedResource[]> {
  const urls = getSourceUrls();
  if (urls.length === 0) return [];

  const headers: Record<string, string> = { "User-Agent": "Mozilla/5.0 pansou-sync" };
  if (process.env.SOURCE_API_TOKEN) headers["Authorization"] = `Bearer ${process.env.SOURCE_API_TOKEN}`;

  // 各数据源并发请求；单个源失败不影响其他源
  const results = await Promise.allSettled(urls.map((base) => fetchOneSource(base, keyword, opts, headers)));
  const okLists = results
    .filter((r): r is PromiseFulfilledResult<NormalizedResource[]> => r.status === "fulfilled")
    .map((r) => r.value);

  // 跨数据源按链接去重合并
  const seen = new Set<string>();
  const out: NormalizedResource[] = [];
  for (const items of okLists) {
    for (const it of items) {
      if (seen.has(it.share_url)) continue;
      seen.add(it.share_url);
      out.push(it);
    }
  }
  return out;
}

/** 从单个数据源抓取 */
async function fetchOneSource(
  base: string,
  keyword: string,
  opts: { refresh?: boolean; timeoutMs?: number },
  headers: Record<string, string>
): Promise<NormalizedResource[]> {
  const u = base.replace(/\/+$/, "") + "/api/search";
  // cloud_types 限定只返回网盘类结果（lanzou 归在 others，磁力/ed2k 不返回）
  const params = new URLSearchParams({
    kw: keyword,
    res: "merge",
    cloud_types: "baidu,quark,xunlei,aliyun,uc,tianyi,115,123,mobile,others",
  });
  // 追更词强制刷新：绕过数据源缓存，拿到当天最新集数的分享
  if (opts.refresh) params.set("refresh", "true");

  const res = await fetchWithTimeout(`${u}?${params.toString()}`, { headers }, opts.timeoutMs ?? 25000);
  if (!res.ok) throw new Error(`数据源返回 ${res.status}`);
  const json = (await res.json()) as PanSouResponse;

  const seen = new Set<string>();
  const out: NormalizedResource[] = [];
  const merged = json.data?.merged_by_type ?? json.merged_by_type ?? {};
  for (const entries of Object.values(merged)) {
    if (!Array.isArray(entries)) continue;
    for (const e of entries) {
      if (!e?.url || !e?.note) continue;
      if (/^(magnet:|ed2k:)/i.test(e.url)) continue; // 双保险：磁力/ed2k 一律不收
      if (isAdultSpam(e.note, e.source)) continue;   // 成人垃圾内容过滤
      const pan = detectPanType(e.url);
      // 注：不再跳过其他网盘——Mega/Google Drive/阿里云/115/123 等（海外内容主要在这些盘）也收录为 other
      if (seen.has(e.url)) continue; // 按链接去重
      seen.add(e.url);
      out.push({
        title: e.note.slice(0, 200),
        description: e.source ? `来源：${e.source}` : null,
        category: classifyCategory(e.note),
        pan_type: pan,
        share_url: e.url,
        extract_code: e.password ? e.password.slice(0, 10) : null,
        file_size: parseFileSize(e.note),
        source: e.source ?? "PanSou",
        published_at: e.datetime && !isNaN(Date.parse(e.datetime)) ? e.datetime : null,
      });
    }
  }
  return out;
}
