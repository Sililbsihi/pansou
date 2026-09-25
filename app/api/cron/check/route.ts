/**
 * 链接复检任务：轮转检测存量资源是否失效，更新状态
 * 触发方式：
 *   1. Vercel 定时任务：每天北京时间 05:00 自动调用（与抓取任务错开）
 *   2. 手动触发：浏览器打开 /api/cron/check?secret=<CRON_SECRET>
 */
import { NextRequest, NextResponse } from "next/server";
import { isDbConfigured, getAdminDb } from "@/lib/db";
import { checkResource, runPool } from "@/lib/validate";

export const maxDuration = 60;

const RECHECK_PER_RUN = 40; // 每次复检数量（60 秒预算内）
const CHECK_CONCURRENCY = 8;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
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
  const summary = { rechecked: 0, marked_invalid: 0, errors: [] as string[] };

  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "数据库未配置" }, { status: 500 });
  }
  const admin = getAdminDb();

  // 取最久未检测的一批（last_checked_at 最早的优先，空的排最前）
  const { data: batch, error } = await admin
    .from("resources")
    .select("id, share_url, pan_type, status")
    .order("last_checked_at", { ascending: true, nullsFirst: true })
    .limit(RECHECK_PER_RUN);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = (batch ?? []) as { id: number; share_url: string; pan_type: string; status: string }[];

  await runPool(rows, CHECK_CONCURRENCY, async (item) => {
    try {
      const result = await checkResource(item.pan_type as never, item.share_url);
      if (result === "unknown") {
        // 判断不了：只更新检测时间，不动状态（防误杀）
        await admin.from("resources").update({ last_checked_at: new Date().toISOString() }).eq("id", item.id);
      } else {
        if (result === "invalid") summary.marked_invalid++;
        await admin
          .from("resources")
          .update({ status: result, last_checked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("id", item.id);
      }
      summary.rechecked++;
    } catch (e) {
      summary.errors.push(`#${item.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
    return null;
  });

  try {
    await admin.from("sync_logs").insert({
      inserted: 0,
      fetched: 0,
      rechecked: summary.rechecked,
      marked_invalid: summary.marked_invalid,
      message: summary.errors.length ? summary.errors.join(" | ").slice(0, 900) : "ok",
      duration_ms: Date.now() - started,
    });
  } catch {}

  return NextResponse.json({
    ok: true,
    message: `复检完成：检测 ${summary.rechecked} 条，标记失效 ${summary.marked_invalid} 条`,
    ...summary,
    duration_ms: Date.now() - started,
  });
}
