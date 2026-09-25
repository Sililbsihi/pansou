/** 资源卡片：标题 + 徽章（类型/网盘/状态）+ 元信息 + 操作 */
import type { Resource } from "@/lib/types";
import { categoryLabel, panLabel, formatSize, timeAgo } from "@/lib/meta";
import CardActions from "./CardActions";

/** 分类徽章配色 */
const CAT_COLORS: Record<string, string> = {
  tv: "bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300",
  movie: "bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300",
  tvshow: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  anime: "bg-pink-100 text-pink-700 dark:bg-pink-900/50 dark:text-pink-300",
  novel: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300",
  comic: "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300",
  book: "bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300",
  other: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

/** 网盘徽章配色 */
const PAN_COLORS: Record<string, string> = {
  baidu: "bg-blue-50 text-blue-600 ring-1 ring-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:ring-blue-800",
  quark: "bg-rose-50 text-rose-600 ring-1 ring-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:ring-rose-800",
  xunlei: "bg-indigo-50 text-indigo-600 ring-1 ring-indigo-200 dark:bg-indigo-950 dark:text-indigo-300 dark:ring-indigo-800",
  lanzou: "bg-lime-50 text-lime-600 ring-1 ring-lime-200 dark:bg-lime-950 dark:text-lime-300 dark:ring-lime-800",
  other: "bg-slate-50 text-slate-500 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700",
};

export default function ResourceCard({ r, demo }: { r: Resource; demo: boolean }) {
  const invalid = r.status === "invalid";
  return (
    <div className={`flex flex-col gap-3 rounded-xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:bg-slate-800 ${
      invalid ? "border-slate-200 opacity-70 dark:border-slate-700" : "border-slate-200 dark:border-slate-700"
    }`}>
      {/* 标题 */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-slate-900 dark:text-slate-50" title={r.title}>
          {r.title}
        </h3>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
          invalid
            ? "bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-400"
            : "bg-green-100 text-green-700 dark:bg-green-900/60 dark:text-green-300"
        }`}>
          {invalid ? "已失效" : "有效"}
        </span>
      </div>

      {/* 徽章行 */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${CAT_COLORS[r.category] ?? CAT_COLORS.other}`}>
          {categoryLabel(r.category)}
        </span>
        <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${PAN_COLORS[r.pan_type] ?? PAN_COLORS.other}`}>
          {panLabel(r.pan_type)}
        </span>
        <span className="text-xs text-slate-400">{formatSize(r.file_size)}</span>
      </div>

      {/* 元信息 + 操作 */}
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-700">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span>更新 {timeAgo(r.updated_at)}</span>
        </div>
        <CardActions id={r.id} url={r.share_url} demo={demo} />
      </div>

      {/* 打开资源：失效资源渲染为不可点击的占位（服务端组件不能挂 onClick） */}
      {invalid ? (
        <span className="block cursor-not-allowed rounded-lg bg-slate-100 py-2 text-center text-sm font-medium text-slate-400 dark:bg-slate-700 dark:text-slate-500">
          链接已失效
        </span>
      ) : (
        <a
          href={r.share_url}
          target="_blank"
          rel="nofollow noopener noreferrer"
          className="block rounded-lg bg-primary-600 py-2 text-center text-sm font-medium text-white transition-colors hover:bg-primary-700"
        >
          打开资源
          {r.extract_code ? <span className="ml-1 font-normal opacity-80">· 提取码 {r.extract_code}</span> : null}
        </a>
      )}
    </div>
  );
}
