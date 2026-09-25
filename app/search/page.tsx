/** 搜索结果页：筛选条 + 结果卡片 + 分页（服务端渲染，URL 驱动，可分享可回退） */
import type { Metadata } from "next";
import SearchBox from "@/components/SearchBox";
import ResourceCard from "@/components/ResourceCard";
import FilterBar, { parseFilters } from "@/components/FilterBar";
import Pagination from "@/components/Pagination";
import { searchResources, logSearch } from "@/lib/search";
import type { SearchParams } from "@/lib/types";

export const dynamic = "force-dynamic";

const PER_PAGE = 20;

interface Props {
  searchParams: Record<string, string | string[] | undefined>;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const q = typeof searchParams.q === "string" ? searchParams.q : "";
  return {
    title: q ? `「${q}」的网盘资源搜索结果` : "网盘资源搜索",
    description: q ? `搜索「${q}」相关的百度网盘、夸克、迅雷、蓝奏云资源，含有效性状态、文件大小与更新时间。` : undefined,
  };
}

export default async function SearchPage({ searchParams }: Props) {
  const filters = parseFilters(searchParams);
  const page = Math.max(1, parseInt(typeof searchParams.page === "string" ? searchParams.page : "1", 10) || 1);

  // URL 参数 → 搜索参数（天数字符串转数字，排序做类型收窄）
  const result = await searchResources({
    q: filters.q,
    category: filters.cat,
    pan: filters.pan,
    status: filters.st,
    days: filters.d ? parseInt(filters.d, 10) || 0 : 0,
    size: filters.sz,
    sort: (filters.sort as SearchParams["sort"]) || "time",
    page,
    per: PER_PAGE,
  });

  // 记录热搜词（异步，不阻塞渲染；仅有关键词且第一页时记录）
  if (filters.q && page === 1) {
    void logSearch(filters.q);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {/* 顶部搜索条 */}
      <div className="sticky top-14 z-30 -mx-4 mb-4 border-b border-slate-200/80 bg-slate-50/95 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <div className="max-w-2xl">
          <SearchBox initial={filters.q} size="sm" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[240px_1fr]">
        {/* 侧栏筛选 */}
        <aside className="lg:sticky lg:top-32 lg:self-start">
          <FilterBar filters={filters} />
        </aside>

        {/* 结果区 */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {filters.q ? (
                <>
                  「<span className="font-medium text-slate-900 dark:text-white">{filters.q}</span>」共找到{" "}
                  <span className="font-semibold text-primary-600 dark:text-primary-400">{result.total}</span> 条资源
                </>
              ) : (
                <>
                  全部资源 <span className="font-semibold text-primary-600 dark:text-primary-400">{result.total}</span> 条
                </>
              )}
            </p>
          </div>

          {result.rows.length > 0 ? (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {result.rows.map((r) => (
                  <ResourceCard key={r.id} r={r} demo={result.demo} />
                ))}
              </div>
              <Pagination filters={filters} page={result.page} total={result.total} per={result.per} />
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 py-16 text-center dark:border-slate-700">
              <p className="text-4xl">🔍</p>
              <p className="mt-3 text-sm font-medium text-slate-600 dark:text-slate-300">没有找到相关资源</p>
              <p className="mt-1 text-xs text-slate-400">换个关键词试试，或放宽筛选条件；资源库每日更新，明天再来看看</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
