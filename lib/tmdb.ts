/**
 * TMDB 影视热度榜集成（方案A）：
 * 5 个视频板块（电视剧/电影/韩剧/美剧/英剧）拉取 TMDB 官方热门榜，
 * 中文标题 + 海报图，结果在 Next.js 数据缓存里放 24 小时（热度不需要分钟级新鲜）。
 * 未配置 TMDB_API_KEY 时返回空榜，页面显示降级提示，不报错。
 */

export interface BoardItem {
  title: string; // 中文名（搜索用）
  original?: string; // 原名
  year?: string; // 年份
  rating?: number; // TMDB 评分
  poster?: string; // 海报相对路径（走 /api/img 代理）
  href: string; // 跳转搜索页链接
}

interface TmdbListResult {
  results?: {
    title?: string;
    name?: string;
    original_title?: string;
    original_name?: string;
    release_date?: string;
    first_air_date?: string;
    vote_average?: number;
    poster_path?: string | null;
  }[];
}

export type VideoSectionKey = "tv" | "movie" | "kr" | "us" | "uk";

/** 视频板块 → TMDB 请求路径（不含 key） */
const SECTION_PATHS: Record<VideoSectionKey, string> = {
  tv: "trending/tv/day",
  movie: "trending/movie/day",
  kr: "discover/tv?with_origin_language=ko&sort_by=popularity.desc&vote_count.gte=50",
  us: "discover/tv?with_origin_country=US&sort_by=popularity.desc&vote_count.gte=50",
  uk: "discover/tv?with_origin_country=GB&sort_by=popularity.desc&vote_count.gte=50",
};

const TMDB_API = "https://api.themoviedb.org/3";
const TTL_SECONDS = 86400; // 每日更新一次

/** 拉取单个视频板块 Top N（中文标题） */
export async function fetchVideoBoard(section: VideoSectionKey, topN = 10): Promise<BoardItem[]> {
  const key = process.env.TMDB_API_KEY;
  if (!key) return [];

  const path = SECTION_PATHS[section];
  const url = `${TMDB_API}/${path}${path.includes("?") ? "&" : "?"}language=zh-CN&api_key=${key}`;

  try {
    const res = await fetch(url, { next: { revalidate: TTL_SECONDS } });
    if (!res.ok) return [];
    const data = (await res.json()) as TmdbListResult;
    const list = data.results ?? [];
    return list
      .filter((it) => (it.title || it.name) && it.poster_path)
      .slice(0, topN)
      .map((it) => {
        const title = (it.title || it.name || "").trim();
        const date = it.release_date || it.first_air_date || "";
        return {
          title,
          original: (it.original_title || it.original_name || "").trim(),
          year: date ? date.slice(0, 4) : undefined,
          rating: it.vote_average ? Math.round(it.vote_average * 10) / 10 : undefined,
          poster: it.poster_path || undefined,
          href: `/search?q=${encodeURIComponent(title)}`,
        };
      });
  } catch {
    // TMDB 不可达/超时：返回空榜，页面降级
    return [];
  }
}

/** 海报图代理地址（解决 image.tmdb.org 大陆访问不稳的问题） */
export function posterUrl(path: string | undefined, size: "w185" | "w342" = "w342"): string | undefined {
  if (!path) return undefined;
  return `/api/img?p=${encodeURIComponent(path)}&s=${size}`;
}
