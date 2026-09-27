/**
 * 统一搜索入口（直查模式 + 多级匹配）：
 * 匹配策略（类似搜索引擎的逐级降级，保证"最少也能模糊撞上"，不再查无结果就空手而归）：
 *  L0 精确短语：标题包含完整查询串
 *  L1 组合词：空格=且（组内全含）、分号/；=或（任一组命中）
 *  L2 模糊兜底：前两级无结果时，对每个词逐位去一个字生成变体再做"或"匹配
 * 命中后按相关度排序：完整命中 > 最长公共子串 > 命中词数量，同分按更新时间。
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

/** 清理会破坏 PostgREST or() 语法的字符 */
function cleanTerm(s: string): string {
  return s.replace(/[%*(),'"\\]/g, "").trim();
}

/** 查询语法解析：分号分隔"或"组，空格分隔"且"词 */
function parseQuery(raw: string): { full: string; groups: string[][]; terms: string[] } {
  const cleaned = (raw ?? "").slice(0, 50);
  const full = cleanTerm(cleaned);
  const groups: string[][] = [];
  for (const g of cleaned.split(/[;；]/)) {
    const terms = [...new Set(g.split(/\s+/).map(cleanTerm).filter((t) => t.length > 0))].slice(0, 4);
    if (terms.length) groups.push(terms);
    if (groups.length >= 3) break;
  }
  const terms = [...new Set(groups.flat())];
  return { full, groups, terms };
}

/** 最长公共子串长度（用于相关度） */
function lcsLen(a: string, b: string): number {
  if (!a || !b) return 0;
  let best = 0;
  let prev = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array<number>(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : 0;
      if (cur[j] > best) best = cur[j];
    }
    prev = cur;
  }
  return best;
}

/** 相关度评分：完整命中 > 最长公共子串 > 命中词数量 */
function relevance(title: string, full: string, terms: string[]): number {
  const t = (title ?? "").toLowerCase();
  let s = 0;
  if (full && t.includes(full.toLowerCase())) s += 12;
  s += 2 * lcsLen(t, full.toLowerCase());
  for (const term of terms) if (term && t.includes(term.toLowerCase())) s += 2;
  return s;
}

/** 模糊变体：逐位去一个字（仅 2~12 字的词），最多 6 个 */
function fuzzyVariants(terms: string[]): string[] {
  const out = new Set<string>();
  for (const t of terms) {
    if (t.length < 2 || t.length > 12) continue;
    for (let i = 0; i < t.length; i++) {
      const v = t.slice(0, i) + t.slice(i + 1);
      if (v.length >= 2) out.add(v);
      if (out.size >= 6) break;
    }
    if (out.size >= 6) break;
  }
  return [...out];
}

/** 数据库直查模式 */
async function searchFromDb(p: SearchParams): Promise<SearchResult> {
  const db = getDb();
  const [minSize, maxSize] = sizeRange(p.size);
  const page = Math.max(1, p.page ?? 1);
  const per = Math.min(50, Math.max(1, p.per ?? 20));
  const { full, groups, terms } = parseQuery(p.q ?? "");

  // 简化：直接内联过滤；where 回调类型用 any 避免 supabase 泛型体操
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const runQuery = async (where: (qb: any) => any): Promise<{ rows: Resource[]; total: number }> => {
    let qb = db.from("resources").select("*", { count: "exact" });
    if (p.category) qb = qb.eq("category", p.category);
    if (p.pan) qb = qb.eq("pan_type", p.pan);
    if (p.status && p.status !== "all") qb = qb.eq("status", p.status);
    if (p.days && p.days > 0) qb = qb.gte("updated_at", new Date(Date.now() - p.days * 86400_000).toISOString());
    if (minSize !== null) qb = qb.gte("file_size", minSize);
    if (maxSize !== null) qb = qb.lte("file_size", maxSize);
    qb = where(qb);
    if (p.sort === "size_desc") qb = qb.order("file_size", { ascending: false, nullsFirst: false }).order("updated_at", { ascending: false });
    else if (p.sort === "size_asc") qb = qb.order("file_size", { ascending: true, nullsFirst: false }).order("updated_at", { ascending: false });
    else qb = qb.order("updated_at", { ascending: false });
    const { data, count, error } = await qb.range(0, 999);
    if (error) throw new Error(error.message);
    return { rows: (data ?? []) as unknown as Resource[], total: count ?? 0 };
  };

  // L0：精确短语（或浏览模式）
  let { rows, total } = await runQuery((qb) => (full ? qb.ilike("title", `%${full}%`) : qb));

  // L1：组合词（空格=且，分号=或）
  if (!rows.length && groups.length > 0) {
    const expr = groups
      .map((g) => (g.length > 1 ? `and(${g.map((t) => `title.ilike.*${t}*`).join(",")})` : `title.ilike.*${g[0]}*`))
      .join(",");
    if (expr) ({ rows, total } = await runQuery((qb) => qb.or(expr)));
  }

  // L2：模糊兜底（逐位去字变体做"或"匹配）
  let fuzzy = false;
  if (!rows.length) {
    const vs = fuzzyVariants(terms);
    if (vs.length) {
      const expr = vs.map((v) => `title.ilike.*${v}*`).join(",");
      ({ rows, total } = await runQuery((qb) => qb.or(expr)));
      fuzzy = rows.length > 0;
    }
  }

  // 相关度排序（用户显式选择大小排序时保留其意图）
  const ranked = rows.slice().sort((a, b) => {
    if (p.sort === "size_desc") return (b.file_size ?? -1) - (a.file_size ?? -1);
    if (p.sort === "size_asc") return (a.file_size ?? Infinity) - (b.file_size ?? Infinity);
    const d = relevance(b.title, full, terms) - relevance(a.title, full, terms);
    if (d !== 0) return d;
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });

  return {
    rows: ranked.slice((page - 1) * per, page * per),
    total,
    page,
    per,
    demo: false,
    ...(fuzzy ? { fuzzy: true } : {}),
  };
}

/** 演示模式：与数据库模式相同语义的内存过滤 */
function searchFromDemo(p: SearchParams): SearchResult {
  const { full, groups, terms } = parseQuery(p.q ?? "");
  const [minSize, maxSize] = sizeRange(p.size);
  const days = p.days && p.days > 0 ? p.days : null;

  const hay = (r: Resource) => (r.title + " " + (r.description ?? "")).toLowerCase();

  let rows = DEMO_RESOURCES.filter((r) => {
    if (groups.length) {
      // 组合词：任一"且"组全命中即算命中
      const hit = groups.some((g) => g.every((t) => hay(r).includes(t.toLowerCase())));
      if (!hit) return false;
    }
    if (p.category && r.category !== p.category) return false;
    if (p.pan && r.pan_type !== p.pan) return false;
    if (p.status && p.status !== "all" && r.status !== p.status) return false;
    if (days && new Date(r.updated_at).getTime() < Date.now() - days * 86400_000) return false;
    if (minSize !== null && (r.file_size === null || r.file_size < minSize)) return false;
    if (maxSize !== null && (r.file_size === null || r.file_size > maxSize)) return false;
    return true;
  });

  // 模糊兜底：逐位去字变体
  let fuzzy = false;
  if (!rows.length && terms.length) {
    const vs = fuzzyVariants(terms);
    rows = DEMO_RESOURCES.filter((r) => {
      if (!vs.some((v) => hay(r).includes(v.toLowerCase()))) return false;
      if (p.category && r.category !== p.category) return false;
      if (p.pan && r.pan_type !== p.pan) return false;
      if (p.status && p.status !== "all" && r.status !== p.status) return false;
      if (days && new Date(r.updated_at).getTime() < Date.now() - days * 86400_000) return false;
      if (minSize !== null && (r.file_size === null || r.file_size < minSize)) return false;
      if (maxSize !== null && (r.file_size === null || r.file_size > maxSize)) return false;
      return true;
    });
    fuzzy = rows.length > 0;
  }

  const total = rows.length;
  const sort = p.sort ?? "time";
  rows = rows.sort((a, b) => {
    if (sort === "size_desc") return (b.file_size ?? -1) - (a.file_size ?? -1);
    if (sort === "size_asc") return (a.file_size ?? Infinity) - (b.file_size ?? Infinity);
    const d = relevance(b.title, full, terms) - relevance(a.title, full, terms);
    if (d !== 0) return d;
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });

  const page = p.page ?? 1;
  const per = p.per ?? 20;
  return { rows: rows.slice((page - 1) * per, page * per), total, page, per, demo: true, ...(fuzzy ? { fuzzy: true } : {}) };
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

/** 首页热搜词：近 7 天搜索次数 Top N；演示模式返回内置词 */
export async function getHotKeywords(limit = 10): Promise<{ words: string[]; demo: boolean }> {
  if (isDbConfigured()) {
    try {
      const { data, error } = await getDb().rpc("get_hot_keywords", { p_limit: limit });
      if (!error && data) {
        return { words: (data as { keyword: string; cnt: number }[]).map((d) => d.keyword), demo: false };
      }
    } catch (e) {
      console.error("[热搜] 查询失败：", e);
    }
  }
  return {
    words: ["庆余年", "流浪地球", "三体", "海贼王", "哈利波特", "斗破苍穹", "狂飙", "诡秘之主", "明朝那些事儿", "进击的巨人"],
    demo: true,
  };
}
