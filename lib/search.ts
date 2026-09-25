/**
 * 统一搜索入口（直查模式）：
 * 直接用 supabase-js 查 resources 表（标题模糊匹配 + 筛选 + 排序 + 分页），
 * 不再经过数据库函数/RPC 中间层——任何错误都会如实上抛并显示在页面上。
 * 未配置 Supabase 时使用演示数据。
 */
import type { Resource, SearchParams, SearchResult } from "./types";
import { isDbConfigured, getDb } from "./db";
import { DEMO_RESOURCES } from "./demo-data";

/** 把 UI 的大小档位换算为字节数区间 */
function sizeRange(size?: string): [number | null, number | null] {
  if (size === "lt1") return [null, 1024 ** 3];
  if (size === "1_10") return [1024 ** 3, 10 * (1024 ** 3)];
  if (size === "gt10") return [10 * (1024 ** 3), null];
  return [null, null];
}

/** 数据库直查模式 */
async function searchFromDb(p: SearchParams): Promise<SearchResult> {
  const db = getDb();
  const [minSize, maxSize] = sizeRange(p.size);
  const page = Math.max(1, p.page ?? 1);
  const per = Math.min(50, Math.max(1, p.per ?? 20));

  // 关键词：PanSou/PostgREST 对组合词支持差，统一取首个词
  const tok = (p.q ?? "").trim().split(/\s+/)[0]?.replace(/[,()"']/g, "") ?? "";

  let query = db.from("resources").select("*", { count: "exact" });
  if (tok) query = query.ilike("title", `%${tok}%`);
  if (p.category) query = query.eq("category", p.category);
  if (p.pan) query = query.eq("pan_type", p.pan);
  if (p.status && p.status !== "all") query = query.eq("status", p.status);
  if (p.days && p.days > 0) {
    query = query.gte("updated_at", new Date(Date.now() - p.days * 86400_000).toISOString());
  }
  if (minSize !== null) query = query.gte("file_size", minSize);
  if (maxSize !== null) query = query.lte("file_size", maxSize);

  if (p.sort === "size_desc") {
    query = query.order("file_size", { ascending: false, nullsFirst: false }).order("updated_at", { ascending: false });
  } else if (p.sort === "size_asc") {
    query = query.order("file_size", { ascending: true, nullsFirst: false }).order("updated_at", { ascending: false });
  } else {
    query = query.order("updated_at", { ascending: false });
  }

  const { data, count, error } = await query.range((page - 1) * per, page * per - 1);
  if (error) throw new Error(error.message);

  return {
    rows: (data ?? []) as unknown as Resource[],
    total: count ?? 0,
    page,
    per,
    demo: false,
  };
}

/** 演示模式：与数据库模式相同语义的内存过滤 */
function searchFromDemo(p: SearchParams): SearchResult {
  const tokens = (p.q ?? "").trim().split(/\s+/).filter(Boolean);
  const [minSize, maxSize] = sizeRange(p.size);
  const days = p.days && p.days > 0 ? p.days : null;

  let rows = DEMO_RESOURCES.filter((r) => {
    if (tokens.length) {
      const hay = (r.title + " " + (r.description ?? "")).toLowerCase();
      if (!tokens.every((t) => hay.includes(t.toLowerCase()))) return false;
    }
    if (p.category && r.category !== p.category) return false;
    if (p.pan && r.pan_type !== p.pan) return false;
    if (p.status && p.status !== "all" && r.status !== p.status) return false;
    if (days && new Date(r.updated_at).getTime() < Date.now() - days * 86400_000) return false;
    if (minSize !== null && (r.file_size === null || r.file_size < minSize)) return false;
    if (maxSize !== null && (r.file_size === null || r.file_size > maxSize)) return false;
    return true;
  });

  const total = rows.length;
  const sort = p.sort ?? "time";
  rows = rows.sort((a, b) => {
    if (sort === "size_desc") return (b.file_size ?? -1) - (a.file_size ?? -1);
    if (sort === "size_asc") return (a.file_size ?? Infinity) - (b.file_size ?? Infinity);
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });

  const page = p.page ?? 1;
  const per = p.per ?? 20;
  return { rows: rows.slice((page - 1) * per, page * per), total, page, per, demo: true };
}

/** 全站统一的搜索函数：数据库报错时回退演示数据，并携带失败原因供页面诊断显示 */
export async function searchResources(params: SearchParams): Promise<SearchResult> {
  if (isDbConfigured()) {
    try {
      return await searchFromDb(params);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[搜索] 数据库查询失败，回退演示数据：", msg);
      return { ...searchFromDemo(params), debugError: `数据库查询失败：${msg}` };
    }
  }
  return { ...searchFromDemo(params), debugError: "未配置 Supabase 环境变量（演示模式）" };
}

/** 记录搜索词（用于首页热搜榜）；失败静默，不影响搜索结果 */
export async function logSearch(keyword: string): Promise<void> {
  const kw = keyword.trim();
  if (!kw || kw.length > 50) return;
  if (!isDbConfigured()) return;
  try {
    await getDb().from("search_logs").insert({ keyword: kw });
  } catch (e) {
    console.error("[热搜] 记录失败：", e);
  }
}
