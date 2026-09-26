/**
 * 公开文档直链采集器（DuckDuckGo 网页版，免费无密钥）
 * 用途：外文/小众资源的通用兜底——在公开网络上找可直接打开的 pdf/epub/mobi/zip/cbz 等文档直链。
 * 国内外通用，不依赖任何网盘。尽力而为：被限流/超时/无结果时静默返回空，绝不影响主流程。
 */
import type { NormalizedResource } from "./source";
import { classifyCategory, parseFileSize } from "./meta";

const FILE_EXT = /\.(pdf|epub|mobi|azw3?|zip|cbz|cbr|txt|html?)$/i;
const ALLOWED_QUERY_EXT = ["pdf", "epub", "mobi", "azw3", "zip", "cbz", "txt"];

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function unwrapDdgHref(href: string): string | null {
  let h = decodeEntities(href);
  if (h.startsWith("//")) h = "https:" + h;
  // DDG 跳转链接：https://duckduckgo.com/l/?uddg=<encoded>&rut=...
  const m = h.match(/[?&]uddg=([^&]+)/);
  if (m) {
    try {
      h = decodeURIComponent(m[1]);
    } catch {
      return null;
    }
  }
  if (!/^https?:\/\//i.test(h)) return null;
  return h;
}

export async function fetchFromWebDocs(keyword: string, timeoutMs = 15000): Promise<NormalizedResource[]> {
  const q = String(keyword ?? "").trim();
  if (!q) return [];

  const query = `${q} (filetype:${ALLOWED_QUERY_EXT.join(" OR filetype:")})`;
  const url = "https://html.duckduckgo.com/html/?q=" + encodeURIComponent(query);

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      cache: "no-store",
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "accept-language": "en-US,en;q=0.9,zh-CN;q=0.8",
      },
    });
    if (!res.ok) return [];
    const html = await res.text();

    const out: NormalizedResource[] = [];
    const seen = new Set<string>();
    const linkRe = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    let m: RegExpExecArray | null;
    while ((m = linkRe.exec(html)) && out.length < 12) {
      const finalUrl = unwrapDdgHref(m[1]);
      if (!finalUrl || seen.has(finalUrl)) continue;
      const pathOnly = finalUrl.split("#")[0].split("?")[0];
      // 只收直链文档；网页文章类链接跳过（那些不是可直接取用的资源）
      if (!FILE_EXT.test(pathOnly)) continue;
      seen.add(finalUrl);

      const title = decodeEntities(m[2].replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
      if (!title || title.length < 4) continue;

      out.push({
        title: `${title} [文档直链]`.slice(0, 200),
        description: "来源：公开网络文档（pdf/epub/zip 直链，无需网盘）",
        category: classifyCategory(title),
        pan_type: "other",
        share_url: finalUrl,
        extract_code: null,
        file_size: parseFileSize(title),
        source: "webdocs",
        published_at: null,
      });
    }
    return out;
  } catch {
    return []; // 兜底源失败静默
  } finally {
    clearTimeout(timer);
  }
}
