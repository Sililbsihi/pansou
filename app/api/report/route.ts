/**
 * 失效反馈接口（访客可匿名调用）：
 * 写入 reports 表；同一资源累计 3 次反馈 → 自动标记为失效
 */
import { NextRequest, NextResponse } from "next/server";
import { isDbConfigured, getAdminDb } from "@/lib/db";

const REPORT_THRESHOLD = 3;

export async function POST(req: NextRequest) {
  let body: { id?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "参数错误" }, { status: 400 });
  }

  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: "参数错误" }, { status: 400 });
  }
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: true, demo: true }); // 演示模式直接返回成功
  }

  try {
    const admin = getAdminDb();
    const { error } = await admin.from("reports").insert({ resource_id: id });
    if (error) throw error;

    // 统计反馈次数，达到阈值自动标记失效
    const { count } = await admin
      .from("reports")
      .select("id", { count: "exact", head: true })
      .eq("resource_id", id);
    if ((count ?? 0) >= REPORT_THRESHOLD) {
      await admin
        .from("resources")
        .update({ status: "invalid", updated_at: new Date().toISOString() })
        .eq("id", id);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[反馈] 处理失败：", e);
    return NextResponse.json({ ok: false, error: "处理失败" }, { status: 500 });
  }
}
