/** 资源数据类型定义 */

/** 网盘类型 */
export type PanType = "baidu" | "quark" | "xunlei" | "lanzou" | "other";

/** 资源分类 */
export type Category =
  | "tv"        // 电视剧
  | "movie"     // 电影
  | "tvshow"    // 综艺
  | "anime"     // 动漫
  | "novel"     // 小说
  | "comic"     // 漫画
  | "book"      // 书籍
  | "other";    // 其他

/** 资源状态 */
export type ResourceStatus = "active" | "invalid";

/** 资源条目（对应数据库 resources 表） */
export interface Resource {
  id: number;
  title: string;
  description: string | null;
  category: Category;
  pan_type: PanType;
  share_url: string;
  extract_code: string | null;
  file_size: number | null; // 字节
  status: ResourceStatus;
  source: string | null;
  last_checked_at: string | null;
  created_at: string;
  updated_at: string;
}

/** 搜索参数（与 SQL 函数 search_resources 的入参一一对应） */
export interface SearchParams {
  q?: string;                       // 搜索关键词
  category?: string;                // 资源类型
  pan?: string;                     // 网盘类型
  status?: string;                  // active / invalid / all
  days?: number;                    // 最近 N 天，0 表示全部
  size?: string;                    // lt1 / 1_10 / gt10
  sort?: "time" | "size_desc" | "size_asc";
  page?: number;
  per?: number;
}

/** 搜索结果 */
export interface SearchResult {
  rows: Resource[];
  total: number;
  page: number;
  per: number;
  demo: boolean; // 是否为演示模式数据
}
