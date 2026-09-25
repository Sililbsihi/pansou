/**
 * 每日定时任务（Vercel Cron 每天北京时间 04:00 自动调用）：
 *  1. 抓取：按关键词轮转池 + 近期热搜词，从 PanSou 数据源拉取新资源，去重入库
 *  2. 复检：轮转检测一批存量链接的有效性，更新「有效/失效」状态
 *  3. 日志：写入 sync_logs 便于排查
 * 安全：需要 CRON_SECRET（Vercel Cron 自动携带 Authorization: Bearer <CRON_SECRET>）
 */
import { NextRequest, NextResponse } from "next/server";
import { isDbConfigured, getAdminDb, getDb } from "@/lib/db";
import { fetchFromSource } from "@/lib/source";
import { checkResource, runPool } from "@/lib/validate";
import { SYNC_KEYWORDS } from "@/lib/keywords";
import type { Resource } from "@/lib/types";

// 单次任务的规模控制（免费档执行时长有限，控制在数分钟内完成）
const KEYWORDS_PER_RUN = 24;   // 每次抓取的关键词数量（池子 6 天轮完一圈）
const RECHECK_PER_RUN = 60;    // 每次复检的存量链接数量

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // 未配置密钥时禁止执行
  const auth = req.headers.get("authorization") ?? "";
  const custom = req.headers.get("x-cron-secret") ?? "";
  return auth === `Bearer ${secret}` || custom === secret;
}

/** 依据日期轮转选出本次抓取的关键词（含热搜词） */
async function pickKeywords(db: ReturnType<typeof getDb> | null): Promise<string[]> {
  const day = Math.floor(Date.now() / 86400000);
  const start = (day * KEYWORDS_PER_RUN) % SYNC_KEYWORDS.length;
  const pool = SYNC_KEYWORDS.slice(start, start + KEYWORDS_PER_RUN);
  if (pool.length < KEYWORDS_PER_RUN) pool.push(...SYNC_KEYWORDS.slice(0, KEYWORDS_PER_RUN - pool.length));

  // 追加近期热搜词（用户真实需求优先）
  if (db) {
    try {
      const { data } = await db.rpc("get_hot_keywords", { p_limit: 10 });
      if (data) for (const d of data as { keyword: string }[]) if (!pool.includes(d.keyword)) pool.push(d.keyword);
    } catch {}
  }
  return pool;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "未授权" }, { status: 401 });
  }
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "未配置 Supabase，定时任务不执行" }, { status: 400 });
  }

  const admin = getAdminDb();
  const started = Date.now();
  const summary = { keywords: 0, fetched: 0, inserted: 0, rechecked: 0, marked_invalid: 0, errors: [] as string[] };

  // ---------- 1. 抓取新资源 ----------
  if (!process.env.SOURCE_API_URL) {
    summary.errors.push("未配置 SOURCE_API_URL，跳过抓取");
  } else {
    const db = getDb();
    const keywords = await pickKeywords(db);
    summary.keywords = keywords.length;

    for (const kw of keywords) {
      try {
        const items = await fetchFromSource(kw);
        summary.fetched += items.length;
        if (items.length === 0) continue;

        // 用 share_url 判重：只插入数据库里还没有的链接
        const urls = items.map((i) => i.share_url);
        const { data: existing } = await admin
          .from("resources")
          .select("share_url")
          .in("share_url", urls);
        const known = new Set((existing ?? []).map((e: { share_url: string }) => e.share_url));
        const fresh = items.filter((i) => !known.has(i.share_url));
        if (fresh.length === 0) continue;

        const rows = fresh.map((i) => ({
          title: i.title,
          description: i.description,
          category: i.category,
          pan_type: i.pan_type,
          share_url: i.share_url,
          extract_code: i.extract_code,
          file_size: i.file_size,
          status: "active" as const, // 新入库默认有效，等待复检确认
          source: i.source,
        }));
        const { error } = await admin.from("resources").insert(rows);
        if (error) summary.errors.push(`插入失败(${kw}): ${error.message}`);
        else summary.inserted += fresh.length;
      } catch (e) {
        summary.errors.push(`抓取失败(${kw}): ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  // ---------- 2. 轮转复检存量链接 ----------
  try {
    const { data: batch, error } = await admin
      .from("resources")
      .select("id, share_url, pan_type")
      .order("last_checked_at", { ascending: true, nullsFirst: true })
      .limit(RECHECK_PER_RUN);
    if (error) throw error;

    if (batch && batch.length > 0) {
      await runPool(batch as Pick<Resource, "id" | "share_url" | "pan_type">[], 6, async (item) => {
        const result = await checkResource(item.pan_type, item.share_url);
        summary.rechecked++;
        if (result === "unknown") {
          // 无法判断：只刷新检测时间，不改状态
          await admin.from("resources").update({ last_checked_at: new Date().toISOString() }).eq("id", item.id);
        } else {
          if (result === "invalid") summary.marked_invalid++;
          await admin
            .from("resources")
            .update({ status: result, last_checked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq("id", item.id);
        }
        return null;
      });
    }
  } catch (e) {
    summary.errors.push(`复检失败: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ---------- 3. 写同步日志 ----------
  try {
    await admin.from("sync_logs").insert({
      inserted: summary.inserted,
      fetched: summary.fetched,
      rechecked: summary.rechecked,
      marked_invalid: summary.marked_invalid,
      message: summary.errors.length ? summary.errors.join(" | ").slice(0, 900) : "ok",
      duration_ms: Date.now() - started,
    });
  } catch {}

  return NextResponse.json({ ok: true, ...summary, duration_ms: Date.now() - started });
}
