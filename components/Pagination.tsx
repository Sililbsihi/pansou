/** 分页：保留全部筛选参数 */
import Link from "next/link";
import { buildFilterUrl, type FilterState } from "./FilterBar";

/** 生成带页码的结果页链接（buildFilterUrl 不含 page，在此追加） */
function pageUrl(filters: FilterState, page: number): string {
  const base = buildFilterUrl(filters, {});
  return base + (base.includes("?") ? "&" : "?") + "page=" + page;
}

export default function Pagination({ filters, page, total, per }: { filters: FilterState; page: number; total: number; per: number }) {
  const pages = Math.max(1, Math.ceil(total / per));
  if (pages <= 1) return null;

  // 页码窗口：当前页前后各 2 页 + 首末页
  const nums: (number | "…")[] = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - page) <= 2) nums.push(i);
    else if (nums[nums.length - 1] !== "…") nums.push("…");
  }

  const itemCls = (active: boolean) =>
    `inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-2.5 text-sm font-medium transition-colors ${
      active
        ? "bg-primary-600 text-white"
        : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
    }`;

  return (
    <nav className="flex flex-wrap items-center justify-center gap-1.5 py-4" aria-label="分页">
      {page > 1 ? (
        <Link href={pageUrl(filters, page - 1)} className={itemCls(false)} rel="prev">
          上一页
        </Link>
      ) : null}
      {nums.map((n, i) =>
        n === "…" ? (
          <span key={`e${i}`} className="px-1 text-slate-400">…</span>
        ) : (
          <Link key={n} href={pageUrl(filters, n)} className={itemCls(n === page)}>
            {n}
          </Link>
        )
      )}
      {page < pages ? (
        <Link href={pageUrl(filters, page + 1)} className={itemCls(false)} rel="next">
          下一页
        </Link>
      ) : null}
    </nav>
  );
}
