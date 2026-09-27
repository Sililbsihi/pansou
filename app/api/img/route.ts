/**
 * TMDB 海报图代理：
 * 大陆直连 image.tmdb.org 不稳，由 Vercel 服务端代理转发并加长缓存。
 * 用法：/api/img?p=/t/p/w342/xxx.jpg&s=w342
 */
import { NextRequest, NextResponse } from "next/server";

export const revalidate = 86400;

const ALLOWED_SIZES = new Set(["w185", "w342"]);
const ALLOWED_PREFIX = "/t/p/";

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams.get("p") ?? "";
  const s = req.nextUrl.searchParams.get("s") ?? "w342";

  if (!p.startsWith(ALLOWED_PREFIX) || p.includes("..") || !ALLOWED_SIZES.has(s)) {
    return NextResponse.json({ ok: false, error: "非法参数" }, { status: 400 });
  }

  const upstream = `https://image.tmdb.org${p.replace(ALLOWED_PREFIX, `/t/p/${s}/`)}`;
  try {
    const img = await fetch(upstream, { next: { revalidate: 86400 } });
    if (!img.ok) return NextResponse.json({ ok: false, error: `上游 ${img.status}` }, { status: 502 });
    const buf = await img.arrayBuffer();
    return new NextResponse(buf, {
      headers: {
        "content-type": img.headers.get("content-type") ?? "image/jpeg",
        "cache-control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "图片代理失败" }, { status: 502 });
  }
}
