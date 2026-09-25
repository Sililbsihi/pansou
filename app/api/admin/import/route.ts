/**
 * 管理端批量导入接口（需要 ADMIN_TOKEN，仅限本机/脚本使用）：
 * POST /api/admin/import   Header: x-admin-token: <ADMIN_TOKEN>
 * Body: { "items": [{ "title": "...", "share_url": "https://pan.baidu.com/s/xxx",
 *                     "extract_code": "1234", "file_size": 12345678,
 *                     "category": "tv", "pan_type": "baidu" }] }
 * 未传 category / pan_type / file_size 时按规则自动识别
 */
import { NextRequest, NextResponse } from "next/server";
import { isDbConfigured, getAdminDb } from "@/lib/db";
import { detectPanType, classifyCategory, parseFileSize } from "@/lib/meta";
import type { Category, PanType } from "@/lib/types";

interface ImportItem {
  title?: string;
  share_url?: string;
  extract_code?: string | null;
  file_size?: number | null;
  category?: string;
  pan_type?: string;
  description?: string | null;
  source?: string;
}

const VALID_CATEGORIES: Category[] = ["tv", "movie", "tvshow", "anime", "novel", "comic", "book", "other"];
const VALID_PANS: PanType[] = ["baidu", "quark", "xunlei", "lanzou", "other"];

export async function POST(req: NextRequest) {
  const token = req.headers.get("x-admin-token");
  if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
    return NextResponse.json({ ok: false, error: "未授权" }, { status: 401 });
  }
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "未配置 Supabase" }, { status: 400 });
  }

  let body: { items?: ImportItem[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON 格式错误" }, { status: 400 });
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ ok: false, error: "items 不能为空" }, { status: 400 });
  }
  if (body.items.length > 500) {
    return NextResponse.json({ ok: false, error: "单次最多 500 条" }, { status: 400 });
  }

  // 规范化 + 按 share_url 去重
  const rows = new Map<string, Record<string, unknown>>();
  for (const it of body.items) {
    const url = (it.share_url ?? "").trim();
    const title = (it.title ?? "").trim();
    if (!url.startsWith("http") || !title) continue;
    const pan = VALID_PANS.includes(it.pan_type as PanType) ? (it.pan_type as PanType) : detectPanType(url);
    if (pan === "other" && !it.pan_type) continue; // 无法识别网盘的跳过
    const category = VALID_CATEGORIES.includes(it.category as Category) ? (it.category as Category) : classifyCategory(title);
    rows.set(url, {
      title: title.slice(0, 200),
      description: it.description ?? null,
      category,
      pan_type: pan,
      share_url: url,
      extract_code: it.extract_code?.slice(0, 10) ?? null,
      file_size: it.file_size ?? parseFileSize(title),
      status: "active",
      source: it.source ?? "手动导入",
    });
  }

  const { error } = await getAdminDb()
    .from("resources")
    .upsert(Array.from(rows.values()), { onConflict: "share_url", ignoreDuplicates: true });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, received: body.items.length, imported: rows.size });
}
