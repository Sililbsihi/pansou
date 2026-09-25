/**
 * 资源抓取任务：从 PanSou 数据源拉取新资源入库
 * 触发方式：
 *   1. Vercel 定时任务：每天北京时间 04:00 自动调用（自动携带密钥）
 *   2. 手动触发：浏览器打开 /api/cron/sync?secret=<CRON_SECRET> 即可立即抓取
 * 安全：三种鉴权方式任一通过即可（Authorization 头 / x-cron-secret 头 / secret 查询参数）
 */
import { NextRequest, NextResponse } from "next/server";
import { isDbConfigured, getAdminDb, getDb } from "@/lib/db";
import { fetchFromSource, type NormalizedResource } from "@/lib/source";
import { runPool } from "@/lib/validate";
import { SYNC_KEYWORDS } from "@/lib/keywords";

// Vercel Hobby 档函数最长 60 秒（默认 10 秒不够用，必须显式声明）
export const maxDuration = 60;

const KEYWORDS_PER_RUN = 24;   // 每次抓取的关键词数量（池子约 6 天轮完一圈）
const FETCH_CONCURRENCY = 8;   // 并发抓取数

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // 未配置密钥时禁止执行
  const auth = req.headers.get("authorization") ?? "";
  const custom = req.headers.get("x-cron-secret") ?? "";
  const query = req.nextUrl.searchParams.get("secret") ?? "";
  return auth === `Bearer ${secret}` || custom === secret || query === secret;
}

/** 预热数据源：免费托管（如 Render）冷启动可能需要 20-50 秒，先唤醒再抓 */
async function prewarmSource(): Promise<void> {
  const base = process.env.SOURCE_API_URL;
  if (!base) return;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 40_000);
  try {
    await fetch(base, { signal: ctrl.signal, cache: "no-store" });
  } catch {
    // 预热失败不致命，后面的正式抓取会重试
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "未授权" }, { status: 401 });
  }

  const started = Date.now();
  const summary = { fetched: 0, inserted: 0, errors: [] as string[] };

  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "数据库未配置（Supabase 环境变量缺失）" }, { status: 500 });
  }
  const admin = getAdminDb();

  const sourceUrl = process.env.SOURCE_API_URL;
  if (!sourceUrl) {
    return NextResponse.json({ ok: false, error: "未配置 SOURCE_API_URL 环境变量，无法抓取。请在 Vercel → Settings → Environment Variables 中添加数据源地址后重新部署" });
  }

  // ---------- 1. 关键词选择：轮转池 + 近期真实热搜词 ----------
  // PanSou 对带空格的组合词（如“三体 电视剧”）会返回空结果，
  // 因此统一把关键词裁剪成首个词，并去重。
  const normalizeKeyword = (raw: string): string => (raw.trim().split(/\s+/)[0] ?? "").slice(0, 30);

  // 以网站上线日为基准顺序轮转：首日从池子头部热词开始，之后每天顺延一批
  const LAUNCH_DAY = Math.floor(Date.UTC(2026, 8, 25) / 86_400_000);
  const dayIndex = Math.max(0, Math.floor(Date.now() / 86_400_000) - LAUNCH_DAY);
  const kwSet = new Set<string>();
  for (let i = 0; i < KEYWORDS_PER_RUN && i < SYNC_KEYWORDS.length; i++) {
    const kw = normalizeKeyword(SYNC_KEYWORDS[(dayIndex * KEYWORDS_PER_RUN + i) % SYNC_KEYWORDS.length]);
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

  // ---------- 2. 预热 + 并发抓取 ----------
  await prewarmSource();

  const allItems: NormalizedResource[] = [];
  await runPool(keywords, FETCH_CONCURRENCY, async (kw) => {
    try {
      const items = await fetchFromSource(kw);
      allItems.push(...items);
      summary.fetched += items.length;
    } catch (e) {
      summary.errors.push(`${kw}: ${e instanceof Error ? e.message : String(e)}`);
    }
    return null;
  });

  // ---------- 3. 按链接去重后批量入库（已存在的跳过） ----------
  if (allItems.length > 0) {
    const byUrl = new Map(allItems.map((r) => [r.share_url, r]));
    const rows = Array.from(byUrl.values()).map((r) => ({
      title: r.title,
      description: r.description,
      category: r.category,
      pan_type: r.pan_type,
      share_url: r.share_url,
      extract_code: r.extract_code,
      file_size: r.file_size,
      status: "active",
      source: r.source,
    }));
    for (let i = 0; i < rows.length; i += 200) {
      const batch = rows.slice(i, i + 200);
      const { data, error } = await admin
        .from("resources")
        .upsert(batch, { onConflict: "share_url", ignoreDuplicates: true })
        .select("id");
      if (error) {
        summary.errors.push(`入库: ${error.message}`);
      } else {
        summary.inserted += data?.length ?? 0; // select 返回的才是真正新插入的行
      }
    }
  }

  // ---------- 4. 写同步日志 ----------
  try {
    await admin.from("sync_logs").insert({
      inserted: summary.inserted,
      fetched: summary.fetched,
      rechecked: 0,
      marked_invalid: 0,
      message: summary.errors.length ? summary.errors.join(" | ").slice(0, 900) : "ok",
      duration_ms: Date.now() - started,
    });
  } catch {}

  return NextResponse.json({
    ok: true,
    message: `抓取完成：共获取 ${summary.fetched} 条，新入库 ${summary.inserted} 条（重复自动跳过）`,
    keywords: keywords.length,
    ...summary,
    duration_ms: Date.now() - started,
  });
}
