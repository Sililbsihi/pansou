/** Supabase 服务端客户端（全部数据库访问只在服务端发生，密钥不进浏览器） */
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** 是否已配置 Supabase 环境变量；未配置时全站进入演示模式（内置示例数据） */
export function isDbConfigured(): boolean {
  return Boolean(url && anonKey && url.startsWith("http") && anonKey.length > 20);
}

/** 匿名权限客户端（受 RLS 约束） */
export function getDb(): SupabaseClient {
  if (!url || !anonKey) throw new Error("缺少 SUPABASE_URL / SUPABASE_ANON_KEY 环境变量");
  return createClient(url, anonKey, { auth: { persistSession: false } });
}

/** service_role 客户端：绕过 RLS，仅用于定时任务/管理接口，绝不能出现在客户端代码 */
export function getAdminDb(): SupabaseClient {
  if (!url || !serviceKey) throw new Error("缺少 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 环境变量");
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}
