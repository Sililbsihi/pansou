/**
 * 热门榜单页（/boards）：
 * 8 大板块（电视剧/电影/韩剧/美剧/英剧/漫画/小说/广播剧）。
 * 视频板块数据源 TMDB 热门榜（24h 缓存，海报走站内代理）；
 * 漫画/小说/广播剧为精选榜单。点击任意条目 → 该名称的搜索结果页。
 */
import type { Metadata } from "next";
import Link from "next/link";
import { SECTIONS, curatedItems, type SectionDef } from "@/lib/boards";
import { fetchVideoBoard, posterUrl, type BoardItem, type VideoSectionKey } from "@/lib/tmdb";
import SearchBox from "@/components/SearchBox";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "热门榜单 - 电视剧/电影/韩剧/美剧/英剧/漫画/小说/广播剧",
  description: "八大板块热门排行榜：点任意片名直达网盘资源搜索结果。",
};

function ItemRow({ item, rank }: { item: BoardItem; rank: number }) {
  const poster = posterUrl(item.poster, "w185");
  return (
    <Link
      href={item.href}
      className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-2.5 transition-colors hover:border-primary-400 hover:bg-primary-50/40 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-primary-500 dark:hover:bg-slate-700/60"
    >
      <span className={`w-6 shrink-0 text-center text-sm font-bold ${rank <= 3 ? "text-primary-600 dark:text-primary-400" : "text-slate-400"}`}>
        {rank}
      </span>
      {poster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={poster} alt={item.title} loading="lazy" className="h-16 w-11 shrink-0 rounded-md object-cover" />
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-slate-900 dark:text-slate-100">{item.title}</span>
        <span className="mt-0.5 block text-xs text-slate-400">
          {[item.year, item.rating ? `⭐ ${item.rating}` : null].filter(Boolean).join(" · ") || "点击搜索资源"}
        </span>
      </span>
      <span className="shrink-0 text-xs text-primary-600 dark:text-primary-400">搜资源 →</span>
    </Link>
  );
}

function SectionBlock({ sec, items, tmdbUnavailable }: { sec: SectionDef; items: BoardItem[]; tmdbUnavailable: boolean }) {
  const [first, ...rest] = items;
  const firstPoster = posterUrl(first?.poster, "w342");
  return (
    <section id={`sec-${sec.key}`} className="scroll-mt-20">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">{sec.name}</h2>
        <span className="text-xs text-slate-400">
          {sec.source === "tmdb" ? "数据源：TMDB 热门榜 · 每日更新" : "精选榜单 · 点片名直接搜资源"}
        </span>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          {tmdbUnavailable
            ? "榜单数据暂不可用（需在 Vercel 配置 TMDB_API_KEY）。你仍可直接在上方搜索框搜索片名。"
            : "榜单暂无数据，稍后再来看看。"}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          {/* 榜首：大图卡片 */}
          <Link
            href={first.href}
            className="group flex gap-4 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 transition-colors hover:border-primary-400 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-primary-500"
          >
            {firstPoster ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={firstPoster} alt={first.title} className="h-48 w-32 shrink-0 rounded-lg object-cover" />
            ) : (
              <span className="flex h-48 w-32 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 text-4xl font-bold text-white">
                {first.title.slice(0, 1)}
              </span>
            )}
            <span className="flex min-w-0 flex-col justify-center">
              <span className="text-xs font-semibold uppercase tracking-wider text-primary-600 dark:text-primary-400">TOP 1</span>
              <span className="mt-1 truncate text-xl font-bold text-slate-900 dark:text-slate-50 group-hover:text-primary-700 dark:group-hover:text-primary-300">
                {first.title}
              </span>
              <span className="mt-1 text-sm text-slate-400">
                {[first.original !== first.title ? first.original : null, first.year, first.rating ? `⭐ ${first.rating}` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              <span className="mt-3 inline-flex w-fit items-center gap-1 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white transition-colors group-hover:bg-primary-700">
                搜索这个的资源 →
              </span>
            </span>
          </Link>

          {/* 2~10 名紧凑列表 */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {rest.map((it, i) => (
              <ItemRow key={`${it.title}-${i}`} item={it} rank={i + 2} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export default async function BoardsPage() {
  const videoSections = SECTIONS.filter((s) => s.source === "tmdb");
  const curatedSections = SECTIONS.filter((s) => s.source === "curated");

  const tmdbResults = await Promise.all(
    videoSections.map(async (sec) => ({
      sec,
      items: await fetchVideoBoard(sec.key as VideoSectionKey, 10),
    }))
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* 复用站点顶栏 */}
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">热门榜单</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            八大板块热度排行，点任意片名直达搜索结果页，选你想要的资源。
          </p>
        </div>

        <div className="mb-8">
          <SearchBox size="sm" />
        </div>

        {/* 板块导航 */}
        <nav className="mb-8 flex flex-wrap gap-2">
          {SECTIONS.map((s) => (
            <a
              key={s.key}
              href={`#sec-${s.key}`}
              className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:border-primary-400 hover:text-primary-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:text-primary-300"
            >
              {s.name}
            </a>
          ))}
        </nav>

        <div className="space-y-10">
          {tmdbResults.map(({ sec, items }) => (
            <SectionBlock key={sec.key} sec={sec} items={items} tmdbUnavailable />
          ))}
          {curatedSections.map((sec) => (
            <SectionBlock
              key={sec.key}
              sec={sec}
              items={curatedItems(sec).map((it) => ({ ...it, title: it.title }))}
              tmdbUnavailable={false}
            />
          ))}
        </div>
      </main>
    </div>
  );
}
