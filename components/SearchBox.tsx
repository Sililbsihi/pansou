"use client";
/** 搜索框：纯 HTML 表单提交到 /search，无 JS 也能用 */
export default function SearchBox({ initial = "", size = "lg" }: { initial?: string; size?: "lg" | "sm" }) {
  const isLg = size === "lg";
  return (
    <form action="/search" method="GET" className="flex w-full items-stretch gap-2">
      <div className="relative flex-1">
        <input
          type="search"
          name="q"
          defaultValue={initial}
          placeholder="搜索影视、小说、漫画、书籍资源…"
          maxLength={50}
          className={`w-full rounded-xl border border-slate-300 bg-white pr-4 text-slate-900 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 ${
            isLg ? "pl-11 py-3.5 text-base" : "pl-10 py-2 text-sm"
          }`}
        />
        <svg className={`absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 ${isLg ? "size-5" : "size-4"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z" />
        </svg>
      </div>
      <button
        type="submit"
        className={`rounded-xl bg-primary-600 font-medium text-white transition-colors hover:bg-primary-700 ${
          isLg ? "px-6 text-base" : "px-4 text-sm"
        }`}
      >
        搜索
      </button>
    </form>
  );
}
