/**
 * 统一搜索入口：已配置 Supabase → 优先调数据库函数 search_resources，
 * 函数异常或返回 0 条时自动降级为直查表兜底；未配置 → 演示数据。
 */
import type { Resource, SearchParams, SearchResult } from "./types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isDbConfigured, getDb } from "./db";
import { DEMO_RESOURCES } from "./demo-data";
import { parseFileSize } from "./meta";

/** 把 UI 的大小档位换算为字节数区间 */
function sizeRange(size?: string): [number | null, number | null] {
  if (size === "lt1") return [null, 1024 ** 3];
  if (size === "1_10") return [1024 ** 3, 10 * (1024 ** 3)];
  if (size === "gt10") return [10 * (1024 ** 3), null];
  return [null, null];
}

/** 直查兜底：绕过 RPC，用 supabase-js 直接查表（单词搜索语义与 RPC 一致） */
async function searchViaDirect(
  db: SupabaseClient,
  p: SearchParams,
  minSize: number | null,
  maxSize: number | null
): Promise<{ rows: Resource[]; total: number } | null> {
  // PanSou/PostgREST 对组合词支持差，与 RPC 路径一致：只取首个词
  const tok = (p.q ?? "").trim().split(/\s+/)[0]?.replace(/[,()"']/g, "") ?? "";
  if (!tok) return null;

  let query = db
    .from("resources")
    .select("*", { count: "exact" })
    .or(`title.ilike.%${tok}%,description.ilike.%${tok}%`);
  if (p.category) query = query.eq("category", p.category);
  if (p.pan) query = query.eq("pan_type", p.pan);
  if (p.status && p.status !== "all") query = query.eq("status", p.status);
  if (p.days && p.days > 0) {
    query = query.gte("updated_at", new Date(Date.now() - p.days * 86400_000).toISOString());
  }
  if (minSize !== null) query = query.gte("file_size", minSize);
  if (maxSize !== null) query = query.lte("file_size", maxSize);

  // 排序
  if (p.sort === "size_desc") {
    query = query.order("file_size", { ascending: false, nullsFirst: false }).order("updated_at", { ascending: false });
  } else if (p.sort === "size_asc") {
    query = query.order("file_size", { ascending: true, nullsLast: true }).order("updated_at", { ascending: false });
  } else {
    query = query.order("updated_at", { ascending: false });
  }

  const page = p.page ?? 1;
  const per = Math.min(50, Math.max(1, p.per ?? 20));
  const { data, count, error } = await query.range((page - 1) * per, page * per - 1);
  if (error) throw error;
  return { rows: (data ?? []) as unknown as Resource[], total: count ?? 0 };
}

/** 数据库模式：调用 SQL 函数（SQL 详见 database/schema.sql） */
async function searchFromDb(p: SearchParams): Promise<SearchResult> {
  const db = getDb();
  const [minSize, maxSize] = sizeRange(p.size);
  const { data, error } = await db.rpc("search_resources", {
    p_query: p.q ?? "",
    p_category: p.category || null,
    p_pan: p.pan || null,
    p_status: !p.status || p.status === "all" ? null : p.status,
    p_days: p.days && p.days > 0 ? p.days : null,
    p_min_size: minSize,
    p_max_size: maxSize,
    p_sort: p.sort ?? "time",
    p_page: p.page ?? 1,
    p_per: p.per ?? 20,
  });
  if (error) throw error;
  const first = (data as { rows: Resource[]; total: number }[])?.[0];
  const total = Number(first?.total ?? 0);
  if (total === 0) {
    // RPC 返回 0 条时（函数可能被 API 层缓存干扰），自动用直查表兜底
    try {
      const direct = await searchViaDirect(db, p, minSize, maxSize);
      if (direct && direct.total > 0) {
        return {
          rows: direct.rows,
          total: direct.total,
          page: p.page ?? 1,
          per: p.per ?? 20,
          demo: false,
          debugError: `RPC 异常返回 0，已用直查兜底命中 ${direct.total} 条`,
        };
      }
    } catch (e) {
      console.error("[搜索] 直查兜底失败：", e);
    }
    // 兜底仍为 0：输出深度诊断（网站的连接直查表行数 + 所连数据库地址）
    let anonCount: string = "?";
    let anonErr = "";
    try {
      const { count, error: cerr } = await db
        .from("resources")
        .select("id", { count: "exact", head: true });
      if (cerr) anonErr = cerr.message;
      else anonCount = String(count ?? 0);
    } catch (e) {
      anonErr = e instanceof Error ? e.message : String(e);
    }
    const host = process.env.SUPABASE_URL ? new URL(process.env.SUPABASE_URL).host : "未配置";
    return {
      rows: [],
      total: 0,
      page: p.page ?? 1,
      per: p.per ?? 20,
      demo: false,
      debugError: `RPC与直查兜底均返回0条｜网站连接的库=${host}｜网站匿名直查表=${anonCount}条${anonErr ? `（查表出错:${anonErr}）` : ""}｜参数：q=${p.q ?? ""} cat=${p.category ?? "-"} st=${p.status ?? "-"} days=${p.days ?? 0}`,
    };
  }
  return {
    rows: first?.rows ?? [],
    total,
    page: p.page ?? 1,
    per: p.per ?? 20,
    demo: false,
  };
}

/** 演示模式：与 SQL 相同语义的内存过滤 */
function searchFromDemo(p: SearchParams): SearchResult {
  const tokens = (p.q ?? "").trim().split(/\s+/).filter(Boolean);
  const [minSize, maxSize] = sizeRange(p.size);
  const days = p.days && p.days > 0 ? p.days : null;

  let rows = DEMO_RESOURCES.filter((r) => {
    // 关键词：合并字段需包含全部词（AND 语义）
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

/** 全站统一的搜索函数 */
export async function searchResources(params: SearchParams): Promise<SearchResult> {
  if (isDbConfigured()) {
    try {
      return await searchFromDb(params);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[搜索] 数据库查询失败，回退演示数据：", msg);
      // 回退演示数据的同时，把失败原因带给页面（用于无结果时的诊断展示）
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

/** 首页热搜词：近 7 天搜索次数 Top N；演示模式返回内置词 */
export async function getHotKeywords(limit = 10): Promise<{ words: string[]; demo: boolean }> {
  if (isDbConfigured()) {
    try {
      const { data, error } = await getDb().rpc("get_hot_keywords", { p_limit: limit });
      if (!error && data) return { words: (data as { keyword: string; cnt: number }[]).map((d) => d.keyword), demo: false };
    } catch (e) {
      console.error("[热搜] 查询失败：", e);
    }
  }
  return {
    words: ["庆余年", "流浪地球", "三体", "海贼王", "哈利波特", "斗破苍穹", "狂飙", "诡秘之主", "明朝那些事儿", "进击的巨人"],
    demo: true,
  };
}

/** 导出给搜索页复用：把关键词自动解析出大小（如标题带“4.3GB”） */
export { parseFileSize };
