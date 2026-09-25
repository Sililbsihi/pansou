/** 首页：大搜索框 + 热搜词 + 分类入口 + 最新收录 */
import Link from "next/link";
import SearchBox from "@/components/SearchBox";
import ResourceCard from "@/components/ResourceCard";
import { searchResources, getHotKeywords } from "@/lib/search";
import { CATEGORIES } from "@/lib/meta";

// 每次访问都取最新数据（本站数据由每日任务刷新）
export const dynamic = "force-dynamic";

export default async function HomePage() {
  // 并行取：最新 12 条 + 热搜词
  const [latest, hot] = await Promise.all([
    searchResources({ sort: "time", per: 12, page: 1 }),
    getHotKeywords(10),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4">
      {/* 演示模式提示：接入 Supabase 与数据源后自动消失 */}
      {latest.demo ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
          演示模式：当前展示内置示例数据，配置 Supabase 与资源 API 后自动切换为真实数据
        </div>
      ) : null}

      {/* 搜索区 */}
      <section className="flex flex-col items-center py-14 sm:py-20">
        <h1 className="text-center text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl dark:text-white">
          全网网盘资源搜索
        </h1>
        <p className="mt-3 text-center text-sm text-slate-500 sm:text-base dark:text-slate-400">
          电视剧 · 电影 · 小说 · 漫画 · 书籍｜百度网盘 / 夸克 / 迅雷 / 蓝奏云｜失效状态每日检测
        </p>

        <div className="mt-8 w-full max-w-2xl">
          <SearchBox size="lg" />
        </div>

        {/* 热搜词 */}
        <div className="mt-5 flex max-w-2xl flex-wrap items-center justify-center gap-2">
          <span className="text-xs text-slate-400">热搜：</span>
          {hot.words.map((w) => (
            <Link
              key={w}
              href={`/search?q=${encodeURIComponent(w)}`}
              className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600 transition-colors hover:bg-primary-100 hover:text-primary-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-primary-900/40 dark:hover:text-primary-300"
            >
              {w}
            </Link>
          ))}
        </div>

        {/* 分类入口 */}
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          {CATEGORIES.map((c) => (
            <Link
              key={c.value}
              href={`/search?cat=${c.value}`}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-primary-400 hover:text-primary-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-primary-500 dark:hover:text-primary-300"
            >
              {c.label}
            </Link>
          ))}
        </div>
      </section>

      {/* 最新收录 */}
      <section className="pb-12">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            最新收录
            <span className="ml-2 text-xs font-normal text-slate-400">每日更新</span>
          </h2>
          <Link href="/search" className="text-sm font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400">
            查看全部 →
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {latest.rows.map((r) => (
            <ResourceCard key={r.id} r={r} demo={latest.demo} />
          ))}
        </div>
        {latest.rows.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-400">暂无收录资源，等待每日任务抓取</p>
        ) : null}
      </section>
    </div>
  );
}
