/**
 * 运行时诊断端点（需 CRON_SECRET）：
 * 用网站自己的环境变量和连接，把搜索相关的每一步原始结果拍下来，
 * 用于定位"编辑器能查到、网站查不到"类问题。
 * 用法：/api/debug-search?secret=<CRON_SECRET>&q=关键词
 */
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getDb } from "@/lib/db";

export const maxDuration = 60;

/** 指纹：不泄露完整密钥，但能判断两把钥匙是否相同 */
function fp(key: string | undefined): string {
  if (!key) return "(未设置)";
  return `${key.slice(0, 6)}…(长度${key.length},sha=${createHash("sha256").update(key).digest("hex").slice(0, 8)})`;
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.nextUrl.searchParams.get("secret") !== secret) {
    return NextResponse.json({ ok: false, error: "未授权" }, { status: 401 });
  }

  const q = (req.nextUrl.searchParams.get("q") ?? "长生君").trim().split(/\s+/)[0] ?? "长生君";
  const url = (process.env.SUPABASE_URL ?? "").replace(/\/+$/, "");
  const anon = process.env.SUPABASE_ANON_KEY ?? "";
  const out: Record<string, unknown> = {
    keyword: q,
    env_SUPABASE_URL: url || "(未设置)",
    env_SUPABASE_ANON_KEY: fp(anon),
    env_SERVICE_ROLE: fp(process.env.SUPABASE_SERVICE_ROLE_KEY),
  };

  const headers = { apikey: anon, Authorization: `Bearer ${anon}` };

  // A1：编码后的通配符（与 supabase-js 行为一致）
  const enc = encodeURIComponent(`%${q}%`);
  try {
    const r = await fetch(`${url}/rest/v1/resources?title=ilike.${enc}&select=title,pan_type&limit=5`, {
      headers, cache: "no-store",
    });
    out["A1_标题模糊查询_编码通配符"] = { status: r.status, body: (await r.text()).slice(0, 500) };
  } catch (e) {
    out["A1_标题模糊查询_编码通配符"] = { error: String(e) };
  }

  // A2：原始通配符（不编码 %，测试解析差异）
  try {
    const r = await fetch(`${url}/rest/v1/resources?title=ilike.%${q}%&select=title&limit=5`, {
      headers, cache: "no-store",
    });
    out["A2_标题模糊查询_原始通配符"] = { status: r.status, body: (await r.text()).slice(0, 500) };
  } catch (e) {
    out["A2_标题模糊查询_原始通配符"] = { error: String(e) };
  }

  // B：supabase-js 同款查询（与搜索页完全一致）
  try {
    const { count, error } = await getDb()
      .from("resources")
      .select("id", { count: "exact", head: true })
      .ilike("title", `%${q}%`);
    out["B_supabaseJs同款搜索"] = { count, error: error?.message ?? null };
  } catch (e) {
    out["B_supabaseJs同款搜索"] = { error: String(e) };
  }

  // C：数据库函数 search_resources
  try {
    const { data, error } = await getDb().rpc("search_resources", { p_query: q, p_per: 5 });
    const first = (data as { total?: number }[])?.[0];
    out["C_搜索函数"] = { error: error?.message ?? null, total: first?.total ?? null };
  } catch (e) {
    out["C_搜索函数"] = { error: String(e) };
  }

  // D：表总行数（匿名）
  try {
    const { count, error } = await getDb().from("resources").select("id", { count: "exact", head: true });
    out["D_表总行数"] = { count, error: error?.message ?? null };
  } catch (e) {
    out["D_表总行数"] = { error: String(e) };
  }

  return NextResponse.json({ ok: true, ...out });
}
