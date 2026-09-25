/** 分类 / 网盘 / 筛选条件的展示元数据，全站统一从这里取 */
import type { Category, PanType } from "./types";

/** 资源分类元数据 */
export const CATEGORIES: { value: Category; label: string }[] = [
  { value: "tv", label: "电视剧" },
  { value: "movie", label: "电影" },
  { value: "tvshow", label: "综艺" },
  { value: "anime", label: "动漫" },
  { value: "novel", label: "小说" },
  { value: "comic", label: "漫画" },
  { value: "book", label: "书籍" },
  { value: "other", label: "其他" },
];

/** 网盘类型元数据 */
export const PAN_TYPES: { value: PanType; label: string }[] = [
  { value: "baidu", label: "百度网盘" },
  { value: "quark", label: "夸克网盘" },
  { value: "xunlei", label: "迅雷网盘" },
  { value: "lanzou", label: "蓝奏云" },
  { value: "other", label: "其他网盘" },
];

/** 根据值取分类中文名 */
export function categoryLabel(value: string): string {
  return CATEGORIES.find((c) => c.value === value)?.label ?? "其他";
}

/** 根据值取网盘中文名 */
export function panLabel(value: string): string {
  return PAN_TYPES.find((p) => p.value === value)?.label ?? "其他网盘";
}

/**
 * 通过分享链接识别网盘类型（比上游 API 的 type 字段更可靠）
 */
export function detectPanType(url: string): PanType {
  const u = url.toLowerCase();
  if (u.includes("pan.baidu.com")) return "baidu";
  if (u.includes("pan.quark.cn") || u.includes("drive.quark.cn")) return "quark";
  if (u.includes("pan.xunlei.com") || u.includes("xluser-1251081182")) return "xunlei";
  // 蓝奏云域名众多：lanzou*.com / lanzn.com / lanzoui.com / lanzv.com 等
  if (/lanz[ou][a-z]?[a-z]?\.(com|net|cc|me|org|vip|la|site|xyz|top|icu)/.test(u)) return "lanzou";
  return "other";
}

/**
 * 根据标题自动推断资源分类（按命中率从高到低的规则依次匹配）
 */
export function classifyCategory(title: string): Category {
  const t = title.toLowerCase();
  const has = (...words: string[]) => words.some((w) => t.includes(w));

  if (has("漫画", "汉化", "画集", "cbz", "cbr")) return "comic";
  if (has("小说", "epub", "mobi", "azw3", "txt全集", "文集")) return "novel";
  if (has("动漫", "番剧", "动画", "ova", "剧场版")) return "anime";
  if (has("综艺", "演唱会", "晚会", "花絮", "真人秀")) return "tvshow";
  if (has("电视剧", "剧集", "全集合集", "更新至", "全1-") || /第\s*[0-9一二三四五六七八九十百]+\s*季/.test(t)) return "tv";
  if (has("pdf", "电子书", "教程", "图书", "书籍", "考研", "教材")) return "book";
  if (has("4k", "1080p", "2160p", "蓝光", "hdr", "杜比", "remux", "电影", "国配", "中字")) return "movie";
  return "other";
}

/**
 * 从标题/描述中解析文件大小（很多分享标题自带大小，如“4.3GB”）
 */
export function parseFileSize(text: string): number | null {
  const m = text.match(/(\d+(?:\.\d+)?)\s*(TB|GB|MB|KB|T|G|M|K)\b/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const unit = m[2].toUpperCase();
  // 注意：不能用位运算 1<<40（JS 位运算是 32 位，会溢出成 256），必须用幂运算
  const map: Record<string, number> = { TB: 1024 ** 4, T: 1024 ** 4, GB: 1024 ** 3, G: 1024 ** 3, MB: 1024 ** 2, M: 1024 ** 2, KB: 1024, K: 1024 };
  return Math.round(n * (map[unit] ?? 0)) || null;
}

/** 字节数转可读大小 */
export function formatSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "未知大小";
  if (bytes >= 1024 ** 4) return (bytes / 1024 ** 4).toFixed(2) + " TB";
  if (bytes >= 1024 ** 3) return (bytes / 1024 ** 3).toFixed(1) + " GB";
  if (bytes >= 1024 ** 2) return (bytes / 1024 ** 2).toFixed(0) + " MB";
  return bytes + " B";
}

/** ISO 时间转“多久之前” */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "未知";
  const diff = Date.now() - new Date(iso).getTime();
  if (isNaN(diff) || diff < 0) return "刚刚";
  const min = Math.floor(diff / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} 小时前`;
  const day = Math.floor(hour / 24);
  if (day < 30) return `${day} 天前`;
  const month = Math.floor(day / 30);
  if (month < 12) return `${month} 个月前`;
  return `${Math.floor(month / 12)} 年前`;
}

/** 文件大小筛选档位（UI 展示与 search_resources 的区间参数对应） */
export const SIZE_FILTERS = [
  { value: "", label: "全部大小" },
  { value: "lt1", label: "1GB 以内" },
  { value: "1_10", label: "1-10GB" },
  { value: "gt10", label: "10GB 以上" },
] as const;

/** 时间筛选档位 */
export const TIME_FILTERS = [
  { value: "0", label: "全部时间" },
  { value: "1", label: "今天" },
  { value: "3", label: "近 3 天" },
  { value: "7", label: "近 7 天" },
  { value: "30", label: "近 30 天" },
] as const;

/** 排序档位 */
export const SORT_OPTIONS = [
  { value: "time", label: "最新更新" },
  { value: "size_desc", label: "大小从大到小" },
  { value: "size_asc", label: "大小从小到大" },
] as const;
