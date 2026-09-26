/**
 * Open Library（国际开放图书馆，openlibrary.org）适配器
 * 用途：英文/外文书的结构性书源——免费、无密钥、稳定，链接指向书的馆藏/借阅页，
 * 国内外通用，不依赖任何国内网盘。对每个抓取关键词查询一次，作为兜底书源并行执行。
 */
import type { NormalizedResource } from "./source";

interface OLDoc {
  key?: string;
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
}

export async function fetchFromOpenLibrary(keyword: string, timeoutMs = 15000): Promise<NormalizedResource[]> {
  const q = String(keyword ?? "").trim();
  if (!q) return [];

  const url =
    "https://openlibrary.org/search.json?q=" +
    encodeURIComponent(q) +
    "&limit=8&fields=key,title,author_name,first_publish_year";

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ac.signal, cache: "no-store" });
    if (!res.ok) return [];
    const data = (await res.json()) as { docs?: OLDoc[] };
    const docs = Array.isArray(data.docs) ? data.docs : [];

    const out: NormalizedResource[] = [];
    const seen = new Set<string>();
    for (const d of docs) {
      if (!d?.key || !d?.title) continue;
      const author = Array.isArray(d.author_name) && d.author_name[0] ? d.author_name[0] : "未知作者";
      const year = typeof d.first_publish_year === "number" ? d.first_publish_year : "";
      const title = `${d.title} — ${author}${year ? ` · ${year}年版` : ""} [国际图书馆藏/电子书]`.slice(0, 200);
      const shareUrl = `https://openlibrary.org${d.key}`;
      if (seen.has(shareUrl)) continue;
      seen.add(shareUrl);
      out.push({
        title,
        description: "来源：Open Library（国际开放图书馆，可在线借阅或跳转各大书店）",
        category: "book",
        pan_type: "other",
        share_url: shareUrl,
        extract_code: null,
        file_size: null,
        source: "openlibrary",
        published_at: null,
      });
    }
    return out;
  } catch {
    return []; // 兜底源失败静默，不影响主流程
  } finally {
    clearTimeout(timer);
  }
}
