/**
 * 访客即时抓取接口：搜索不到 / 资源不是最新时，访客可点击按钮强制全网抓取该关键词
 * 安全与限流（全部服务端校验，密钥不出服务器）：
 *   - 同一关键词 10 分钟内仅允许抓取一次
 *   - 每个访客（IP 哈希）每小时最多 10 次
 *   - 全站每小时最多 60 次
 */
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { isDbConfigured, getAdminDb } from "@/lib/db";
import { fetchFromSource } from "@/lib/source";

export const maxDuration = 60;

const SAME_KEYWORD_COOLDOWN_MS = 10 * 60_000; // 同词冷却 10 分钟
const PER_IP_LIMIT = 10;                     // 每 IP 每小时
const GLOBAL_LIMIT = 60;                     // 全站每小时

/** 关键词规范化：PanSou 对组合词搜索效果差，取首个词 */
function normalizeKeyword(raw: string): string {
  return (String(raw ?? "").trim().split(/\s+/)[0] ?? "").slice(0, 30);
}

/** 访客 IP 哈希（加盐，不存原始 IP） */
function hashIp(req: NextRequest): string {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  return createHash("sha256").update(`${ip}|${process.env.CRON_SECRET ?? "pansou-salt"}`).digest("hex").slice(0, 32);
}

export async function POST(req: NextRequest) {
  let body: { keyword?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "参数错误" }, { status: 400 });
  }

  const kw = normalizeKeyword(body.keyword ?? "");
  if (!kw) {
    return NextResponse.json({ ok: false, error: "关键词不能为空" }, { status: 400 });
  }
  if (!process.env.SOURCE_API_URL) {
    return NextResponse.json({ ok: false, error: "数据源未配置，暂不支持即时抓取" }, { status: 500 });
  }
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "演示模式不支持即时抓取" }, { status: 500 });
  }

  const admin = getAdminDb();
  const now = Date.now();

  try {
    // ---- 限流校验 ----
    const { count: kwCount } = await admin
      .from("fetch_jobs")
      .select("id", { count: "exact", head: true })
      .eq("keyword", kw)
      .gte("created_at", new Date(now - SAME_KEYWORD_COOLDOWN_MS).toISOString());
    if ((kwCount ?? 0) > 0) {
      return NextResponse.json({ ok: false, error: `「${kw}」刚抓取过（10 分钟内只允许一次），请稍后再试` }, { status: 429 });
    }

    const ip = hashIp(req);
    const { count: ipCount } = await admin
      .from("fetch_jobs")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", ip)
      .gte("created_at", new Date(now - 3600_000).toISOString());
    if ((ipCount ?? 0) >= PER_IP_LIMIT) {
      return NextResponse.json({ ok: false, error: "操作太频繁啦，每小时最多 10 次，请稍后再试" }, { status: 429 });
    }

    const { count: globalCount } = await admin
      .from("fetch_jobs")
      .select("id", { count: "exact", head: true })
      .gte("created_at", new Date(now - 3600_000).toISOString());
    if ((globalCount ?? 0) >= GLOBAL_LIMIT) {
      return NextResponse.json({ ok: false, error: "当前全网抓取请求较多，请 1 小时后再试" }, { status: 429 });
    }

    // ---- 记录抓取任务（先记录再抓，防并发重复） ----
    await admin.from("fetch_jobs").insert({ keyword: kw, ip_hash: ip });

    // ---- 强制刷新抓取（绕过数据源缓存，拿当天最新分享） ----
    const items = await fetchFromSource(kw, { refresh: true, timeoutMs: 45000 });

    // ---- 去重入库 ----
    let inserted = 0;
    if (items.length > 0) {
      const byUrl = new Map(items.map((r) => [r.share_url, r]));
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
        if (error) throw new Error(`入库失败: ${error.message}`);
        inserted += data?.length ?? 0;
      }
    }

    return NextResponse.json({
      ok: true,
      message: inserted > 0
        ? `全网搜索完成：获取 ${items.length} 条，新收录 ${inserted} 条，页面马上刷新`
        : `全网搜索完成：暂未找到「${kw}」的新资源，建议明天再试或换个说法搜索`,
      fetched: items.length,
      inserted,
    });
  } catch (e) {
    console.error("[即时抓取] 失败：", e);
    return NextResponse.json({ ok: false, error: "抓取失败，请稍后再试" }, { status: 500 });
  }
}
