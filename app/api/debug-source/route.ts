/**
 * 源站配置诊断（无密钥，只暴露非敏感信息）：
 * 1. 打印前端实际配置的 SOURCE_API_URLS / SOURCE_API_URL（公网地址，非机密）
 * 2. 逐个连通性探测：真实发一次搜索，报告状态码/耗时/结果数
 * 用途：定位"抓取失败/连错实例"类问题。
 */
import { NextResponse } from "next/server";

export const maxDuration = 60;

export async function GET() {
  const raw = [process.env.SOURCE_API_URLS ?? "", process.env.SOURCE_API_URL ?? ""]
    .join(",")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const bases = raw.length > 0 ? raw : ["(未配置——抓取功能会报错)"];

  const probes = await Promise.all(
    bases.slice(0, 5).map(async (base) => {
      if (base.startsWith("(")) return { base, note: "跳过探测" };
      const t0 = Date.now();
      try {
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), 45000);
        const res = await fetch(base.replace(/\/+$/, "") + "/api/search?kw=" + encodeURIComponent("长生君") + "&res=merge", {
          signal: ac.signal,
          cache: "no-store",
        });
        clearTimeout(timer);
        const body = (await res.text()).slice(0, 400);
        let total: number | null = null;
        try {
          total = JSON.parse(body)?.data?.total ?? null;
        } catch {}
        return {
          base,
          状态码: res.status,
          耗时ms: Date.now() - t0,
          结果总数: total,
          原文片段: body.slice(0, 200),
        };
      } catch (e) {
        return { base, 耗时ms: Date.now() - t0, 错误: String(e).slice(0, 200) };
      }
    })
  );

  // 组合词语法探针：四种 AND 写法各测一发，定位 or()/and() 语法问题
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const probeDb = async (label: string, build: (qb: any) => any) => {
    try {
      const { isDbConfigured, getDb } = await import("@/lib/db");
      if (!isDbConfigured()) return { label, note: "未配置 Supabase" };
      let qb = build(getDb().from("resources").select("title", { count: "exact" }));
      const { count, error } = await qb.limit(1);
      return { label, 命中: count ?? null, 错误: error?.message ?? null };
    } catch (e) {
      return { label, 错误: e instanceof Error ? e.message : String(e) };
    }
  };

  const dbProbes = await Promise.all([
    probeDb("P1_链式ilike(且,小绿+小蓝)", (qb: any) => qb.ilike("title", "%小绿%").ilike("title", "%小蓝%")),
    probeDb("P2_or嵌套and(ilike.*写法)", (qb: any) => qb.or("and(title.ilike.*小绿*,title.ilike.*小蓝*)")),
    probeDb("P3_纯or(小绿,小蓝)", (qb: any) => qb.or("title.ilike.*小绿*,title.ilike.*小蓝*")),
    probeDb("P4_基线ilike(小绿)", (qb: any) => qb.ilike("title", "%小绿%")),
  ]);

  return NextResponse.json(
    {
      ok: true,
      配置的源站列表: bases,
      探测结果: probes,
      数据库语法探针: dbProbes,
      提示: "若某 base 显示 404/超时/错误 → 该地址不可用；对照 Render 控制台的真实地址修正 Vercel 的 SOURCE_API_URLS",
    },
    { headers: { "cache-control": "no-store" } }
  );
}
