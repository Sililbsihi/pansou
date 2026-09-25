/**
 * 链接失效检测器：逐网盘探测分享链接是否仍然有效。
 * 检测结果：active 有效 / invalid 失效 / unknown 无法判断（保持原状态）
 * 说明：百度、迅雷有风控策略，无法 100% 判断，尽力而为；
 *       判断失败统一返回 unknown，绝不误杀有效资源。
 */
import type { PanType, ResourceStatus } from "./types";

/** 带超时与 UA 的 GET */
async function get(url: string, ms = 8000): Promise<{ status: number; body: string } | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      cache: "no-store",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept-Language": "zh-CN,zh;q=0.9",
      },
    });
    const body = (await res.text()).slice(0, 20000); // 只需页面文本片段
    return { status: res.status, body };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 夸克网盘：官方 share token 接口，判断最可靠 */
async function checkQuark(url: string): Promise<ResourceStatus | "unknown"> {
  const m = url.match(/pan\.quark\.cn\/s\/([0-9a-zA-Z]+)/i);
  if (!m) return "unknown";
  const res = await fetch("https://drive-h.quark.cn/1/clouddrive/share/sharepage/token?pr=ucpro&fr=pc", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
    body: JSON.stringify({ pwd_id: m[1], passcode: "" }),
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!res) return "unknown";
  try {
    const json = (await res.json()) as { code?: number };
    if (json.code === 0) return "active";           // 分享存在
    if (json.code === 41008) return "invalid";      // 分享不存在/已取消
    if (json.code === 41009) return "active";       // 分享存在但需要提取码
    return "unknown";
  } catch {
    return "unknown";
  }
}

/** 蓝奏云：抓分享页文本判断 */
async function checkLanzou(url: string): Promise<ResourceStatus | "unknown"> {
  const r = await get(url);
  if (!r || r.status >= 500) return "unknown";
  if (r.status === 404) return "invalid";
  const b = r.body;
  if (b.includes("文件取消分享") || b.includes("文件不存在") || b.includes("已经被取消") || b.includes("文件已删除")) return "invalid";
  if (b.includes("fnl") || b.includes("文件名") || b.includes("down")) return "active";
  return "unknown";
}

/** 百度网盘：抓分享页文本判断（有验证码风控，尽力而为） */
async function checkBaidu(url: string): Promise<ResourceStatus | "unknown"> {
  const r = await get(url);
  if (!r) return "unknown";
  const b = r.body;
  if (b.includes("分享的文件已经被取消") || b.includes("分享已过期") || b.includes("你访问的页面不存在") || b.includes("链接不存在") || b.includes("分享已删除")) return "invalid";
  if (b.includes("百度安全验证")) return "unknown"; // 触发风控，无法判断
  if (b.includes("pan.baidu") || b.includes("分享的文件")) return "active";
  return "unknown";
}

/** 迅雷网盘：分享页为 SPA，尽力而为 */
async function checkXunlei(url: string): Promise<ResourceStatus | "unknown"> {
  const r = await get(url);
  if (!r) return "unknown";
  if (r.status === 404) return "invalid";
  const b = r.body;
  if (b.includes("分享已取消") || b.includes("链接不存在") || b.includes("任务不存在") || b.includes("已被取消")) return "invalid";
  if (b.includes("pan.xunlei.com") || b.includes("__NEXT_DATA__")) return "active";
  return "unknown";
}

/** 按网盘类型分发检测 */
export async function checkResource(panType: PanType, shareUrl: string): Promise<ResourceStatus | "unknown"> {
  try {
    switch (panType) {
      case "quark":
        return await checkQuark(shareUrl);
      case "lanzou":
        return await checkLanzou(shareUrl);
      case "baidu":
        return await checkBaidu(shareUrl);
      case "xunlei":
        return await checkXunlei(shareUrl);
      default:
        return "unknown";
    }
  } catch {
    return "unknown";
  }
}

/** 简单并发池：避免一次打太多请求被风控 */
export async function runPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}
