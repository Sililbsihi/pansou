/** Supabase 服务端客户端（全部数据库访问只在服务端发生，密钥不进浏览器） */
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** 是否已配置 Supabase 环境变量；未配置时全站进入演示模式（内置示例数据） */
export function isDbConfigured(): boolean {
  return Boolean(url && anonKey && url.startsWith("http") && anonKey.length > 20);
}

/**
 * 强制绕过 Next.js 数据缓存的 fetch：
 * Next.js 会对服务端组件里的 fetch() 按请求 URL 做数据缓存（跨请求、跨部署共享），
 * 而 supabase-js 的查询 URL 是固定字符串——同一关键词的搜索结果会被缓存后永久复用，
 * 表现为"新抓到的资源在搜索页永远看不到"。这里统一加 cache:"no-store"，让每次查询都真实触达数据库。
 */
const noStoreFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, cache: "no-store" });

/** 匿名权限客户端（受 RLS 约束） */
export function getDb(): SupabaseClient {
  if (!url || !anonKey) throw new Error("缺少 SUPABASE_URL / SUPABASE_ANON_KEY 环境变量");
  return createClient(url, anonKey, {
    auth: { persistSession: false },
    global: { fetch: noStoreFetch },
  });
}

/** service_role 客户端：绕过 RLS，仅用于定时任务/管理接口，绝不能出现在客户端代码 */
export function getAdminDb(): SupabaseClient {
  if (!url || !serviceKey) throw new Error("缺少 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 环境变量");
  return createClient(url, serviceKey, {
    auth: { persistSession: false },
    global: { fetch: noStoreFetch },
  });
}
