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
 */
export async function fetchFromSource(keyword: string): Promise<NormalizedResource[]> {
  const base = process.env.SOURCE_API_URL;
  if (!base) return [];

  const u = base.replace(/\/+$/, "") + "/api/search";
  const params = new URLSearchParams({ kw: keyword, res: "merge" });
  const headers: Record<string, string> = { "User-Agent": "Mozilla/5.0 pansou-sync" };
  if (process.env.SOURCE_API_TOKEN) headers["Authorization"] = `Bearer ${process.env.SOURCE_API_TOKEN}`;

  const res = await fetchWithTimeout(`${u}?${params.toString()}`, { headers });
  if (!res.ok) throw new Error(`数据源返回 ${res.status}`);
  const json = (await res.json()) as PanSouResponse;

  const seen = new Set<string>();
  const out: NormalizedResource[] = [];
  for (const entries of Object.values(json.merged_by_type ?? {})) {
    if (!Array.isArray(entries)) continue;
    for (const e of entries) {
      if (!e?.url || !e?.note) continue;
      const pan = detectPanType(e.url);
      if (pan === "other") continue; // 只收录可识别的网盘（百度/夸克/迅雷/蓝奏云等）
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
