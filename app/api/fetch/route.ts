/**
 * 访客即时抓取接口：搜索不到 / 资源不是最新时，一键强制全网抓取该关键词（绕过缓存拿最新）
 * 本站仅站长本人使用，按站长要求未加限流。
 */
import { NextRequest, NextResponse } from "next/server";
import { isDbConfigured, getAdminDb } from "@/lib/db";
import { fetchFromSource, prewarmSources } from "@/lib/source";

export const maxDuration = 60;

/**
 * 多词关键词生成抓取变体（提升英文/外文标题召回）：
 * "mile high" → ["mile", "milehigh", "mile high"]
 * 网盘分享标题常写成无空格（MileHigh）或完整短语，只抓首词会漏。
 * 三个变体并行抓取，结果按 share_url 去重，不会重复入库。
 */
function keywordVariants(raw: string): string[] {
  const full = String(raw ?? "").trim().slice(0, 30);
  if (!full) return [];
  const parts = full.split(/\s+/);
  if (parts.length < 2) return [parts[0].slice(0, 30)];
  const first = parts[0].slice(0, 30);
  const compact = parts.join("").slice(0, 30);
  return [...new Set([first, compact, full])].slice(0, 3);
}

export async function POST(req: NextRequest) {
  let body: { keyword?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "参数错误" }, { status: 400 });
  }

  const variants = keywordVariants(body.keyword ?? "");
  const kw = variants[0] ?? "";
  const displayKw = String(body.keyword ?? "").trim().slice(0, 30) || kw;
  if (!kw) {
    return NextResponse.json({ ok: false, error: "关键词不能为空" }, { status: 400 });
  }
  if (!process.env.SOURCE_API_URL && !process.env.SOURCE_API_URLS) {
    return NextResponse.json({ ok: false, error: "数据源未配置，暂不支持即时抓取" }, { status: 500 });
  }
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "演示模式不支持即时抓取" }, { status: 500 });
  }

  const admin = getAdminDb();

  try {
    // 先预热数据源（Render 免费实例休眠时唤醒需要 20~50 秒，不预热会全部超时）
    await prewarmSources();

    // 多变体并行抓取（refresh=true 绕过数据源缓存，拿最新分享）
    const sourceErrors: string[] = [];
    const settled = await Promise.allSettled(
      variants.map((v) =>
        fetchFromSource(v, {
          refresh: true,
          timeoutMs: 45000,
          onSourceError: (base, reason) => sourceErrors.push(`${base}: ${reason}`),
        })
      )
    );
    const items = settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
    const allFailed = settled.every((r) => r.status === "rejected");

    // 全部数据源都访问失败 → 如实报错（而不是误报“没人分享”）
    if (allFailed && sourceErrors.length > 0) {
      return NextResponse.json(
        { ok: false, error: `数据源暂时无法访问（可能正在唤醒或被限流），请 30 秒后重试。详情：${sourceErrors.join("；").slice(0, 200)}` },
        { status: 502 }
      );
    }

    // 按链接去重后入库（已存在的自动跳过）
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
        updated_at: new Date().toISOString(),
      }));
      for (let i = 0; i < rows.length; i += 200) {
        const batch = rows.slice(i, i + 200);
        const { data, error } = await admin
          .from("resources")
          .upsert(batch, { onConflict: "share_url" })
          .select("id");
        if (error) throw new Error(`入库失败: ${error.message}`);
        inserted += data?.length ?? 0;
      }
    }

    return NextResponse.json({
      ok: true,
      message:
        inserted > 0
          ? `全网搜索完成：获取 ${items.length} 条，新收录 ${inserted} 条，页面马上刷新`
          : items.length > 0
            ? `全网搜索完成：找到 ${items.length} 条，库里都已收录过（无新增）`
            : `全网搜索完成：全网暂时还没人分享「${displayKw}」，建议过几天再试`,
      fetched: items.length,
      inserted,
    });
  } catch (e) {
    console.error("[即时抓取] 失败：", e);
    return NextResponse.json({ ok: false, error: `抓取失败：${e instanceof Error ? e.message : "请稍后再试"}` }, { status: 500 });
  }
}
