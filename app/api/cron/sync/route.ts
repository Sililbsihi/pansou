/**
 * 资源抓取任务：从 PanSou 数据源拉取新资源入库
 * 触发方式：
 *   1. Vercel 定时任务：每天北京时间 04:00（抓取）/ 05:00（复检）自动调用
 *   2. 手动触发：/api/cron/sync?secret=<CRON_SECRET>
 *      可选参数：
 *        &all=1     全库刷新模式
 *        &start=N   全库刷新分段起点（池子较大，60 秒限额内分段执行；
 *                   每个关键词抓完立即入库，即使超时也不丢进度）
 * 安全：Authorization 头 / x-cron-secret 头 / secret 查询参数 任一通过即可
 */
import { NextRequest, NextResponse } from "next/server";
import { isDbConfigured, getAdminDb, getDb } from "@/lib/db";
import { fetchFromSource, prewarmSources, getSourceUrls, type NormalizedResource } from "@/lib/source";
import { runPool } from "@/lib/validate";
import { SYNC_KEYWORDS } from "@/lib/keywords";

// Vercel Hobby 档函数最长 60 秒（默认 10 秒不够用，必须显式声明）
export const maxDuration = 60;

const KEYWORDS_PER_RUN = 24;        // 每次抓取的关键词数量（池子约 2~3 天轮完一圈）
const SWEEP_CHUNK = 30;             // 全库刷新模式：每段处理的关键词数量
const FETCH_CONCURRENCY = 8;        // 普通抓取并发数（走数据源缓存，快）
const REFRESH_CONCURRENCY = 4;      // 强制刷新并发数（绕过缓存，慢，避免拖垮总时长）
const ONGOING_REFRESH_PER_RUN = 12; // 每次强制刷新的追更词上限

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // 未配置密钥时禁止执行
  const auth = req.headers.get("authorization") ?? "";
  const custom = req.headers.get("x-cron-secret") ?? "";
  const query = req.nextUrl.searchParams.get("secret") ?? "";
  return auth === `Bearer ${secret}` || custom === secret || query === secret;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "未授权" }, { status: 401 });
  }

  const started = Date.now();
  const summary = { fetched: 0, written: 0, errors: [] as string[] };

  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "数据库未配置（Supabase 环境变量缺失）" }, { status: 500 });
  }
  const admin = getAdminDb();

  if (!process.env.SOURCE_API_URL && !process.env.SOURCE_API_URLS) {
    return NextResponse.json({ ok: false, error: "未配置 SOURCE_API_URL(S) 环境变量，无法抓取" });
  }

  // ---------- 1. 关键词选择：轮转池（或全库分段） + 近期真实热搜词 ----------
  // PanSou 对带空格的组合词（如“三体 电视剧”）会返回空结果，
  // 因此统一把关键词裁剪成首个词，并去重。
  const normalizeKeyword = (raw: string): string => (raw.trim().split(/\s+/)[0] ?? "").slice(0, 30);

  // ?all=1 全库刷新模式：配合 ?start=N 分段执行（每段 SWEEP_CHUNK 个词，抓完立即入库）
  const fullSweep = req.nextUrl.searchParams.get("all") === "1";
  const start = Math.max(0, parseInt(req.nextUrl.searchParams.get("start") ?? "0", 10) || 0);
  // 以网站上线日为基准顺序轮转：首日从池子头部热词开始，之后每天顺延一批
  const LAUNCH_DAY = Math.floor(Date.UTC(2026, 8, 25) / 86_400_000);
  const dayIndex = Math.max(0, Math.floor(Date.now() / 86_400_000) - LAUNCH_DAY);
  const kwSet = new Set<string>();
  const wordCount = fullSweep
    ? Math.min(SWEEP_CHUNK, Math.max(0, SYNC_KEYWORDS.length - start))
    : Math.min(KEYWORDS_PER_RUN, SYNC_KEYWORDS.length);
  for (let i = 0; i < wordCount; i++) {
    const src = fullSweep ? start + i : (dayIndex * KEYWORDS_PER_RUN + i) % SYNC_KEYWORDS.length;
    const kw = normalizeKeyword(SYNC_KEYWORDS[src]);
    if (kw) kwSet.add(kw);
  }
  try {
    const { data } = await getDb().rpc("get_hot_keywords", { p_limit: 10 });
    if (Array.isArray(data)) {
      for (const row of data as { keyword: string }[]) {
        const kw = normalizeKeyword(row.keyword ?? "");
        if (kw) kwSet.add(kw);
      }
    }
  } catch {
    // 热搜词获取失败不影响主流程
  }
  const keywords = Array.from(kwSet);

  // ---------- 1.5 识别追更词：已收录资源标题带“更新至/连载中”的词，每天强制刷新抓取 ----------
  const refreshSet = new Set<string>();
  try {
    const { data: ongoingRows } = await admin
      .from("resources")
      .select("title")
      .or("title.ilike.%更新至%,title.ilike.%连载中%")
      .limit(300);
    const ongoingTitles = (ongoingRows ?? []).map((r: { title: string }) => r.title ?? "");
    for (const kw of keywords) {
      if (ongoingTitles.some((t) => t.includes(kw))) refreshSet.add(kw);
    }
    const capped = Array.from(refreshSet).slice(0, ONGOING_REFRESH_PER_RUN);
    refreshSet.clear();
    for (const kw of capped) refreshSet.add(kw);
  } catch {
    // 追更词识别失败不影响主流程
  }
  const normalKeywords = keywords.filter((kw) => !refreshSet.has(kw));

  // ---------- 2. 预热数据源 ----------
  await prewarmSources();

  // ---------- 3. 并发抓取 + 逐词即时入库（增量式：即使超时也不丢已完成进度） ----------
  const seen = new Set<string>();
  async function fetchAndPersist(kw: string, refresh: boolean) {
    try {
      const items = await fetchFromSource(kw, { refresh });
      summary.fetched += items.length;
      await persistItems(admin, items, seen, summary);
    } catch (e) {
      summary.errors.push(`${kw}: ${e instanceof Error ? e.message : String(e)}`);
    }
    return null;
  }
  await runPool(normalKeywords, FETCH_CONCURRENCY, (kw) => fetchAndPersist(kw, false));
  await runPool(Array.from(refreshSet), REFRESH_CONCURRENCY, (kw) => fetchAndPersist(kw, true));

  // ---------- 4. 写同步日志 ----------
  try {
    await admin.from("sync_logs").insert({
      inserted: summary.written,
      fetched: summary.fetched,
      rechecked: 0,
      marked_invalid: 0,
      message: summary.errors.length ? summary.errors.join(" | ").slice(0, 900) : "ok",
      duration_ms: Date.now() - started,
    });
  } catch {}

  const nextStart = fullSweep && start + SWEEP_CHUNK < SYNC_KEYWORDS.length ? start + SWEEP_CHUNK : null;
  return NextResponse.json({
    ok: true,
    message: `抓取完成：处理 ${keywords.length} 个关键词，获取 ${summary.fetched} 条，写入（含更新） ${summary.written} 条`,
    mode: fullSweep ? `全库刷新 ${start}-${start + keywords.length - 1}` : "常规轮转",
    keywords: keywords.length,
    next_start: nextStart,
    ...summary,
    duration_ms: Date.now() - started,
  });
}

/** 把归一化资源写入数据库：按链接去重；冲突时更新标题等信息为最新 */
async function persistItems(
  admin: ReturnType<typeof getAdminDb>,
  items: NormalizedResource[],
  seen: Set<string>,
  summary: { errors: string[] }
) {
  const fresh: NormalizedResource[] = [];
  for (const r of items) {
    if (seen.has(r.share_url)) continue;
    seen.add(r.share_url);
    fresh.push(r);
  }
  if (fresh.length === 0) return;
  const rows = fresh.map((r) => ({
    title: r.title,
    description: r.description,
    category: r.category,
    pan_type: r.pan_type,
    share_url: r.share_url,
    extract_code: r.extract_code,
    file_size: r.file_size,
    status: "active",
    source: r.source,
    updated_at: new Date().toISOString(),
  }));
  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200);
    const { error } = await admin.from("resources").upsert(batch, { onConflict: "share_url" });
    if (error) {
      // 批量失败（如个别字段异常）时降级为逐条写入，保证其余数据不中断
      for (const row of batch) {
        const { error: rowErr } = await admin.from("resources").upsert(row, { onConflict: "share_url" });
        if (rowErr) summary.errors.push(`入库: ${rowErr.message}`);
      }
    }
  }
}
